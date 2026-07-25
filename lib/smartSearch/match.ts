import { catalogForScope, type SmartSuggestion } from "./catalog";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreSuggestion(query: string, item: SmartSuggestion): number {
  const q = normalize(query);
  if (!q) return 0;

  const title = normalize(item.title);
  const description = normalize(item.description);
  const itemQuery = normalize(item.query);
  const haystack = [title, description, itemQuery, ...(item.keywords ?? []).map(normalize)].join(" ");

  if (title === q || itemQuery === q) return 100;
  if (title.startsWith(q) || itemQuery.startsWith(q)) return 90;
  if (title.includes(q) || itemQuery.includes(q)) return 75;

  const tokens = q.split(" ").filter(Boolean);
  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) tokenHits += 1;
  }
  if (tokenHits === 0) return 0;
  const coverage = tokenHits / tokens.length;
  return Math.round(40 + coverage * 30);
}

/** Rank catalog suggestions for a free-text query. */
export function matchSmartSuggestions(
  query: string,
  options: {
    scope?: "all" | "logs" | "docs";
    limit?: number;
    extra?: readonly SmartSuggestion[];
  } = {}
): SmartSuggestion[] {
  const scope = options.scope ?? "all";
  const limit = options.limit ?? 8;
  const catalog = [...catalogForScope(scope), ...(options.extra ?? [])];
  const q = query.trim();

  if (!q) {
    return catalog.slice(0, limit);
  }

  return catalog
    .map((item) => ({ item, score: scoreSuggestion(q, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((row) => row.item);
}

/** Completions for partial structured tokens like `decision:` / `risk:h`. */
export function matchFieldCompletions(query: string): SmartSuggestion[] {
  const trimmed = query.trim().toLowerCase();
  const match = /^(decision|risk|agent|agentid|action|vendor|resource|env|environment|range):(\S*)?$/i.exec(trimmed);
  if (!match) return [];

  const key = match[1].toLowerCase();
  const partial = (match[2] ?? "").toLowerCase();
  const values: Record<string, string[]> = {
    decision: ["allowed", "denied", "approval_required"],
    risk: ["low", "medium", "high"],
    range: ["24h", "7d"],
    env: ["production", "staging", "development"],
    environment: ["production", "staging", "development"]
  };

  const options = values[key];
  if (!options) {
    return [
      {
        id: `field-continue-${key}`,
        kind: "field",
        title: `${key}:…`,
        description: `Continue typing a ${key} value`,
        query: `${key}:`
      }
    ];
  }

  return options
    .filter((value) => !partial || value.startsWith(partial))
    .map((value) => ({
      id: `field-${key}-${value}`,
      kind: "field" as const,
      title: `${key}:${value}`,
      description: `Apply ${key} filter`,
      query: `${key}:${value}`,
      logFilters: {
        ...(key === "decision" ? { decision: value === "approval_required" ? "approval_required" : value, search: "" } : {}),
        ...(key === "risk" ? { risk: value, search: "" } : {}),
        ...(key === "range" ? { range: value as "24h" | "7d", search: "" } : {}),
        ...(key === "env" || key === "environment" ? { environment: value, search: "" } : {})
      }
    }));
}
