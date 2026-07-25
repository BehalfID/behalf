export type ParsedLogQuery = {
  /** Remaining free-text after structured/NL extraction (server regex search). */
  freeText: string;
  decision?: "allowed" | "denied" | "approval_required";
  risk?: "low" | "medium" | "high";
  agentId?: string;
  action?: string;
  vendor?: string;
  environment?: string;
  range?: "24h" | "7d";
};

const STRUCTURED_TOKEN_RE =
  /\b(decision|risk|agent|agentid|action|vendor|resource|env|environment|range):([^\s]+)/gi;

const NL_RULES: Array<{
  re: RegExp;
  apply: (parsed: ParsedLogQuery) => void;
}> = [
  {
    re: /\b(approvals?\s+required|needs?\s+approval|requires?\s+approval|pending\s+approval)\b/gi,
    apply: (parsed) => {
      parsed.decision ??= "approval_required";
    }
  },
  {
    re: /\b(denied|blocked|rejected)\b/gi,
    apply: (parsed) => {
      parsed.decision ??= "denied";
    }
  },
  {
    re: /\b(allowed|permitted)\b/gi,
    apply: (parsed) => {
      parsed.decision ??= "allowed";
    }
  },
  {
    re: /\bhigh[-\s]?risk\b/gi,
    apply: (parsed) => {
      parsed.risk ??= "high";
    }
  },
  {
    re: /\bmedium[-\s]?risk\b/gi,
    apply: (parsed) => {
      parsed.risk ??= "medium";
    }
  },
  {
    re: /\blow[-\s]?risk\b/gi,
    apply: (parsed) => {
      parsed.risk ??= "low";
    }
  },
  {
    re: /\b(in\s+)?production\b/gi,
    apply: (parsed) => {
      parsed.environment ??= "production";
    }
  },
  {
    re: /\b(in\s+)?staging\b/gi,
    apply: (parsed) => {
      parsed.environment ??= "staging";
    }
  },
  {
    re: /\b(last\s+24\s*h(?:ours?)?|past\s+day|today)\b/gi,
    apply: (parsed) => {
      parsed.range ??= "24h";
    }
  },
  {
    re: /\b(last\s+7\s*d(?:ays?)?|past\s+week|this\s+week)\b/gi,
    apply: (parsed) => {
      parsed.range ??= "7d";
    }
  }
];

const FILLER_RE =
  /\b(find|show|list|get|search|for|a|an|the|events?|decisions?|actions?|logs?|that(?:'s| is)|which|are|is|from|with)\b/gi;

function assignStructured(key: string, value: string, parsed: ParsedLogQuery) {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.trim();
  if (!normalizedValue) return;

  switch (normalizedKey) {
    case "decision": {
      const decision = normalizedValue.toLowerCase();
      if (decision === "allowed" || decision === "denied") parsed.decision = decision;
      if (
        decision === "approval" ||
        decision === "approval_required" ||
        decision === "requires_approval"
      ) {
        parsed.decision = "approval_required";
      }
      break;
    }
    case "risk": {
      const risk = normalizedValue.toLowerCase();
      if (risk === "low" || risk === "medium" || risk === "high") parsed.risk = risk;
      break;
    }
    case "agent":
    case "agentid":
      parsed.agentId = normalizedValue;
      break;
    case "action":
      parsed.action = normalizedValue;
      break;
    case "vendor":
    case "resource":
      parsed.vendor = normalizedValue;
      break;
    case "env":
    case "environment":
      parsed.environment = normalizedValue;
      break;
    case "range": {
      const range = normalizedValue.toLowerCase();
      if (range === "24h" || range === "7d") parsed.range = range;
      break;
    }
    default:
      break;
  }
}

/**
 * Parse free-text / structured log search into filters + remaining text.
 * Explicit URL params should still win over these inferred values.
 */
export function parseSmartLogQuery(raw: string): ParsedLogQuery {
  const parsed: ParsedLogQuery = { freeText: "" };
  let text = raw.trim();
  if (!text) return parsed;

  text = text.replace(STRUCTURED_TOKEN_RE, (_full, key: string, value: string) => {
    assignStructured(key, value, parsed);
    return " ";
  });

  // Only apply NL extraction when the query looks intent-like or is short filter phrasing.
  const looksLikeIntent =
    /^(find|show|list|get|search)\b/i.test(raw.trim()) ||
    /\b(that's|that is|high[- ]?risk|approval required)\b/i.test(raw) ||
    raw.trim().split(/\s+/).length <= 6;

  if (looksLikeIntent) {
    for (const rule of NL_RULES) {
      if (rule.re.test(text)) {
        rule.apply(parsed);
        text = text.replace(rule.re, " ");
      }
      rule.re.lastIndex = 0;
    }
    text = text.replace(FILLER_RE, " ");
  }

  parsed.freeText = text.replace(/\s+/g, " ").trim();
  return parsed;
}

/** Merge parsed smart-query fields into URLSearchParams without clobbering explicit keys. */
export function applyParsedLogQueryToParams(
  searchParams: URLSearchParams,
  parsed: ParsedLogQuery
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (parsed.decision && !next.get("decision") && !next.get("allowed")) {
    next.set("decision", parsed.decision);
  }
  if (parsed.risk && !next.get("risk")) next.set("risk", parsed.risk);
  if (parsed.agentId && !next.get("agentId") && !next.get("agent")) {
    next.set("agentId", parsed.agentId);
  }
  if (parsed.action && !next.get("action")) next.set("action", parsed.action);
  if (parsed.vendor && !next.get("vendor") && !next.get("resource")) {
    next.set("vendor", parsed.vendor);
  }
  if (parsed.environment && !next.get("environment")) {
    next.set("environment", parsed.environment);
  }
  if (parsed.range && !next.get("from") && !next.get("start")) {
    const ms = parsed.range === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    next.set("from", new Date(Date.now() - ms).toISOString());
  }
  if (parsed.freeText) next.set("search", parsed.freeText);
  else next.delete("search");
  next.delete("q");
  return next;
}
