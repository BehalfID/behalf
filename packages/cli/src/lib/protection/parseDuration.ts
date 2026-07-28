/**
 * Parse human duration strings for timed activation (e.g. `1h`, `4h`, `30m`, `24h`).
 * Returns an absolute expiry Date relative to `now`.
 */

const DURATION_RE =
  /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i;

export class DurationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurationParseError";
  }
}

/**
 * Parse a duration like `1h`, `4h`, `8h`, `30m`, `24h` into an expiry Date.
 * @throws {DurationParseError} when the input is empty, malformed, or zero.
 */
export function parseDuration(input: string, now: Date = new Date()): Date {
  const raw = (input ?? "").trim();
  if (!raw) {
    throw new DurationParseError(
      'Duration is required (e.g. "1h", "4h", "8h", "30m", "24h").'
    );
  }

  const match = DURATION_RE.exec(raw);
  if (!match) {
    throw new DurationParseError(
      `Invalid duration "${raw}". Use forms like 30m, 1h, 4h, 8h, or 24h.`
    );
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DurationParseError(
      `Duration amount must be a positive integer (got "${match[1]}").`
    );
  }

  const unit = match[2].toLowerCase();
  let ms: number;
  if (unit === "m" || unit.startsWith("min")) {
    ms = amount * 60_000;
  } else if (unit.startsWith("h")) {
    ms = amount * 3_600_000;
  } else if (unit.startsWith("d")) {
    ms = amount * 86_400_000;
  } else {
    throw new DurationParseError(`Unsupported duration unit in "${raw}".`);
  }

  const maxMs = 365 * 86_400_000; // 1 year
  if (ms > maxMs) {
    throw new DurationParseError(
      `Duration "${raw}" exceeds the maximum of 365 days.`
    );
  }

  return new Date(now.getTime() + ms);
}

/** Parse duration and return ISO expiry string. */
export function parseDurationToIso(input: string, now: Date = new Date()): string {
  return parseDuration(input, now).toISOString();
}
