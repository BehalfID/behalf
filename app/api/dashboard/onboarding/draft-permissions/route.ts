import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { isRecord, readString } from "@/lib/validation";

// ────────────────────────────────────────────────────────────────────────────
// Config — read inside handler so pre-flight checks see the real env values
// ────────────────────────────────────────────────────────────────────────────

function ollamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "",
    model: process.env.OLLAMA_MODEL ?? "",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? "30000"),
    // Optional bearer token forwarded to the secure proxy. Never sent to the browser.
    proxyToken: process.env.OLLAMA_PROXY_TOKEN ?? ""
  };
}

/** Headers to attach to every upstream Ollama/proxy request. */
function ollamaAuthHeaders(proxyToken: string): Record<string, string> {
  return proxyToken ? { Authorization: `Bearer ${proxyToken}` } : {};
}

// ────────────────────────────────────────────────────────────────────────────
// Structured diagnostic error responses — never creates DB records
// ────────────────────────────────────────────────────────────────────────────

type DiagCode =
  | "NOT_CONFIGURED"
  | "LOCALHOST_IN_PRODUCTION"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "MODEL_NOT_FOUND"
  | "INVALID_RESPONSE"
  | "OLLAMA_ERROR"
  | "OLLAMA_PROXY_AUTH_FAILED";

function diagError(
  httpStatus: number,
  code: DiagCode,
  error: string,
  details: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error, details, code, ...extra }, { status: httpStatus });
}

// ────────────────────────────────────────────────────────────────────────────
// Output types (mirrored in client.tsx — keep in sync)
// ────────────────────────────────────────────────────────────────────────────

type DraftConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: null;
};

type DraftPermission = {
  action: string;
  resource: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  status: "active";
  constraints?: DraftConstraints;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};

type PermissionDraftResponse = {
  agentDraft: { provider: string; description: string };
  permissions: DraftPermission[];
  needsClarification: { question: string; reason: string }[];
  warnings: string[];
  limitations: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Deterministic description analysis — runs independently of Ollama
// ────────────────────────────────────────────────────────────────────────────

type DescriptionAnalysis = {
  hasBroadAccess: boolean;
  hasBrowseWebIntent: boolean;
  hasProductComparison: boolean;
  hasPurchaseIntent: boolean;
  hasExplicitApproval: boolean;
  spendingLimit: number | null;
  hasExplicitFormBlock: boolean;
  hasExplicitLoginBlock: boolean;
  hasExplicitPurchaseBlock: boolean;
  hasEmailReadIntent: boolean;
  hasEmailSendIntent: boolean;
  hasCalendarReadIntent: boolean;
  hasCalendarScheduleIntent: boolean;
};

const BROAD_ACCESS_PATTERNS: RegExp[] = [
  /full\s+access/i, /access\s+to\s+everything/i, /\beverything\b/i,
  /do\s+whatever/i, /whatever\s+it\s+needs/i, /unrestricted/i,
  /all\s+accounts/i, /admin\s+access/i, /anything\s+it\s+wants/i,
];

const BROWSE_WEB_PATTERNS: RegExp[] = [
  /browse\s+(?:the\s+)?web/i, /search\s+(?:the\s+)?web/i,
  /summarize\s+public\s+pages/i, /\bpublic\s+pages\b/i,
  /compare\s+products/i, /research\s+(?:the\s+)?web/i,
  /\bvisit\s+(?:websites?|web\s+pages?|sites?)\b/i,
  /\bwell[\s-]known\s+(?:sites?|packages?|sources?|downloads?|distributions?)\b/i,
  /\bdownload\s+(?:files?|packages?|content|data)\s+from\s+(?:the\s+)?(?:web|sites?|internet|urls?)\b/i,
  /\bfetch\s+(?:content|data|files?)\s+from\s+(?:public|well[\s-]known|trusted|reputable?|https?)\s+(?:sites?|urls?|pages?)\b/i,
  /\baccess\s+(?:public|well[\s-]known|trusted|reputable?|https?)\s+(?:sites?|pages?|urls?|content)\b/i,
  /\bread\s+(?:web|website|online)\s+(?:content|pages?|articles?)\b/i,
  /\bhttps?\s+(?:sites?|websites?|urls?|only)\b/i,
  /\bonly\s+https?\b/i,
  /\bwebsites?\s+with\s+https?\b/i,
  /\bfrom\s+(?:public|well[\s-]known|trusted|reputable?|https?)\s+(?:sites?|sources?|parties)\b/i,
  /\breputable?\s+(?:sites?|sources?|third[\s-]parties|packages?)\b/i,
  /\bknown\s+(?:sites?|packages?|sources?)\b/i,
];

const PRODUCT_COMPARISON_PATTERNS: RegExp[] = [
  /compare\s+products/i, /compare\s+prices/i, /product\s+comparison/i,
];

// Positive purchase intent only — checked against negation-stripped text
const PURCHASE_POSITIVE_PATTERNS: RegExp[] = [
  /\bmake\s+purchases?/i, /\bplace\s+(?:an\s+)?orders?\b/i,
  /\brequest\s+purchases?/i,           // "request purchases under $25"
  /\bpurchases?\s+under\b/i,           // "purchases under $25"
  /\bask\s+before\s+(?:buy|purchas)/i, // "ask before buying/purchasing"
];

// "buy X without my approval" is a conditional prohibition (buy WITH approval = OK)
const CONDITIONAL_PURCHASE_PATTERNS: RegExp[] = [
  /\bbuy\b[^.;!?]*\bwithout\b[^.;!?]*\b(?:my\s+)?approv/i,
  /\bpurchas[^.;!?]*\bwithout\b[^.;!?]*\b(?:my\s+)?approv/i,
];

const EXPLICIT_APPROVAL_PATTERNS: RegExp[] = [
  /only\s+after\s+i\s+approve/i, /after\s+i\s+approve/i,
  /ask\s+before\s+purchas/i, /with\s+my\s+approval/i,
  /only\s+with\s+my\s+approval/i,
];

const EMAIL_READ_PATTERNS: RegExp[] = [
  /\breads?\s+(?:and\s+\w+\s+)?(?:my\s+)?emails?\b/i,
  /\breading\s+(?:my\s+)?emails?\b/i,
  /\bcheck\w*\s+(?:my\s+)?(?:inbox|emails?)\b/i,
  /\bsummariz\w+\s+(?:my\s+)?emails?\b/i,
  /\bemail\s+summar/i,
  /\binbox\s+(?:summary|summaries)\b/i,
];

const EMAIL_SEND_PATTERNS: RegExp[] = [
  /\bsends?\s+(?:an?\s+)?emails?\b/i,
  /\bsendings?\s+emails?\b/i,
  /\breply\w*\s+(?:to\s+)?(?:my\s+)?emails?\b/i,
  /\bcompos\w+\s+(?:an?\s+)?emails?\b/i,
  /\bwrite\s+(?:an?\s+)?emails?\b/i,
  /\bwriting\s+(?:an?\s+)?emails?\b/i,
  /\bdraft\w*\s+(?:an?\s+)?emails?\b/i,
];

const CALENDAR_READ_PATTERNS: RegExp[] = [
  /\bcheck\w*\s+(?:my\s+)?(?:calendar|schedule)\b/i,
  /\breads?\s+(?:my\s+)?(?:calendar|schedule)\b/i,
  /\breading\s+(?:my\s+)?(?:calendar|schedule)\b/i,
  /\bview\w*\s+(?:my\s+)?(?:calendar|events?)\b/i,
  /\baccess\w*\s+(?:my\s+)?calendar\b/i,
];

const CALENDAR_SCHEDULE_PATTERNS: RegExp[] = [
  /\bschedul\w+\s+(?:a\s+)?meetings?\b/i,
  /\bbook\w*\s+(?:a\s+)?meetings?\b/i,
  /\bcreat\w+\s+(?:calendar\s+)?events?\b/i,
  /\bset\s+up\s+(?:a\s+)?meetings?\b/i,
  /\badd\s+(?:an?\s+)?(?:event|meeting)\s+to\s+(?:my\s+)?calendar\b/i,
];

function withoutNegations(text: string): string {
  return text.replace(/\bdo\s+not\b[^.;!?]*/gi, "");
}

function analyzeDescription(description: string): DescriptionAnalysis {
  const d = description;
  const positive = withoutNegations(d);

  const hasBroadAccess      = BROAD_ACCESS_PATTERNS.some((p) => p.test(d));
  const hasBrowseWebIntent  = BROWSE_WEB_PATTERNS.some((p) => p.test(d));
  const hasProductComparison = PRODUCT_COMPARISON_PATTERNS.some((p) => p.test(d));
  const hasExplicitApproval = EXPLICIT_APPROVAL_PATTERNS.some((p) => p.test(d));
  // Conditional pattern checked on original text (not stripped) — "buy without approval" = buy with approval OK
  const hasConditionalPurchaseIntent = CONDITIONAL_PURCHASE_PATTERNS.some((p) => p.test(d));
  const hasPurchaseIntent   = PURCHASE_POSITIVE_PATTERNS.some((p) => p.test(positive)) || hasConditionalPurchaseIntent;

  let spendingLimit: number | null = null;
  const dollarMatch = d.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollarMatch) {
    spendingLimit = parseFloat(dollarMatch[1]);
  } else {
    const wordsMatch = d.match(/(\d+(?:\.\d+)?)\s+dollars?/i);
    if (wordsMatch) spendingLimit = parseFloat(wordsMatch[1]);
  }

  const hasExplicitFormBlock     = /do\s+not\b[^.;!?]*\bsubmit\s+forms?/i.test(d);
  const hasExplicitLoginBlock    = /do\s+not\b[^.;!?]*\blog\s+in\b/i.test(d);
  const hasExplicitPurchaseBlock = /do\s+not\b[^.;!?]*\bbuy\b/i.test(d) ||
                                   /do\s+not\b[^.;!?]*\bpurchas/i.test(d);

  // Email and calendar intents — tested on positive (negation-stripped) text so that
  // "do not send emails" does not trigger hasEmailSendIntent.
  const hasEmailReadIntent        = EMAIL_READ_PATTERNS.some((p) => p.test(positive));
  const hasEmailSendIntent        = EMAIL_SEND_PATTERNS.some((p) => p.test(positive));
  const hasCalendarReadIntent     = CALENDAR_READ_PATTERNS.some((p) => p.test(positive));
  const hasCalendarScheduleIntent = CALENDAR_SCHEDULE_PATTERNS.some((p) => p.test(positive));

  return {
    hasBroadAccess, hasBrowseWebIntent, hasProductComparison, hasPurchaseIntent,
    hasExplicitApproval, spendingLimit, hasExplicitFormBlock, hasExplicitLoginBlock,
    hasExplicitPurchaseBlock, hasEmailReadIntent, hasEmailSendIntent,
    hasCalendarReadIntent, hasCalendarScheduleIntent,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// System prompt
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a permission passport drafting assistant for BehalfID, a permission control system for AI agents.

Your task: read the user's plain-English description of what they want an AI assistant to do, then return a single JSON object.

Return ONLY this JSON object — no markdown, no code fences, no explanation, no text before or after the JSON.

The object must match this exact shape:

{
  "agentDraft": {
    "provider": "string (the assistant provider name as given)",
    "description": "string (1-2 sentence summary of the agent purpose)"
  },
  "permissions": [
    {
      "action": "string (snake_case verb: access_data | create_content | schedule | purchase | browse_web | send_email | send_message | or a descriptive snake_case verb like read_calendar, update_crm, monitor_sensors)",
      "resource": "string (bare domain or service name ONLY — e.g. gmail.com, google-calendar, slack, notion, github.com — NEVER include https://, http://, or URL paths; NOT abstract nouns like 'email' or 'data')",
      "allowedActions": ["string (plain English phrase — e.g. 'read email messages', 'summarize threads' — NEVER snake_case, NEVER repeat the action name itself, 2–5 items)"],
      "blockedActions": ["string (plain English phrase — e.g. 'send or reply to emails', 'delete messages' — NEVER snake_case, 2–5 items)"],
      "requiresApproval": boolean,
      "status": "active",
      "constraints": {
        "maxAmount": number or null,
        "allowedVendors": ["string"],
        "expiresAt": null
      },
      "riskLevel": "low" | "medium" | "high",
      "reason": "string (one sentence naming the service and what capability this grants, e.g. 'Allows the assistant to read Gmail messages and summarize threads without any write access.')"
    }
  ],
  "needsClarification": [
    {
      "question": "string (a specific question to ask the user)",
      "reason": "string (why this is unclear from the description)"
    }
  ],
  "warnings": ["string (1–2 things the user should consider before confirming)"],
  "limitations": ["string (1–2 constraints you could not capture from the description)"]
}

Rules:
1. SPLIT CAPABILITIES: If the user describes multiple distinct capabilities (e.g. email reading AND calendar scheduling), return each as a SEPARATE permission with its own action and resource.
2. requiresApproval must be true for: financial actions, destructive/irreversible actions, sending external messages, and any time the user said "ask before", "only after I approve", "with my approval", or similar. Do NOT ask a clarification question about approval if the user already stated it.
3. riskLevel: low = read-only no external effects; medium = creates content, sends something, or modifies state; high = financial, destructive, or irreversible.
4. allowedActions and blockedActions MUST be plain English phrases. Never use snake_case, never repeat the action name itself as an item. Good: "read email messages". Bad: "access_data", "browse_web".
5. DOLLAR LIMITS: Always extract and set constraints.maxAmount when the user states any dollar amount. "$25", "under $25", "up to $25", "25 dollars" all mean maxAmount: 25.
6. needsClarification: Only ask about things genuinely ambiguous and NOT already answered in the description. If the description is specific, return an empty array. Do NOT ask about approval or spending limits if the user already stated them.
7. BROAD ACCESS: If the description contains "full access", "access to everything", "do whatever it needs", "unrestricted", or "admin access", add a concern to needsClarification — do NOT create a permission granting broad access.
8. Set warnings for: financial permissions and "send on my behalf" permissions. Maximum 2 warnings.
9. Set limitations for things you genuinely could not encode. Maximum 2 limitations.
10. Every permission must have at least one allowedAction and one blockedAction.
11. resource must be a real service name or domain. If the user did not name a specific service, use the closest category (email, google-calendar, documents, crm).

Example — for "Read and summarize my emails, but do not send, delete, or forward them":
{"agentDraft":{"provider":"claude","description":"Reads and summarizes email without write access."},"permissions":[{"action":"access_data","resource":"gmail.com","allowedActions":["read email messages","search inbox","summarize email threads","view attachments"],"blockedActions":["send or reply to emails","delete messages","forward emails","modify inbox filters or rules"],"requiresApproval":false,"status":"active","constraints":{"maxAmount":null,"allowedVendors":[],"expiresAt":null},"riskLevel":"low","reason":"Allows the assistant to read and summarize Gmail messages without any write or send access."}],"needsClarification":[],"warnings":[],"limitations":[]}`;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function extractJson(raw: string): unknown {
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try { return JSON.parse(stripped); } catch {}

  const objStart = stripped.indexOf("{");
  const objEnd = stripped.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(stripped.slice(objStart, objEnd + 1)); } catch {}
  }

  const arrStart = stripped.indexOf("[");
  const arrEnd = stripped.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(stripped.slice(arrStart, arrEnd + 1)); } catch {}
  }

  return null;
}

const VALID_RISK = new Set(["low", "medium", "high"]);

function normalizeResource(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")  // strip protocol prefix
    .replace(/\/.*$/, "")           // strip path after domain
    .trim();
}

function sanitizePermission(p: unknown): DraftPermission | null {
  if (!isRecord(p)) return null;
  const action = readString(p.action) || "access_data";
  const resource = normalizeResource(readString(p.resource) || "");
  const allowedActions = extractStringArray(p.allowedActions);
  const blockedActions = extractStringArray(p.blockedActions);
  const riskRaw = readString(p.riskLevel);
  const riskLevel: "low" | "medium" | "high" = VALID_RISK.has(riskRaw)
    ? (riskRaw as "low" | "medium" | "high")
    : "medium";
  // Auto-correct the common model mistake of setting requiresApproval on low-risk read actions
  const modelRequiresApproval = p.requiresApproval === true;
  const requiresApproval = riskLevel === "low" ? false : modelRequiresApproval;
  const reason = readString(p.reason) || "Permission drafted from your description.";

  let constraints: DraftConstraints | undefined;
  if (isRecord(p.constraints)) {
    const maxAmountRaw = p.constraints.maxAmount;
    const maxAmount = typeof maxAmountRaw === "number" && maxAmountRaw > 0 ? maxAmountRaw : undefined;
    const allowedVendors = extractStringArray(p.constraints.allowedVendors).filter(Boolean);
    if (maxAmount !== undefined || allowedVendors.length > 0) {
      constraints = {
        maxAmount,
        allowedVendors: allowedVendors.length ? allowedVendors : undefined,
        expiresAt: null
      };
    }
  }

  return { action, resource, allowedActions, blockedActions, requiresApproval, status: "active", constraints, riskLevel, reason };
}

function buildDraftResponse(parsed: unknown, provider: string, description: string): PermissionDraftResponse {
  let rawPermissions: unknown[] = [];
  let rawAgentDraft: unknown = undefined;
  let rawClarifications: unknown[] = [];
  let rawWarnings: unknown[] = [];
  let rawLimitations: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawPermissions = parsed;
  } else if (isRecord(parsed)) {
    rawPermissions = Array.isArray(parsed.permissions) ? (parsed.permissions as unknown[]) : [];
    rawAgentDraft = parsed.agentDraft;
    rawClarifications = Array.isArray(parsed.needsClarification) ? (parsed.needsClarification as unknown[]) : [];
    rawWarnings = Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]) : [];
    rawLimitations = Array.isArray(parsed.limitations) ? (parsed.limitations as unknown[]) : [];
  }

  const permissions = rawPermissions
    .slice(0, 5)
    .map(sanitizePermission)
    .filter((p): p is DraftPermission => p !== null);

  const agentDraft = {
    provider: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.provider) : "") || provider,
    description: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.description) : "") || description
  };

  const needsClarification: { question: string; reason: string }[] = rawClarifications
    .slice(0, 5)
    .flatMap((item) => {
      if (!isRecord(item)) return [];
      const question = readString(item.question);
      const reason = readString(item.reason);
      return question ? [{ question, reason }] : [];
    });

  const warnings = rawWarnings.filter((x): x is string => typeof x === "string").slice(0, 5);
  const limitations = rawLimitations.filter((x): x is string => typeof x === "string").slice(0, 5);

  return { agentDraft, permissions, needsClarification, warnings, limitations };
}

// ────────────────────────────────────────────────────────────────────────────
// Post-processing: merge deterministic rules with Ollama output
// ────────────────────────────────────────────────────────────────────────────

function normalizeAction(action: string): string {
  const a = action.toLowerCase().trim();
  if (/^(browse[_\s]?web|web[_\s]?browsing?|search[_\s]?web|web[_\s]?search)$/.test(a)) return "browse_web";
  if (/^(purchas(?:e|ing)?|buy(?:ing)?|order(?:ing)?)$/.test(a)) return "purchase";
  return a.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || action;
}

const BROAD_ACTION_NAMES = new Set(["full_access", "admin_access", "unrestricted_access", "all_access"]);

function isBroadPermission(perm: DraftPermission): boolean {
  if (BROAD_ACTION_NAMES.has(perm.action)) return true;
  const allowedText = perm.allowedActions.join(" ").toLowerCase();
  return /full\s+access|access\s+to\s+everything|unrestricted|do\s+whatever|anything\s+it\s+wants/.test(allowedText);
}

function makeBrowseWebPermission(hasProductComparison: boolean): DraftPermission {
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

function makePurchasePermission(analysis: DescriptionAnalysis): DraftPermission {
  const constraints: DraftConstraints | undefined = analysis.spendingLimit !== null
    ? { maxAmount: analysis.spendingLimit, expiresAt: null }
    : undefined;
  return {
    action: "purchase", resource: "commerce",
    allowedActions: ["request purchase under approved limit", "make purchase only after user approval"],
    blockedActions: ["purchase above spending limit", "purchase without user approval", "save payment credentials", "start recurring subscriptions", "use unapproved vendors"],
    requiresApproval: true, status: "active", constraints, riskLevel: "high",
    reason: "Purchases are high-risk and require user approval.",
  };
}

function makeEmailReadPermission(): DraftPermission {
  return {
    action: "access_data", resource: "email",
    allowedActions: ["read email messages", "search inbox", "summarize email threads", "view attachments"],
    blockedActions: ["send or reply to emails", "delete messages", "forward emails to other addresses", "modify inbox filters or rules"],
    requiresApproval: false, status: "active", riskLevel: "low",
    reason: "Allows the assistant to read and summarize emails with no write or send access.",
  };
}

function makeEmailSendPermission(): DraftPermission {
  return {
    action: "send_email", resource: "email",
    allowedActions: ["compose email drafts", "suggest reply text", "send emails only after user approval"],
    blockedActions: ["send emails without user review", "delete messages", "forward emails to external addresses", "access contact list without permission"],
    requiresApproval: true, status: "active", riskLevel: "medium",
    reason: "Sending emails on behalf of the user requires explicit approval before each message is sent.",
  };
}

function makeCalendarReadPermission(): DraftPermission {
  return {
    action: "access_data", resource: "google-calendar",
    allowedActions: ["read calendar events", "check availability", "view event details and participants"],
    blockedActions: ["create or delete calendar events", "share calendar with others", "invite external contacts", "modify recurring event series"],
    requiresApproval: false, status: "active", riskLevel: "low",
    reason: "Allows the assistant to read calendar data and check availability without creating or modifying events.",
  };
}

function makeCalendarSchedulePermission(): DraftPermission {
  return {
    action: "schedule", resource: "google-calendar",
    allowedActions: ["check availability", "suggest meeting times", "create calendar events after approval", "send meeting invites after approval"],
    blockedActions: ["delete existing events", "share calendar externally", "invite contacts without user approval", "modify recurring event series"],
    requiresApproval: true, status: "active", riskLevel: "medium",
    reason: "Creating or modifying calendar events changes the user's schedule and requires approval.",
  };
}

function deduplicatePermissions(permissions: DraftPermission[]): DraftPermission[] {
  const seen = new Set<string>();
  return permissions.filter((p) => {
    const key = `${p.action}::${p.resource}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Maps internal/enum-ish model strings to human-readable equivalents.
// Returns null to signal the string should be dropped (e.g. spending amounts in action lists).
const ACTION_NORMALIZATIONS: [RegExp, string | null][] = [
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

function normalizeActionString(str: string): string | null {
  const t = str.trim();
  for (const [pattern, replacement] of ACTION_NORMALIZATIONS) {
    if (pattern.test(t)) return replacement;
  }
  return t;
}

function normalizeActionStrings(actions: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of actions) {
    const normalized = normalizeActionString(a);
    if (normalized === null) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(normalized); }
  }
  return result;
}

function applyDeterministicCorrections(
  draft: PermissionDraftResponse,
  analysis: DescriptionAnalysis,
): PermissionDraftResponse {
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

  // Broad access language → server-enforced clarification (cannot be suppressed by the model)
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

  // Ensure browse_web permission when browsing intent detected
  if (analysis.hasBrowseWebIntent) {
    const existing = permissions.find((p) => p.action === "browse_web");
    if (!existing) {
      permissions.push(makeBrowseWebPermission(analysis.hasProductComparison));
    } else {
      // Replace with canonical allowedActions and blockedActions — model output is too raw
      const canonical = makeBrowseWebPermission(analysis.hasProductComparison);
      existing.allowedActions = [...canonical.allowedActions];
      existing.blockedActions = [...canonical.blockedActions];
      existing.riskLevel = "medium";
      existing.reason = canonical.reason;
      // Merge any extra explicit blocks from the description not already in canonical
      const mustBlock: Array<[boolean, string]> = [
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

  // Harden browse_web regardless of model output: browsing is never approval-gated,
  // and purchase constraints (maxAmount) must not be attached to a browsing permission.
  const browseWebPerm = permissions.find((p) => p.action === "browse_web");
  if (browseWebPerm) {
    browseWebPerm.requiresApproval = false;
    if (browseWebPerm.constraints) {
      browseWebPerm.constraints = browseWebPerm.constraints.allowedVendors?.length
        ? { allowedVendors: browseWebPerm.constraints.allowedVendors, expiresAt: null }
        : undefined;
    }
  }

  // Ensure purchase permission when positive purchase intent detected
  if (analysis.hasPurchaseIntent) {
    const existing = permissions.find((p) => p.action === "purchase");
    if (!existing) {
      permissions.push(makePurchasePermission(analysis));
    } else {
      // Replace with canonical action strings — model output is too raw
      const canonical = makePurchasePermission(analysis);
      existing.allowedActions = [...canonical.allowedActions];
      existing.blockedActions = [...canonical.blockedActions];
      // Enforce correct risk/approval regardless of model output
      existing.requiresApproval = true;
      existing.riskLevel = "high";
      existing.reason = canonical.reason;
      // Fix spending limit if model missed it
      if (analysis.spendingLimit !== null) {
        if (!existing.constraints) {
          existing.constraints = { maxAmount: analysis.spendingLimit, expiresAt: null };
        } else if (!existing.constraints.maxAmount) {
          existing.constraints.maxAmount = analysis.spendingLimit;
        }
      }
    }
    // Add limitation if no spending limit was found
    if (analysis.spendingLimit === null && !limitations.some((l) => /spend|limit|amount/i.test(l))) {
      limitations.push("Specify a spending limit before enabling purchases.");
    }
  }

  // Remove clarification questions already answered by the description
  const filteredClarifications = needsClarification.filter((item) => {
    const q = (item.question + " " + item.reason).toLowerCase();
    if (analysis.hasExplicitApproval && /approv/i.test(q) && /purchas|buy/i.test(q)) return false;
    if (analysis.spendingLimit !== null && /spend|limit|amount/i.test(q)) return false;
    return true;
  });

  // Remove model-generated "no spending limit" messages when we found one in the description
  const isSpendingFalseNegative = (s: string) =>
    /spend|limit|amount/i.test(s) && /no|not|infer|assum|provid/i.test(s);
  const filteredLimitations = analysis.spendingLimit !== null
    ? limitations.filter((l) => !isSpendingFalseNegative(l))
    : limitations;

  // Remove warnings that falsely imply the assistant can spend without approval
  // when the purchase permission already requires approval and blocks unapproved purchases.
  const purchasePerm = permissions.find((p) => p.action === "purchase");
  const purchaseRequiresApproval = purchasePerm?.requiresApproval === true;
  let filteredWarnings = analysis.spendingLimit !== null
    ? warnings.filter((w) => !isSpendingFalseNegative(w))
    : warnings;
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

async function fetchAvailableModels(baseUrl: string, proxyToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: ollamaAuthHeaders(proxyToken),
      signal: AbortSignal.timeout(5_000)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic drafting — primary path for known intents
// ────────────────────────────────────────────────────────────────────────────

/** Returns true when deterministic rules can confidently produce a draft. */
function canHandleDeterministically(analysis: DescriptionAnalysis): boolean {
  return (
    analysis.hasBrowseWebIntent ||
    analysis.hasPurchaseIntent ||
    analysis.hasBroadAccess ||
    analysis.hasEmailReadIntent ||
    analysis.hasEmailSendIntent ||
    analysis.hasCalendarReadIntent ||
    analysis.hasCalendarScheduleIntent
  );
}

/** Builds a clean deterministic draft (no unavailability warning). */
function buildDeterministicDraft(
  analysis: DescriptionAnalysis,
  provider: string,
  description: string,
): PermissionDraftResponse {
  const permissions: DraftPermission[] = [];
  if (analysis.hasBrowseWebIntent)        permissions.push(makeBrowseWebPermission(analysis.hasProductComparison));
  if (analysis.hasPurchaseIntent)         permissions.push(makePurchasePermission(analysis));
  if (analysis.hasEmailReadIntent)        permissions.push(makeEmailReadPermission());
  if (analysis.hasEmailSendIntent)        permissions.push(makeEmailSendPermission());
  if (analysis.hasCalendarReadIntent)     permissions.push(makeCalendarReadPermission());
  if (analysis.hasCalendarScheduleIntent) permissions.push(makeCalendarSchedulePermission());
  return {
    agentDraft: { provider, description },
    permissions,
    needsClarification: [],
    warnings: [],
    limitations: [],
  };
}

/**
 * Builds a deterministic draft annotated with an "Ollama unavailable" warning.
 * Used only when Ollama was attempted and failed.
 */
function buildDeterministicFallback(
  analysis: DescriptionAnalysis,
  provider: string,
  description: string,
): PermissionDraftResponse {
  const base = buildDeterministicDraft(analysis, provider, description);
  return {
    ...base,
    warnings: [
      "AI model drafting was unavailable. BehalfID generated a conservative rule-based draft from your description.",
    ],
  };
}

function tryDeterministicFallback(
  analysis: DescriptionAnalysis,
  provider: string,
  description: string,
): NextResponse | null {
  if (!canHandleDeterministically(analysis)) return null;
  const fallback = buildDeterministicFallback(analysis, provider, description);
  const corrected = applyDeterministicCorrections(fallback, analysis);
  return NextResponse.json(corrected);
}

// ────────────────────────────────────────────────────────────────────────────
// Route handler — never creates DB records, only returns a draft
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  // ── Validate request body ────────────────────────────────────────────────
  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const provider = readString(body.provider);
  const description = readString(body.description);
  if (!description || description.length < 5) return jsonError("description is required (minimum 5 characters).");
  if (description.length > 2000) return jsonError("description must be 2000 characters or fewer.");

  const analysis = analyzeDescription(description);

  // ── Deterministic-first: skip Ollama entirely for known intents ──────────
  // browse_web, purchase, and broad-access prompts are all handled deterministically.
  // This avoids timeout/rate-limit friction for the most common onboarding flows.
  if (canHandleDeterministically(analysis)) {
    const draft = buildDeterministicDraft(analysis, provider, description);
    const corrected = applyDeterministicCorrections(draft, analysis);
    return NextResponse.json(corrected);
  }

  // ── Ollama is only reached for descriptions that don't match known rules ──

  // ── A: Missing env vars ──────────────────────────────────────────────────
  const { baseUrl: rawBaseUrl, model: rawModel, timeoutMs, proxyToken } = ollamaConfig();
  if (!rawBaseUrl || !rawModel) {
    return diagError(503, "NOT_CONFIGURED",
      "AI-assisted drafting is not configured.",
      "Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env.local, then restart the Next.js server or redeploy Vercel."
    );
  }

  const OLLAMA_BASE_URL = rawBaseUrl;
  const OLLAMA_MODEL = rawModel;

  // ── B: Localhost in production ───────────────────────────────────────────
  const isLocalhost = /localhost|127\.0\.0\.1/.test(OLLAMA_BASE_URL);
  if (process.env.NODE_ENV === "production" && isLocalhost) {
    return diagError(503, "LOCALHOST_IN_PRODUCTION",
      "Ollama is configured as localhost in production.",
      "In production, localhost points to the Vercel server, not your Mac. Use local development (npm run dev), or configure a secure reachable Ollama proxy."
    );
  }

  const userMessage = [
    provider ? `Assistant provider: ${provider}` : null,
    `User request: ${description}`
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── Call Ollama ──────────────────────────────────────────────────────────
  let raw: string | null = null;
  let ollamaError: NextResponse | null = null;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaAuthHeaders(proxyToken) },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      // ── Proxy auth failure ─────────────────────────────────────────────
      if (res.status === 401 || res.status === 403) {
        return diagError(503, "OLLAMA_PROXY_AUTH_FAILED",
          "Ollama proxy rejected the request.",
          "Check that OLLAMA_PROXY_TOKEN is set correctly in BehalfID and on the proxy server. They must match."
        );
      }

      const text = await res.text().catch(() => "");
      const lowerText = text.toLowerCase();
      const isModelMissing =
        res.status === 404 ||
        lowerText.includes("not found") ||
        lowerText.includes("pull it first") ||
        lowerText.includes("model not found");

      if (isModelMissing) {
        // ── D: Model unavailable ───────────────────────────────────────────
        const availableModels = await fetchAvailableModels(OLLAMA_BASE_URL, proxyToken);
        return diagError(503, "MODEL_NOT_FOUND",
          "Configured Ollama model is not available.",
          `Run \`ollama pull ${OLLAMA_MODEL}\` on the machine running Ollama, or change OLLAMA_MODEL to an installed model.`,
          { configuredModel: OLLAMA_MODEL, availableModels }
        );
      }

      ollamaError = diagError(503, "OLLAMA_ERROR",
        "Ollama returned an error.",
        text ? text.slice(0, 300) : `HTTP ${res.status} from Ollama.`
      );
    } else {
      const data = (await res.json()) as { message?: { content?: string }; error?: string };
      if (data.error) {
        ollamaError = diagError(503, "OLLAMA_ERROR", "Ollama returned an error.", data.error);
      } else {
        raw = data.message?.content ?? "";
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || msg.includes("timed out"));
    const isRefused =
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("network");

    if (isTimeout) {
      // ── Timeout — try deterministic fallback before returning error ─────
      ollamaError = diagError(503, "TIMEOUT",
        "Ollama timed out.",
        `Ollama did not respond within ${timeoutMs / 1000}s. Increase OLLAMA_TIMEOUT_MS in .env.local — if you are running the secure proxy, restart it so it picks up the new value (the proxy also reads OLLAMA_TIMEOUT_MS as its timeout).`
      );
    } else if (isRefused) {
      // ── C: Unreachable ─────────────────────────────────────────────────
      ollamaError = diagError(503, "UNREACHABLE",
        "Ollama is not reachable.",
        `The BehalfID server cannot reach ${OLLAMA_BASE_URL}. ` +
        `If testing locally, make sure Ollama is running (ollama serve) and restart Next.js after editing .env.local. ` +
        `If using Vercel, Ollama must be reachable through a secure proxy.`
      );
    } else {
      ollamaError = diagError(503, "UNREACHABLE", "Ollama request failed.", msg);
    }
  }

  // ── If Ollama failed, try deterministic fallback before surfacing error ──
  if (ollamaError !== null) {
    return tryDeterministicFallback(analysis, provider, description) ?? ollamaError;
  }

  // ── E: Invalid/empty model output ────────────────────────────────────────
  if (!raw!.trim()) {
    return tryDeterministicFallback(analysis, provider, description) ??
      diagError(502, "INVALID_RESPONSE",
        "Ollama returned an invalid draft.",
        "The model returned an empty response. Try again or use a stronger model."
      );
  }

  const parsed = extractJson(raw!);
  if (parsed === null) {
    return tryDeterministicFallback(analysis, provider, description) ??
      diagError(502, "INVALID_RESPONSE",
        "Ollama returned an invalid draft.",
        "The model did not return valid JSON. Try again or use a stronger model."
      );
  }

  const rawDraft = buildDraftResponse(parsed, provider, description);
  const draft = applyDeterministicCorrections(rawDraft, analysis);

  if (draft.permissions.length === 0) {
    return tryDeterministicFallback(analysis, provider, description) ??
      diagError(502, "INVALID_RESPONSE",
        "Ollama returned an invalid draft.",
        "The model did not produce any permissions. Try a more specific description or a stronger model."
      );
  }

  return NextResponse.json(draft);
}
