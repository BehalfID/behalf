#!/usr/bin/env node
// BehalfID — Deterministic permission draft self-check
// Tests the post-processing logic against a known bad Ollama output.
// Usage: node scripts/check-permission-draft.js

"use strict";

// ── Mirror of the TypeScript analysis + correction logic ──────────────────────

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
const PURCHASE_POSITIVE_PATTERNS = [
  /\bmake\s+purchases?/i, /\bplace\s+(?:an\s+)?orders?\b/i,
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
  const hasBroadAccess    = BROAD_ACCESS_PATTERNS.some((p) => p.test(d));
  const hasBrowseWebIntent = BROWSE_WEB_PATTERNS.some((p) => p.test(d));
  const hasPurchaseIntent  = PURCHASE_POSITIVE_PATTERNS.some((p) => p.test(positive));
  const hasExplicitApproval = EXPLICIT_APPROVAL_PATTERNS.some((p) => p.test(d));
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
  return { hasBroadAccess, hasBrowseWebIntent, hasPurchaseIntent, hasExplicitApproval,
           spendingLimit, hasExplicitFormBlock, hasExplicitLoginBlock, hasExplicitPurchaseBlock };
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

function makeBrowseWebPermission() {
  return {
    action: "browse_web", resource: "web",
    allowedActions: ["search the web", "read public pages", "summarize public pages", "extract structured data", "compare products"],
    blockedActions: ["submit forms", "log in to accounts", "make purchases"],
    requiresApproval: false, status: "active", riskLevel: "low",
    reason: "Permission drafted from web browsing and public-page summary request.",
  };
}

function makePurchasePermission(analysis) {
  const constraints = analysis.spendingLimit !== null
    ? { maxAmount: analysis.spendingLimit, expiresAt: null } : undefined;
  return {
    action: "purchase", resource: "commerce",
    allowedActions: ["compare products", "request purchase under approved limit", "make purchase only after user approval"],
    blockedActions: ["purchase above spending limit", "purchase without user approval", "save payment credentials", "start recurring subscriptions", "use unapproved vendors"],
    requiresApproval: true, status: "active", constraints, riskLevel: "high",
    reason: "Purchases are high-risk and require user approval.",
  };
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
  let permissions = draft.permissions
    .map((p) => ({ ...p, action: normalizeAction(p.action) }))
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
      permissions.push(makeBrowseWebPermission());
    } else {
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

  if (analysis.hasPurchaseIntent) {
    const existing = permissions.find((p) => p.action === "purchase");
    if (!existing) {
      permissions.push(makePurchasePermission(analysis));
    } else {
      existing.requiresApproval = true;
      existing.riskLevel = "high";
      if (analysis.spendingLimit !== null) {
        if (!existing.constraints) existing.constraints = { maxAmount: analysis.spendingLimit, expiresAt: null };
        else if (!existing.constraints.maxAmount) existing.constraints.maxAmount = analysis.spendingLimit;
      }
      const mustBlock = ["purchase without user approval", "purchase above spending limit"];
      for (const phrase of mustBlock) {
        if (!existing.blockedActions.some((a) => a.toLowerCase().includes(phrase.split(" ")[0]))) {
          existing.blockedActions.push(phrase);
        }
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

  return {
    ...draft,
    permissions: deduplicatePermissions(permissions),
    needsClarification: filteredClarifications,
    warnings,
    limitations,
  };
}

// ── Test ──────────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const BOLD   = "\x1b[1m";

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

// ── Bad Ollama output (simulates the observed failure) ────────────────────────

const BAD_OLLAMA_OUTPUT = {
  agentDraft: { provider: "", description: "An assistant that browses the web, compares products, and makes purchases." },
  permissions: [
    {
      action: "browse_web",
      resource: "web",
      allowedActions: ["search web", "summarize pages"],
      blockedActions: ["submit forms"],
      requiresApproval: false,
      status: "active",
      riskLevel: "low",
      reason: "Browsing permission.",
      // Note: model merged purchase into browse_web and missed the spending limit
    }
  ],
  needsClarification: [
    // Model incorrectly asked about approval (user already said "only after I approve")
    { question: "Can the assistant make purchases under $25 without your prior approval?", reason: "The description requires approval but the limit suggests automatic approval may be intended." },
    // Model incorrectly asked about spending limit (user already said "$25")
    { question: "What is the maximum spending limit?", reason: "No explicit limit was mentioned." },
  ],
  warnings: [],
  limitations: ["The assistant did not specify a spending limit."],
};

const TEST_DESCRIPTION =
  "Browse the web and summarize public pages, but do not submit forms, log in, or buy anything. " +
  "Compare products and make purchases under $25 only after I approve them. " +
  "Give this assistant full access to everything and let it do whatever it needs.";

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}BehalfID permission draft self-check${RESET}\n`);
console.log(`Description:\n  "${TEST_DESCRIPTION}"\n`);

const analysis = analyzeDescription(TEST_DESCRIPTION);

console.log("Analysis:");
console.log(`  hasBroadAccess:          ${analysis.hasBroadAccess}`);
console.log(`  hasBrowseWebIntent:      ${analysis.hasBrowseWebIntent}`);
console.log(`  hasPurchaseIntent:       ${analysis.hasPurchaseIntent}`);
console.log(`  hasExplicitApproval:     ${analysis.hasExplicitApproval}`);
console.log(`  spendingLimit:           ${analysis.spendingLimit}`);
console.log(`  hasExplicitFormBlock:    ${analysis.hasExplicitFormBlock}`);
console.log(`  hasExplicitLoginBlock:   ${analysis.hasExplicitLoginBlock}`);
console.log(`  hasExplicitPurchaseBlock:${analysis.hasExplicitPurchaseBlock}`);
console.log();

console.log("Analysis assertions:");
assert("hasBroadAccess is true",        analysis.hasBroadAccess);
assert("hasBrowseWebIntent is true",    analysis.hasBrowseWebIntent);
assert("hasPurchaseIntent is true",     analysis.hasPurchaseIntent);
assert("hasExplicitApproval is true",   analysis.hasExplicitApproval);
assert("spendingLimit is 25",           analysis.spendingLimit === 25, `got ${analysis.spendingLimit}`);
assert("hasExplicitFormBlock is true",  analysis.hasExplicitFormBlock);
assert("hasExplicitLoginBlock is true", analysis.hasExplicitLoginBlock);
assert("hasExplicitPurchaseBlock is true", analysis.hasExplicitPurchaseBlock);

console.log();
const corrected = applyDeterministicCorrections(BAD_OLLAMA_OUTPUT, analysis);

const browseWebPerm  = corrected.permissions.find((p) => p.action === "browse_web");
const purchasePerm   = corrected.permissions.find((p) => p.action === "purchase");
const hasBroadPerm   = corrected.permissions.some(isBroadPermission);

console.log("Correction assertions:");

assert("needsClarification includes broad-access warning",
  corrected.needsClarification.some((c) => /broad|full.access/i.test(c.question)));

assert("Confirm button would be blocked (needsClarification.length > 0)",
  corrected.needsClarification.length > 0);

assert("browse_web permission present",
  !!browseWebPerm, "no browse_web found");

assert("purchase permission present",
  !!purchasePerm, "no purchase found");

assert("purchase.constraints.maxAmount is 25",
  purchasePerm?.constraints?.maxAmount === 25, `got ${purchasePerm?.constraints?.maxAmount}`);

assert("purchase.requiresApproval is true",
  purchasePerm?.requiresApproval === true);

assert("purchase.riskLevel is high",
  purchasePerm?.riskLevel === "high");

assert("browse_web blocks submit forms",
  browseWebPerm?.blockedActions.some((a) => /form/i.test(a)));

assert("browse_web blocks log in",
  browseWebPerm?.blockedActions.some((a) => /log.?in/i.test(a)));

assert("browse_web blocks make purchases",
  browseWebPerm?.blockedActions.some((a) => /purchas/i.test(a)));

assert("No broad/full-access permission in output",
  !hasBroadPerm);

assert("Misleading approval clarification removed (user already stated approval required)",
  !corrected.needsClarification.some((c) => /without.*approv|approv.*purchas/i.test(c.question)));

assert("Misleading spending-limit clarification removed (user stated $25)",
  !corrected.needsClarification.some((c) => /spending limit|maximum.*spend/i.test(c.question)));

console.log();
const total = passed + failed;
if (failed === 0) {
  console.log(`${GREEN}${BOLD}All ${total} assertions passed.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}${failed} of ${total} assertions failed.${RESET}\n`);
  process.exit(1);
}
