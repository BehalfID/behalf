import { hashCliRepo } from "@/lib/cliRepoHash";
import type { ManagedProfileActivityEvent } from "@/lib/cliAuditActivityTypes";
import type { CliAuditLogDocument } from "@/models/CliAuditLog";

export type { ManagedProfileActivityEvent } from "@/lib/cliAuditActivityTypes";

export function isManagedProfileActivityEventType(
  eventType: string | null | undefined
): eventType is ManagedProfileActivityEvent["eventType"] {
  return !!eventType && EVENT_TYPES.has(eventType);
}

export type ManagedProfileActivityResponse = {
  events: ManagedProfileActivityEvent[];
  nextCursor: string | null;
};

const MANAGED_PROFILE_ACTIVITY_EVENT_TYPES = [
  "cli_session_policy",
  "cli_pause_grant",
  "cli_pause_deny",
  "cli_pause_approval_requested",
] as const;

const EVENT_TYPES = new Set<string>(MANAGED_PROFILE_ACTIVITY_EVENT_TYPES);
const MODES = new Set(["unmanaged", "managed", "required"]);
const TOOLS = new Set(["claude", "codex", "cursor"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const REPO_HASH_RE = /^[a-f0-9]{16}$|^[a-f0-9]{64}$/;
const SAFE_METADATA_KEYS = new Set([
  "sessionid",
  "profileid",
  "profilename",
  "deviceid",
  "expiresat",
  "requestedminutes",
  "leaseid",
  "approvalrequestid",
]);
const SENSITIVE_METADATA_KEY_PARTS = [
  "token",
  "key",
  "secret",
  "password",
  "auth",
  "cookie",
  "remote",
  "path",
  "cwd",
  "reporoot",
  "email",
];

type ActivityCursor = {
  createdAt: string;
  auditId: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSensitiveMetadataKey(key: string) {
  const normalized = key.toLowerCase();
  if (SAFE_METADATA_KEYS.has(normalized)) return false;
  return SENSITIVE_METADATA_KEY_PARTS.some((part) => normalized.includes(part));
}

function isSensitiveMetadataString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^ssh:\/\//i.test(trimmed)) return true;
  if (/^git@[^/]+:/.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true;
  if (/^[A-Za-z]:\\/.test(trimmed)) return true;
  return false;
}

/** Exported for tests — store only policy repo hashes, never raw remotes or paths. */
export function sanitizeCliAuditRepo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (REPO_HASH_RE.test(trimmed)) return trimmed;
  return hashCliRepo(trimmed);
}

export function sanitizeCliAuditMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveMetadataKey(key)) continue;
    if (typeof value === "string") {
      if (isSensitiveMetadataString(value)) continue;
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeActivityCursor(value: string | null): ActivityCursor | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ActivityCursor;
    if (!parsed?.auditId || !parsed?.createdAt) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { auditId: parsed.auditId, createdAt: createdAt.toISOString() };
  } catch {
    return null;
  }
}

export function parseActivityListParams(searchParams: URLSearchParams) {
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const cursor = decodeActivityCursor(searchParams.get("cursor"));
  const tool = searchParams.get("tool")?.trim().toLowerCase() ?? null;
  const mode = searchParams.get("mode")?.trim().toLowerCase() ?? null;
  const eventType = searchParams.get("eventType")?.trim() ?? null;
  const repo = sanitizeCliAuditRepo(searchParams.get("repo"));
  const branch = searchParams.get("branch")?.trim() ?? null;
  const from = validDate(searchParams.get("from"));
  const to = validDate(searchParams.get("to"));

  return { limit, cursor, tool, mode, eventType, repo, branch, from, to };
}

export function buildCliAuditActivityQuery(params: ReturnType<typeof parseActivityListParams>) {
  const query: Record<string, unknown> = {};

  if (params.tool) {
    if (!TOOLS.has(params.tool)) throw new Error("Invalid tool filter.");
    query.tool = params.tool;
  }
  if (params.mode) {
    if (!MODES.has(params.mode)) throw new Error("Invalid mode filter.");
    query.mode = params.mode;
  }
  if (params.eventType) {
    if (!EVENT_TYPES.has(params.eventType)) throw new Error("Invalid eventType filter.");
    query.eventType = params.eventType;
  } else {
    query.eventType = { $in: [...MANAGED_PROFILE_ACTIVITY_EVENT_TYPES] };
  }
  if (params.repo) query.repo = params.repo;
  if (params.branch) query.branch = params.branch;

  const createdAt: Record<string, Date> = {};
  if (params.from) createdAt.$gte = params.from;
  if (params.to) createdAt.$lte = params.to;
  if (Object.keys(createdAt).length) query.createdAt = createdAt;

  if (params.cursor) {
    const cursorDate = new Date(params.cursor.createdAt);
    query.$or = [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, auditId: { $lt: params.cursor.auditId } },
    ];
  }

  return query;
}

export function serializeCliAuditActivityEvent(
  doc: Pick<
    CliAuditLogDocument,
    | "auditId"
    | "eventType"
    | "tool"
    | "mode"
    | "granted"
    | "reason"
    | "repo"
    | "branch"
    | "metadata"
    | "createdAt"
  >
): ManagedProfileActivityEvent {
  const metadata =
    doc.metadata && typeof doc.metadata === "object"
      ? (doc.metadata as Record<string, unknown>)
      : null;

  const expiresAt =
    readMetadataString(metadata, "expiresAt") ??
    (doc.eventType === "cli_pause_grant" ? readMetadataString(metadata, "expiresAt") : null);

  return {
    id: doc.auditId,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : new Date(doc.createdAt).toISOString(),
    eventType: doc.eventType,
    tool: doc.tool ?? null,
    mode: doc.mode ?? null,
    granted: typeof doc.granted === "boolean" ? doc.granted : null,
    reason: doc.reason,
    repo: sanitizeCliAuditRepo(doc.repo),
    branch: doc.branch ?? null,
    deviceId: readMetadataString(metadata, "deviceId"),
    profileId: readMetadataString(metadata, "profileId"),
    profileName: readMetadataString(metadata, "profileName"),
    expiresAt,
  };
}
