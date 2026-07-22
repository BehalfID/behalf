/**
 * Local policy file parsing/validation for the CLI (no server dependency).
 * Supports JSON and a minimal YAML subset (maps, lists, scalars).
 */

export type CliPolicyDocument = {
  version?: number;
  enabled?: boolean;
  name?: string;
  rules: unknown[];
};

export function parsePolicyFileContents(text: string, filePath = "policy"): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${filePath} is empty.`);

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      throw new Error(
        `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  try {
    return parseMinimalYaml(trimmed);
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath} as YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function validatePolicyDocumentShape(
  value: unknown
): { ok: true; document: CliPolicyDocument } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Policy root must be an object." };
  }
  const doc = value as Record<string, unknown>;
  if (!Array.isArray(doc.rules)) {
    return { ok: false, error: "rules must be an array." };
  }
  if (doc.enabled !== undefined && typeof doc.enabled !== "boolean") {
    return { ok: false, error: "enabled must be a boolean when provided." };
  }
  if (doc.version !== undefined && (typeof doc.version !== "number" || !Number.isFinite(doc.version))) {
    return { ok: false, error: "version must be a number when provided." };
  }

  const outcomes = new Set(["allow", "auto_approve", "require_human", "deny"]);
  const predicateTypes = new Set([
    "path_glob",
    "diff_lines_lt",
    "diff_lines_lte",
    "ci_status",
    "risk",
    "action",
    "vendor",
    "permission_requires_approval"
  ]);
  const seen = new Set<string>();

  for (const [index, rule] of doc.rules.entries()) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      return { ok: false, error: `rules[${index}] must be an object.` };
    }
    const entry = rule as Record<string, unknown>;
    if (typeof entry.id !== "string" || !entry.id.trim()) {
      return { ok: false, error: `rules[${index}].id is required.` };
    }
    if (seen.has(entry.id)) return { ok: false, error: `Duplicate rule id: ${entry.id}.` };
    seen.add(entry.id);
    if (typeof entry.priority !== "number") {
      return { ok: false, error: `rules[${index}].priority must be a number.` };
    }
    if (typeof entry.then !== "string" || !outcomes.has(entry.then)) {
      return { ok: false, error: `rules[${index}].then is invalid.` };
    }
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      return { ok: false, error: `rules[${index}].reason is required.` };
    }
    if (!Array.isArray(entry.when)) {
      return { ok: false, error: `rules[${index}].when must be an array.` };
    }
    for (const [pIndex, predicate] of entry.when.entries()) {
      if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) {
        return { ok: false, error: `rules[${index}].when[${pIndex}] is invalid.` };
      }
      const type = (predicate as { type?: unknown }).type;
      if (typeof type !== "string" || !predicateTypes.has(type)) {
        return { ok: false, error: `rules[${index}].when[${pIndex}].type is unsupported.` };
      }
    }
  }

  return {
    ok: true,
    document: {
      version: typeof doc.version === "number" ? doc.version : undefined,
      enabled: typeof doc.enabled === "boolean" ? doc.enabled : undefined,
      name: typeof doc.name === "string" ? doc.name : undefined,
      rules: doc.rules
    }
  };
}

/** Minimal indentation-based YAML subset for policy documents. */
function parseMinimalYaml(text: string): unknown {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim() && !line.trim().startsWith("#"));

  let index = 0;

  function indentOf(line: string) {
    const match = /^ */.exec(line);
    return match ? match[0].length : 0;
  }

  function parseValue(raw: string): unknown {
    const value = raw.trim();
    if (value === "" || value === "|" || value === ">") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  function parseBlock(minIndent: number): unknown {
    if (index >= lines.length) return null;
    const first = lines[index];
    const indent = indentOf(first);
    if (indent < minIndent) return null;

    if (first.trim().startsWith("- ")) {
      const list: unknown[] = [];
      while (index < lines.length && indentOf(lines[index]) === indent && lines[index].trim().startsWith("- ")) {
        const rest = lines[index].trim().slice(2);
        index += 1;
        if (!rest) {
          list.push(parseBlock(indent + 2));
        } else if (rest.includes(": ") || rest.endsWith(":")) {
          // Inline map start on list item — push back conceptually
          index -= 1;
          const patched = " ".repeat(indent + 2) + rest;
          lines[index] = patched;
          list.push(parseBlock(indent + 2));
        } else {
          list.push(parseValue(rest));
        }
      }
      return list;
    }

    const obj: Record<string, unknown> = {};
    while (index < lines.length && indentOf(lines[index]) === indent) {
      const line = lines[index];
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) break;
      const colon = trimmed.indexOf(":");
      if (colon < 0) throw new Error(`Invalid YAML line: ${trimmed}`);
      const key = trimmed.slice(0, colon).trim();
      const inline = trimmed.slice(colon + 1).trim();
      index += 1;
      if (!inline) {
        obj[key] = parseBlock(indent + 2);
      } else {
        obj[key] = parseValue(inline);
      }
    }
    return obj;
  }

  return parseBlock(0);
}
