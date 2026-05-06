#!/usr/bin/env node
// BehalfID — Deterministic permission draft self-check
// Tests the post-processing logic against known bad Ollama outputs.
// Usage: node scripts/check-permission-draft.js

"use strict";

// ── Mirror of route.ts analysis + correction logic ────────────────────────────

const BROAD_ACCESS_PATTERNS = [
  /full\s+access/i, /access\s+to\s+everything/i, /\beverything\b/i,
  /do\s+whatever/i, /whatever\s+it\s+needs/i, /unrestricted/i,
  /all\s+accounts/i, /admin\s+access/i, /anything\s+it\s+wants/i,
];
const BROWSE_WEB_PATTERNS = [
  /browse\s+(?:the\s+)?web/i, /search\s+(?:the\s+)?web/i,
  /summarize\s+public\s+pages/i, /\bpublic\s+pages\b/i,
  /compare\s+products/i, /research\s+(?:the\s+)?web/i,
];
const PRODUCT_COMPARISON_PATTERNS = [
  /compare\s+products/i, /compare\s+prices/i, /product\s+comparison/i,
];
const PURCHASE_POSITIVE_PATTERNS = [
  /\bmake\s+purchases?/i, /\bplace\s+(?:an\s+)?orders?\b/i,
  /\brequest\s+purchases?/i,
  /\bpurchases?\s+under\b/i,
  /\bask\s+before\s+(?:buy|purchas)/i,
];
const CONDITIONAL_PURCHASE_PATTERNS = [
  /\bbuy\b[^.;!?]*\bwithout\b[^.;!?]*\b(?:my\s+)?approv/i,
  /\bpurchas[^.;!?]*\bwithout\b[^.;!?]*\b(?:my\s+)?approv/i,
];
const EXPLICIT_APPROVAL_PATTERNS = [
  /only\s+after\s+i\s+approve/i, /after\s+i\s+approve/i,
  /ask\s+before\s+purchas/i, /with\s+my\s+approval/i,
  /only\s+with\s+my\s+approval/i,
];

function withoutNegations(text) {
  return text.replace(/\bdo\s+not\b[^.;!?]*/gi, "");
}

function analyzeDescription(description) {
  const d = description;
  const positive = withoutNegations(d);
  const hasBroadAccess      = BROAD_ACCESS_PATTERNS.some((p) => p.test(d));
  const hasBrowseWebIntent  = BROWSE_WEB_PATTERNS.some((p) => p.test(d));
  const hasProductComparison = PRODUCT_COMPARISON_PATTERNS.some((p) => p.test(d));
  const hasExplicitApproval = EXPLICIT_APPROVAL_PATTERNS.some((p) => p.test(d));
  const hasConditionalPurchaseIntent = CONDITIONAL_PURCHASE_PATTERNS.some((p) => p.test(d));
  const hasPurchaseIntent   = PURCHASE_POSITIVE_PATTERNS.some((p) => p.test(positive)) || hasConditionalPurchaseIntent;
  let spendingLimit = null;
  const dollarMatch = d.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollarMatch) spendingLimit = parseFloat(dollarMatch[1]);
  else {
    const wm = d.match(/(\d+(?:\.\d+)?)\s+dollars?/i);
    if (wm) spendingLimit = parseFloat(wm[1]);
  }
  const hasExplicitFormBlock     = /do\s+not\b[^.;!?]*\bsubmit\s+forms?/i.test(d);
  const hasExplicitLoginBlock    = /do\s+not\b[^.;!?]*\blog\s+in\b/i.test(d);
  const hasExplicitPurchaseBlock = /do\s+not\b[^.;!?]*\bbuy\b/i.test(d) ||
                                   /do\s+not\b[^.;!?]*\bpurchas/i.test(d);
  return { hasBroadAccess, hasBrowseWebIntent, hasProductComparison, hasPurchaseIntent,
           hasExplicitApproval, spendingLimit, hasExplicitFormBlock, hasExplicitLoginBlock,
           hasExplicitPurchaseBlock };
}

function normalizeAction(action) {
  const a = action.toLowerCase().trim();
  if (/^(browse[_\s]?web|web[_\s]?browsing?|search[_\s]?web|web[_\s]?search)$/.test(a)) return "browse_web";
  if (/^(purchas(?:e|ing)?|buy(?:ing)?|order(?:ing)?)$/.test(a)) return "purchase";
  return a.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || action;
}

const BROAD_ACTION_NAMES = new Set(["full_access", "admin_access", "unrestricted_access", "all_access"]);

function isBroadPermission(perm) {
  if (BROAD_ACTION_NAMES.has(perm.action)) return true;
  const allowedText = perm.allowedActions.join(" ").toLowerCase();
  return /full\s+access|access\s+to\s+everything|unrestricted|do\s+whatever|anything\s+it\s+wants/.test(allowedText);
}

function makeBrowseWebPermission(hasProductComparison) {
  const allowedActions = [
    "search web",
    "read public pages",
    "summarize public pages",
    ...(hasProductComparison ? ["compare products"] : []),
    "extract structured data",
  ];
  return {
    action: "browse_web", resource: "web",
    allowedActions,
    blockedActions: ["submit forms", "log in to accounts", "save payment information", "make purchases"],
    requiresApproval: false, status: "active", riskLevel: "medium",
    reason: hasProductComparison
      ? "Permission drafted from web browsing, product comparison, and public-page summary request."
      : "Permission drafted from web browsing and public-page summary request.",
  };
}

function makePurchasePermission(analysis) {
  const constraints = analysis.spendingLimit !== null
    ? { maxAmount: analysis.spendingLimit, expiresAt: null } : undefined;
  return {
    action: "purchase", resource: "commerce",
    allowedActions: ["request purchase under approved limit", "make purchase only after user approval"],
    blockedActions: ["purchase above spending limit", "purchase without user approval", "save payment credentials", "start recurring subscriptions", "use unapproved vendors"],
    requiresApproval: true, status: "active", constraints, riskLevel: "high",
    reason: "Purchases are high-risk and require user approval.",
  };
}

const ACTION_NORMALIZATIONS = [
  [/^browse[_\s]?web$/i, null],
  [/^log[_\s]?in$/i, "log in to accounts"],
  [/^login$/i, "log in to accounts"],
  [/^submit[_\s]forms?$/i, "submit forms"],
  [/^save[_\s]payment[_\s]info(?:rmation)?$/i, "save payment information"],
  [/^(make[_\s]?)?purchases?$/i, "make purchases"],
  [/^buy[_\s]?anything$/i, "make purchases"],
  [/^(?:purchase|buy)[_\s]?without[_\s]?(?:explicit[_\s]?)?approval$/i, "purchase without user approval"],
  [/under\s*\$?\d+/i, null],
  [/\$\d+/i, null],
];

function normalizeActionString(str) {
  const t = str.trim();
  for (const [pattern, replacement] of ACTION_NORMALIZATIONS) {
    if (pattern.test(t)) return replacement;
  }
  return t;
}

function normalizeActionStrings(actions) {
  const seen = new Set();
  const result = [];
  for (const a of actions) {
    const normalized = normalizeActionString(a);
    if (normalized === null) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(normalized); }
  }
  return result;
}

function canHandleDeterministically(analysis) {
  return analysis.hasBrowseWebIntent || analysis.hasPurchaseIntent || analysis.hasBroadAccess;
}

function buildDeterministicDraft(analysis, provider, description) {
  const permissions = [];
  if (analysis.hasBrowseWebIntent) permissions.push(makeBrowseWebPermission(analysis.hasProductComparison));
  if (analysis.hasPurchaseIntent)  permissions.push(makePurchasePermission(analysis));
  return { agentDraft: { provider, description }, permissions, needsClarification: [], warnings: [], limitations: [] };
}

function deduplicatePermissions(permissions) {
  const seen = new Set();
  return permissions.filter((p) => {
    const key = `${p.action}::${p.resource}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyDeterministicCorrections(draft, analysis) {
  const permissions = draft.permissions
    .map((p) => ({
      ...p,
      action: normalizeAction(p.action),
      allowedActions: normalizeActionStrings(p.allowedActions),
      blockedActions: normalizeActionStrings(p.blockedActions),
    }))
    .filter((p) => !isBroadPermission(p));

  const needsClarification = [...draft.needsClarification];
  const warnings = [...draft.warnings];
  const limitations = [...draft.limitations];

  if (analysis.hasBroadAccess) {
    const alreadyFlagged = needsClarification.some(
      (c) => /broad|full.access|everything|unrestricted/i.test(c.question + c.reason),
    );
    if (!alreadyFlagged) {
      needsClarification.unshift({
        question: "Your description includes broad access language. Specify exact actions and resources instead of granting full access.",
        reason: 'Phrases like "full access", "everything", or "do whatever it needs" cannot be safely encoded as a permission. List the specific actions you want.',
      });
    }
  }

  if (analysis.hasBrowseWebIntent) {
    const existing = permissions.find((p) => p.action === "browse_web");
    if (!existing) {
      permissions.push(makeBrowseWebPermission(analysis.hasProductComparison));
    } else {
      // Replace with canonical action strings — model output is too raw
      const canonical = makeBrowseWebPermission(analysis.hasProductComparison);
      existing.allowedActions = [...canonical.allowedActions];
      existing.blockedActions = [...canonical.blockedActions];
      existing.riskLevel = "medium";
      existing.reason = canonical.reason;
      // Merge any extra explicit blocks not already in canonical
      const mustBlock = [
        [analysis.hasExplicitFormBlock, "submit forms"],
        [analysis.hasExplicitLoginBlock, "log in to accounts"],
        [analysis.hasExplicitPurchaseBlock, "make purchases"],
      ];
      for (const [should, phrase] of mustBlock) {
        if (should && !existing.blockedActions.some((a) => a.toLowerCase().includes(phrase.split(" ")[0]))) {
          existing.blockedActions.push(phrase);
        }
      }
    }
  }

  // Harden browse_web: never approval-gated, never carries purchase constraints
  const browseWebPerm = permissions.find((p) => p.action === "browse_web");
  if (browseWebPerm) {
    browseWebPerm.requiresApproval = false;
    if (browseWebPerm.constraints) {
      browseWebPerm.constraints = browseWebPerm.constraints.allowedVendors?.length
        ? { allowedVendors: browseWebPerm.constraints.allowedVendors, expiresAt: null }
        : undefined;
    }
  }

  if (analysis.hasPurchaseIntent) {
    const existing = permissions.find((p) => p.action === "purchase");
    if (!existing) {
      permissions.push(makePurchasePermission(analysis));
    } else {
      // Replace with canonical action strings — model output is too raw
      const canonical = makePurchasePermission(analysis);
      existing.allowedActions = [...canonical.allowedActions];
      existing.blockedActions = [...canonical.blockedActions];
      existing.requiresApproval = true;
      existing.riskLevel = "high";
      existing.reason = canonical.reason;
      if (analysis.spendingLimit !== null) {
        if (!existing.constraints) existing.constraints = { maxAmount: analysis.spendingLimit, expiresAt: null };
        else if (!existing.constraints.maxAmount) existing.constraints.maxAmount = analysis.spendingLimit;
      }
    }
    if (analysis.spendingLimit === null && !limitations.some((l) => /spend|limit|amount/i.test(l))) {
      limitations.push("Specify a spending limit before enabling purchases.");
    }
  }

  const filteredClarifications = needsClarification.filter((item) => {
    const q = (item.question + " " + item.reason).toLowerCase();
    if (analysis.hasExplicitApproval && /approv/i.test(q) && /purchas|buy/i.test(q)) return false;
    if (analysis.spendingLimit !== null && /spend|limit|amount/i.test(q)) return false;
    return true;
  });

  const isSpendingFalseNegative = (s) =>
    /spend|limit|amount/i.test(s) && /no|not|infer|assum|provid/i.test(s);
  const filteredLimitations = analysis.spendingLimit !== null
    ? limitations.filter((l) => !isSpendingFalseNegative(l)) : limitations;

  // Remove warnings that falsely imply spending without approval when purchase requires approval
  const purchasePerm = permissions.find((p) => p.action === "purchase");
  const purchaseRequiresApproval = purchasePerm?.requiresApproval === true;
  let filteredWarnings = analysis.spendingLimit !== null
    ? warnings.filter((w) => !isSpendingFalseNegative(w)) : warnings;
  if (purchaseRequiresApproval) {
    filteredWarnings = filteredWarnings.filter((w) => {
      const wl = w.toLowerCase();
      return !(
        (wl.includes("without") && wl.includes("approv")) ||
        wl.includes("can potentially spend") ||
        wl.includes("spend money without") ||
        wl.includes("without explicit approval")
      );
    });
  }

  return {
    ...draft,
    permissions: deduplicatePermissions(permissions),
    needsClarification: filteredClarifications,
    warnings: filteredWarnings,
    limitations: filteredLimitations,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}${detail ? `\n      → ${detail}` : ""}`);
    failed++;
  }
}

function runTest(title, description, badOllamaOutput, assertions) {
  console.log(`${BOLD}${title}${RESET}`);
  console.log(`${DIM}${description.slice(0, 120)}…${RESET}\n`);
  const analysis = analyzeDescription(description);
  const corrected = applyDeterministicCorrections(badOllamaOutput, analysis);
  assertions(corrected, analysis);
  console.log();
}

// ── Test 1: original bad prompt (broad access + make purchases) ───────────────

runTest(
  "Test 1 — Broad access + make purchases + $25 limit",
  "Browse the web and summarize public pages, but do not submit forms, log in, or buy anything. " +
  "Compare products and make purchases under $25 only after I approve them. " +
  "Give this assistant full access to everything and let it do whatever it needs.",
  {
    agentDraft: { provider: "", description: "Web and purchase agent." },
    permissions: [
      {
        action: "browse_web", resource: "web",
        allowedActions: ["search web", "summarize pages"],
        blockedActions: ["submit forms"],
        requiresApproval: false, status: "active", riskLevel: "low", reason: "Browsing.",
      }
    ],
    needsClarification: [
      { question: "Can the assistant make purchases under $25 without your prior approval?", reason: "The description requires approval but the limit suggests automatic approval may be intended." },
      { question: "What is the maximum spending limit?", reason: "No explicit limit was mentioned." },
    ],
    warnings: [],
    limitations: ["The assistant did not specify a spending limit."],
  },
  (corrected, analysis) => {
    const bw = corrected.permissions.find((p) => p.action === "browse_web");
    const pu = corrected.permissions.find((p) => p.action === "purchase");
    assert("hasBroadAccess is true",          analysis.hasBroadAccess);
    assert("hasPurchaseIntent is true",        analysis.hasPurchaseIntent);
    assert("spendingLimit is 25",              analysis.spendingLimit === 25, `got ${analysis.spendingLimit}`);
    assert("needsClarification has broad-access warning", corrected.needsClarification.some((c) => /broad|full.access/i.test(c.question)));
    assert("Confirm button blocked",           corrected.needsClarification.length > 0);
    assert("browse_web present",              !!bw);
    assert("browse_web.requiresApproval false", bw?.requiresApproval === false);
    assert("browse_web has no maxAmount",      bw?.constraints?.maxAmount === undefined);
    assert("browse_web blocks forms",         bw?.blockedActions.some((a) => /form/i.test(a)));
    assert("browse_web blocks log in",        bw?.blockedActions.some((a) => /log.?in/i.test(a)));
    assert("browse_web blocks purchases",     bw?.blockedActions.some((a) => /purchas/i.test(a)));
    assert("purchase present",                !!pu);
    assert("purchase.requiresApproval true",  pu?.requiresApproval === true);
    assert("purchase.riskLevel high",         pu?.riskLevel === "high");
    assert("purchase.constraints.maxAmount 25", pu?.constraints?.maxAmount === 25, `got ${pu?.constraints?.maxAmount}`);
    assert("No broad permission in output",   !corrected.permissions.some(isBroadPermission));
    assert("Approval clarification removed",  !corrected.needsClarification.some((c) => /without.*approv|approv.*purchas/i.test(c.question)));
    assert("Spending-limit clarification removed", !corrected.needsClarification.some((c) => /spending limit|maximum.*spend/i.test(c.question)));
  }
);

// ── Test 2: exact regression prompt — raw/weak model output normalization ────
//   This matches the canonical test prompt from the task specification.

runTest(
  "Test 2 — Exact regression prompt: browse + purchase + $25 + approval",
  "Browse the web and summarize public product pages. Compare products and prices, but do not submit forms, " +
  "log in to accounts, save payment information, or buy anything without my approval. " +
  "The assistant may request purchases under $25 only after I approve them.",
  {
    agentDraft: { provider: "", description: "Web research and purchase agent." },
    permissions: [
      {
        // Simulates a bad Ollama output with raw/enum-ish strings and wrong flags
        action: "browse_web", resource: "web",
        allowedActions: ["browse_web", "search web", "compare products", "summarize pages"],
        blockedActions: ["login", "submit_forms", "save_payment_info", "purchase"],
        requiresApproval: true,   // model incorrectly set this
        status: "active", riskLevel: "low", reason: "Browsing.",
        constraints: { maxAmount: 25, expiresAt: null }, // model incorrectly attached to browse_web
      },
      {
        // Simulates a bad purchase permission with raw/weak action strings
        action: "purchase", resource: "commerce",
        allowedActions: ["under $25", "purchase without explicit approval"],
        blockedActions: ["purchase without user approval", "make purchases"],
        requiresApproval: true,
        status: "active", riskLevel: "high", reason: "Purchases.",
        constraints: { maxAmount: 25, expiresAt: null },
      },
    ],
    needsClarification: [],
    warnings: [
      "The assistant has the ability to make purchases under $25, which means it can potentially spend money without explicit approval. This requires additional oversight.",
    ],
    limitations: ["No explicit dollar limit was provided, so setting a limit of $25 was inferred."],
  },
  (corrected, analysis) => {
    const bw = corrected.permissions.find((p) => p.action === "browse_web");
    const pu = corrected.permissions.find((p) => p.action === "purchase");

    // Analysis flags
    assert("hasPurchaseIntent is true",        analysis.hasPurchaseIntent);
    assert("hasExplicitApproval is true",      analysis.hasExplicitApproval);
    assert("hasProductComparison is true",     analysis.hasProductComparison);
    assert("spendingLimit is 25",              analysis.spendingLimit === 25, `got ${analysis.spendingLimit}`);

    // browse_web — allowed actions (canonical)
    assert("browse_web present",              !!bw);
    assert("browse_web.requiresApproval false", bw?.requiresApproval === false);
    assert("browse_web has no maxAmount",      bw?.constraints?.maxAmount === undefined);
    assert('browse_web.allowedActions includes "search web"',
      bw?.allowedActions.includes("search web"), `got: ${JSON.stringify(bw?.allowedActions)}`);
    assert('browse_web.allowedActions includes "read public pages"',
      bw?.allowedActions.includes("read public pages"));
    assert('browse_web.allowedActions includes "summarize public pages"',
      bw?.allowedActions.includes("summarize public pages"));
    assert('browse_web.allowedActions includes "compare products"',
      bw?.allowedActions.includes("compare products"));
    assert('browse_web.allowedActions does NOT include "browse_web"',
      !bw?.allowedActions.includes("browse_web"));

    // browse_web — blocked actions (canonical + no internal enum strings)
    assert('browse_web.blockedActions includes "submit forms"',
      bw?.blockedActions.includes("submit forms"), `got: ${JSON.stringify(bw?.blockedActions)}`);
    assert('browse_web.blockedActions includes "log in to accounts"',
      bw?.blockedActions.includes("log in to accounts"));
    assert('browse_web.blockedActions includes "save payment information"',
      bw?.blockedActions.includes("save payment information"));
    assert('browse_web.blockedActions includes "make purchases"',
      bw?.blockedActions.includes("make purchases"));
    assert('browse_web.blockedActions does NOT include "login"',
      !bw?.blockedActions.includes("login"));
    assert('browse_web.blockedActions does NOT include "submit_forms"',
      !bw?.blockedActions.includes("submit_forms"));

    // purchase
    assert("purchase present",                !!pu);
    assert("purchase.requiresApproval true",  pu?.requiresApproval === true);
    assert("purchase.riskLevel high",         pu?.riskLevel === "high");
    assert("purchase.constraints.maxAmount 25", pu?.constraints?.maxAmount === 25, `got ${pu?.constraints?.maxAmount}`);
    assert('purchase.allowedActions includes "request purchase under approved limit"',
      pu?.allowedActions.includes("request purchase under approved limit"), `got: ${JSON.stringify(pu?.allowedActions)}`);
    assert('purchase.allowedActions includes "make purchase only after user approval"',
      pu?.allowedActions.includes("make purchase only after user approval"));
    assert('purchase.allowedActions does NOT include "under $25"',
      !pu?.allowedActions.includes("under $25"));
    assert('purchase.blockedActions includes "purchase without user approval"',
      pu?.blockedActions.includes("purchase without user approval"), `got: ${JSON.stringify(pu?.blockedActions)}`);

    // warnings must not falsely imply spending without approval
    const badWarning = corrected.warnings.some((w) => {
      const wl = w.toLowerCase();
      return (wl.includes("without") && wl.includes("approv")) ||
             wl.includes("can potentially spend") ||
             wl.includes("without explicit approval");
    });
    assert("warnings do not say it can spend without approval", !badWarning,
      `warnings: ${JSON.stringify(corrected.warnings)}`);

    // clarification
    assert("needsClarification.length === 0",  corrected.needsClarification.length === 0,
      `got ${corrected.needsClarification.length} items`);
    assert("No misleading spending-limit limitation",
      !corrected.limitations.some((l) => /no.*explicit.*dollar|no.*spending.*limit|infer/i.test(l)));
  }
);

// ── Test 3: deterministic-first — canonical prompt ────────────────────────────
// Verifies that the canonical test prompt is handled entirely by deterministic rules
// (no Ollama required) and produces clean output with confirm enabled.

{
  const desc =
    "Browse the web and summarize public product pages. Compare products and prices, but do not submit forms, " +
    "log in to accounts, save payment information, or buy anything without my approval. " +
    "The assistant may request purchases under $25 only after I approve them.";
  const analysis = analyzeDescription(desc);
  console.log(`${BOLD}Test 3 — Deterministic-first: canonical prompt${RESET}`);
  console.log(`${DIM}${desc.slice(0, 120)}…${RESET}\n`);

  assert("canHandleDeterministically returns true", canHandleDeterministically(analysis));
  assert("hasBrowseWebIntent true",  analysis.hasBrowseWebIntent);
  assert("hasPurchaseIntent true",   analysis.hasPurchaseIntent);
  assert("hasBroadAccess false",     !analysis.hasBroadAccess);

  const draft = buildDeterministicDraft(analysis, "", desc);
  const corrected = applyDeterministicCorrections(draft, analysis);

  const bw = corrected.permissions.find((p) => p.action === "browse_web");
  const pu = corrected.permissions.find((p) => p.action === "purchase");

  assert("browse_web present",                  !!bw);
  assert("purchase present",                    !!pu);
  assert("no unavailable warning",
    !corrected.warnings.some((w) => /unavailable|could not|failed/i.test(w)),
    `warnings: ${JSON.stringify(corrected.warnings)}`);
  assert("warnings array empty",                corrected.warnings.length === 0,
    `got: ${JSON.stringify(corrected.warnings)}`);
  assert("needsClarification empty",            corrected.needsClarification.length === 0);
  assert("confirm can be enabled (no clarification blocking it)",
    corrected.needsClarification.length === 0);
  assert("purchase.requiresApproval true",      pu?.requiresApproval === true);
  assert("purchase.constraints.maxAmount 25",   pu?.constraints?.maxAmount === 25);
  assert("browse_web.requiresApproval false",   bw?.requiresApproval === false);
  console.log();
}

// ── Test 4: deterministic-first — broad access only ───────────────────────────
// Verifies broad-access-only prompts are caught immediately (no Ollama) and
// the confirm button is blocked.

{
  const desc = "Give this assistant full access to everything and let it do whatever it needs.";
  const analysis = analyzeDescription(desc);
  console.log(`${BOLD}Test 4 — Deterministic-first: broad access only${RESET}`);
  console.log(`${DIM}${desc}${RESET}\n`);

  assert("canHandleDeterministically returns true", canHandleDeterministically(analysis));
  assert("hasBroadAccess true",       analysis.hasBroadAccess);
  assert("hasBrowseWebIntent false",  !analysis.hasBrowseWebIntent);
  assert("hasPurchaseIntent false",   !analysis.hasPurchaseIntent);

  const draft = buildDeterministicDraft(analysis, "", desc);
  const corrected = applyDeterministicCorrections(draft, analysis);

  assert("needsClarification present",
    corrected.needsClarification.length > 0,
    `got ${corrected.needsClarification.length} items`);
  assert("needsClarification has broad-access warning",
    corrected.needsClarification.some((c) => /broad|full.access|everything|unrestricted/i.test(c.question)));
  assert("no broad permission in output",
    !corrected.permissions.some(isBroadPermission));
  assert("confirm blocked (needsClarification.length > 0)",
    corrected.needsClarification.length > 0);
  assert("no unavailable warning",
    !corrected.warnings.some((w) => /unavailable|could not|failed/i.test(w)));
  console.log();
}

// ── Test 5: unknown intent — Ollama required ──────────────────────────────────
// Verifies that unusual descriptions that don't match deterministic rules
// would fall through to Ollama (canHandleDeterministically returns false).

{
  const desc = "Monitor my smart home temperature sensors and log daily averages to a spreadsheet.";
  const analysis = analyzeDescription(desc);
  console.log(`${BOLD}Test 5 — Unknown intent: Ollama required${RESET}`);
  console.log(`${DIM}${desc}${RESET}\n`);

  assert("canHandleDeterministically returns false (route falls through to Ollama)",
    !canHandleDeterministically(analysis));
  assert("hasBrowseWebIntent false",  !analysis.hasBrowseWebIntent);
  assert("hasPurchaseIntent false",   !analysis.hasPurchaseIntent);
  assert("hasBroadAccess false",      !analysis.hasBroadAccess);
  console.log();
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
if (failed === 0) {
  console.log(`${GREEN}${BOLD}All ${total} assertions passed.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}${failed} of ${total} assertions failed.${RESET}\n`);
  process.exit(1);
}
