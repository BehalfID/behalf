/**
 * Same-origin redirect target validation.
 *
 * A `next` / return-to value is only honoured when it is a path on this
 * origin. A plain `startsWith("/") && !startsWith("//")` check is not enough:
 * WHATWG URL parsing (used by browsers and `new URL`) treats `\` like `/` and
 * strips tab/newline characters, so `/\evil.com` or `/\t/evil.com` resolve to
 * `https://evil.com/`. This helper rejects those forms and confirms the value
 * still resolves to the same origin.
 */

const PROBE_ORIGIN = "https://same-origin.invalid";
const DEFAULT_MAX_LENGTH = 512;

export function safeRelativePath(
  next?: string | null,
  options?: { maxLength?: number }
): string | undefined {
  if (typeof next !== "string" || next.length === 0) return undefined;
  if (next.length > (options?.maxLength ?? DEFAULT_MAX_LENGTH)) return undefined;
  if (!next.startsWith("/")) return undefined;
  // Second character `/` or `\` makes the value scheme-relative to browsers.
  if (next[1] === "/" || next[1] === "\\") return undefined;
  // Backslashes and ASCII control characters (incl. tab/CR/LF, which URL
  // parsers silently strip) have no place in a legitimate return path.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return undefined;

  try {
    const resolved = new URL(next, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) return undefined;
  } catch {
    return undefined;
  }
  return next;
}
