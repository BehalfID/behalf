import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PROTECTION_EVENTS_LOG_NAME = "protection-events.jsonl";

export type ProtectionEventType =
  | "protection.prompted"
  | "protection.enabled.session"
  | "protection.enabled.timed"
  | "protection.enabled.repository"
  | "protection.enabled.always"
  | "protection.skipped"
  | "protection.expired"
  | "protection.reset";

export type ProtectionEventDetail = {
  mode?: string;
  source?: string;
  reason?: string;
  decisionId?: string;
  repositoryRoot?: string;
  expiresAt?: string;
  sessionId?: string;
  agent?: string;
  always?: boolean;
  timed?: boolean;
  repositories?: string;
  /** Free-form non-secret metadata only. */
  [key: string]: unknown;
};

export type ProtectionEvent = {
  ts: string;
  type: ProtectionEventType;
} & ProtectionEventDetail;

function getLogsDir(): string {
  return join(homedir(), ".behalf", "logs");
}

export function getProtectionEventsLogPath(): string {
  return join(getLogsDir(), PROTECTION_EVENTS_LOG_NAME);
}

/**
 * Append a single JSON line to `~/.behalf/logs/protection-events.jsonl`.
 * Never logs secrets or full env — only safe local metadata (e.g. repositoryRoot).
 */
export function appendProtectionEvent(
  type: ProtectionEventType,
  detail: ProtectionEventDetail = {},
  now: Date = new Date()
): void {
  const dir = getLogsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const safe: ProtectionEventDetail = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined) continue;
    // Deny-list obvious secret-ish keys
    if (/secret|token|password|api[_-]?key|authorization|cookie|env/i.test(key)) {
      continue;
    }
    safe[key] = value;
  }

  const event: ProtectionEvent = {
    ts: now.toISOString(),
    type,
    ...safe,
  };

  appendFileSync(
    getProtectionEventsLogPath(),
    JSON.stringify(event) + "\n",
    { mode: 0o600 }
  );
}
