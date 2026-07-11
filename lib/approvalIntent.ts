import { createHash } from "node:crypto";
import { redactSecrets } from "@/lib/secretRedaction";
import { lexicalNormalizePath } from "@/lib/pathCanonical";

export const APPROVAL_INTENT_VERSION = 1 as const;
/** Bounded preview length persisted for Action Inbox display. */
export const APPROVAL_PREVIEW_MAX_LENGTH = 500;
export const APPROVAL_TARGET_REQUIRED_REASON =
  "Approval target is required for this action.";
export const LEGACY_UNBOUND_APPROVAL_MESSAGE =
  "This approval predates intent binding. Retry the agent action to create a bound request.";

export type ApprovalArgumentKind = "command" | "file_path";

export type ApprovalIntent = {
  version: typeof APPROVAL_INTENT_VERSION;
  kind: ApprovalArgumentKind;
  canonicalValue: string;
  fingerprint: string;
  preview: string;
  previewTruncated: boolean;
};

const BINDABLE_ACTIONS = new Set(["execute_command", "read_file", "write_file"]);

export function isBindableAgentAction(action: string | null | undefined): boolean {
  return typeof action === "string" && BINDABLE_ACTIONS.has(action);
}

function isAbsolutePath(normalized: string): boolean {
  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith("//")
  );
}

/**
 * Lexical file-path canonicalization for approval fingerprints.
 * Does not require the file to exist and does not use realpath.
 */
export function canonicalizeFilePathForApproval(
  filePath: string,
  cwd?: string,
  home?: string
): string | null {
  if (typeof filePath !== "string" || !filePath.trim()) return null;

  let normalized = lexicalNormalizePath(filePath);
  if (!normalized) return null;

  const homeNorm = home ? lexicalNormalizePath(home) : undefined;
  if (homeNorm && (normalized === "~" || normalized.startsWith("~/"))) {
    normalized =
      normalized === "~"
        ? homeNorm
        : lexicalNormalizePath(`${homeNorm}/${normalized.slice(2)}`);
  }

  if (!isAbsolutePath(normalized) && cwd) {
    const cwdNorm = lexicalNormalizePath(cwd);
    if (cwdNorm) {
      normalized = lexicalNormalizePath(
        cwdNorm.endsWith("/") ? cwdNorm + normalized : `${cwdNorm}/${normalized}`
      );
    }
  }

  return normalized || null;
}

/**
 * Command approval binds to the complete extracted command string with no
 * whitespace normalization. Empty / whitespace-only commands are rejected.
 */
export function canonicalizeCommandForApproval(command: string): string | null {
  if (typeof command !== "string" || !command.trim()) return null;
  return command;
}

function fingerprintPayload(kind: ApprovalArgumentKind, canonicalValue: string): string {
  // Stable key order — do not rely on object-key iteration order.
  return JSON.stringify({
    version: APPROVAL_INTENT_VERSION,
    kind,
    value: canonicalValue
  });
}

export function fingerprintApprovalIntent(
  kind: ApprovalArgumentKind,
  canonicalValue: string
): string {
  return createHash("sha256").update(fingerprintPayload(kind, canonicalValue), "utf8").digest("hex");
}

export function buildApprovalPreview(canonicalValue: string): {
  preview: string;
  previewTruncated: boolean;
} {
  const redacted = redactSecrets(canonicalValue);
  if (redacted.length <= APPROVAL_PREVIEW_MAX_LENGTH) {
    return { preview: redacted, previewTruncated: false };
  }
  return {
    preview: redacted.slice(0, APPROVAL_PREVIEW_MAX_LENGTH),
    previewTruncated: true
  };
}

function makeIntent(kind: ApprovalArgumentKind, canonicalValue: string): ApprovalIntent {
  const { preview, previewTruncated } = buildApprovalPreview(canonicalValue);
  return {
    version: APPROVAL_INTENT_VERSION,
    kind,
    canonicalValue,
    fingerprint: fingerprintApprovalIntent(kind, canonicalValue),
    preview,
    previewTruncated
  };
}

/**
 * Build a versioned approval intent from already-extracted policy arguments.
 * Returns null when the action is not bindable or the target is missing/invalid.
 */
export function buildApprovalIntent(input: {
  action: string;
  command?: string | null;
  filePath?: string | null;
  cwd?: string | null;
  home?: string | null;
}): ApprovalIntent | null {
  if (!isBindableAgentAction(input.action)) return null;

  if (input.action === "execute_command") {
    if (!input.command) return null;
    const canonical = canonicalizeCommandForApproval(input.command);
    if (!canonical) return null;
    return makeIntent("command", canonical);
  }

  if (!input.filePath) return null;
  const canonical = canonicalizeFilePathForApproval(
    input.filePath,
    input.cwd ?? undefined,
    input.home ?? undefined
  );
  if (!canonical) return null;
  return makeIntent("file_path", canonical);
}

export function isLegacyUnboundBindableApproval(approval: {
  action?: string | null;
  kind?: string | null;
  argumentKind?: string | null;
  argumentFingerprint?: string | null;
  argumentPreview?: string | null;
}): boolean {
  if (approval.kind === "managed_profile_pause") return false;
  if (!isBindableAgentAction(approval.action)) return false;
  return !isValidBoundApprovalFields(approval);
}

export function isValidBoundApprovalFields(approval: {
  argumentKind?: string | null;
  argumentFingerprint?: string | null;
  argumentPreview?: string | null;
}): boolean {
  const kindOk = approval.argumentKind === "command" || approval.argumentKind === "file_path";
  const fingerprintOk =
    typeof approval.argumentFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(approval.argumentFingerprint);
  const previewOk =
    typeof approval.argumentPreview === "string" && approval.argumentPreview.length > 0;
  return kindOk && fingerprintOk && previewOk;
}
