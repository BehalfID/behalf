import { createHash } from "node:crypto";

const SECRET_KEY =
  /(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer|secret|password|passwd|pwd|private[_-]?key|client[_-]?secret|credentials?|authorization)/i;

/**
 * Redact credential-like values from a deep object before hashing or logging.
 * Never returns secret material.
 */
export function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return looksLikeSecret(value) ? "[redacted]" : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactDeep);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactDeep(v);
  }
  return out;
}

function looksLikeSecret(value: string): boolean {
  return /^(Bearer\s+)?[A-Za-z0-9._~+/-]{24,}={0,2}$/i.test(value.trim()) ||
    /^(sk|pk|rk|whsec|bhf_sk|bhf_dev|ghp|xox[baprs])-[A-Za-z0-9._-]{8,}$/i.test(
      value.trim()
    );
}

/** Stable SHA-256 of redacted arguments for audit trails. */
export function hashArguments(args: Record<string, unknown> | undefined): string {
  const redacted = redactDeep(args ?? {});
  const canonical = stableStringify(redacted);
  return createHash("sha256").update(canonical).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Generate a unique id for requests / approvals / audit rows. */
export function createId(prefix: string): string {
  const rand = createHash("sha256")
    .update(`${prefix}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  return `${prefix}_${rand}`;
}
