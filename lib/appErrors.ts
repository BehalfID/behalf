import { jsonError } from "@/lib/responses";

/**
 * Stable app-level API error codes (auth, verify, workspace, generic).
 *
 * Quota failures keep using {@link QuotaErrorCode} via `quotaErrorDetails`.
 * Both land in the same response field: `{ error, code?, hint?, ... }`.
 *
 * Installer codes (`InstallerErrorCode`) stay package-local.
 */
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "INVALID_ORIGIN"
  | "INVALID_DEVELOPER_TOKEN"
  | "SESSION_REQUIRED"
  | "AGENT_AUTH_REQUIRED"
  | "AGENT_API_KEY_MISMATCH"
  | "AGENT_NOT_FOUND"
  | "AGENT_ACCOUNT_MISMATCH"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_ACCESS_DENIED"
  | "WORKSPACE_ACCOUNT_REQUIRED"
  | "AUTHORITY_FORBIDDEN"
  | "VIEWER_MUTATION_FORBIDDEN"
  | "RATE_LIMIT_EXCEEDED"
  | "VERIFY_FAILED_CLOSED"
  | "NOT_FOUND";

export type AppErrorDetails = {
  code: AppErrorCode;
  hint?: string;
};

/** Optional default hints for CLI / operator display. Callers may override. */
const DEFAULT_HINTS: Partial<Record<AppErrorCode, string>> = {
  AUTH_REQUIRED: "Sign in with `behalf login`, or pass a valid session / API key.",
  EMAIL_VERIFICATION_REQUIRED: "Verify your email, then try again.",
  INVALID_DEVELOPER_TOKEN: "Check X-Developer-Token or create a new developer token.",
  SESSION_REQUIRED: "This action requires a developer session (not an agent API key).",
  AGENT_AUTH_REQUIRED: "Pass Authorization: Bearer <agent API key> (bhf_sk_…).",
  AGENT_API_KEY_MISMATCH: "Use the API key issued for this agentId.",
  AGENT_NOT_FOUND: "Confirm agentId, or create the agent first.",
  AGENT_ACCOUNT_MISMATCH: "Use a developer token from the same workspace as the agent.",
  WORKSPACE_NOT_FOUND: "Check the workspace slug or URL.",
  WORKSPACE_ACCESS_DENIED: "Ask a workspace admin to invite you.",
  WORKSPACE_ACCOUNT_REQUIRED: "Select or create a workspace account first.",
  AUTHORITY_FORBIDDEN: "Ask a higher-authority workspace member to perform this action.",
  VIEWER_MUTATION_FORBIDDEN: "Viewers are read-only; ask an editor or admin.",
  RATE_LIMIT_EXCEEDED: "Wait briefly and retry, or reduce request rate.",
  VERIFY_FAILED_CLOSED: "Retry shortly; verification failed closed for safety.",
  NOT_FOUND: "Confirm the resource id and that it belongs to this workspace."
};

/**
 * Shape for `jsonError` details — mirrors `quotaErrorDetails` for the shared
 * `{ error, code?, hint? }` contract consumed by the CLI.
 */
export function appErrorDetails(
  code: AppErrorCode,
  hint?: string | null
): AppErrorDetails {
  const resolved = hint === null ? undefined : hint ?? DEFAULT_HINTS[code];
  return resolved ? { code, hint: resolved } : { code };
}

/** Convenience: `jsonError` with a stable AppErrorCode (+ optional hint). */
export function jsonAppError(
  message: string,
  status: number,
  code: AppErrorCode,
  hint?: string | null
) {
  return jsonError(message, status, appErrorDetails(code, hint));
}

/**
 * Map agent auth failure strings from `authenticateAgent` / `authenticateApiKey`
 * to a coded JSON error response.
 */
export function agentAuthJsonError(error: string | null | undefined) {
  const message = error ?? "Missing or invalid API key.";
  if (message === "Unknown agent.") {
    return jsonAppError(message, 404, "AGENT_NOT_FOUND");
  }
  if (message === "API key does not match this agent.") {
    return jsonAppError(message, 401, "AGENT_API_KEY_MISMATCH");
  }
  return jsonAppError(message, 401, "AGENT_AUTH_REQUIRED");
}

/*
 * Remaining high-traffic routes still returning `{ error }` only (no AppErrorCode yet):
 * - Most validation 400s (missing fields, unknown JSON keys)
 * - Billing / Stripe portal + checkout failures
 * - Console/admin auth paths
 * - Webhook CRUD not-found (dashboard/webhooks/*)
 * - Site / permission-profile / adaptive-delegation resource 404s
 * - Invite accept / membership seat quota (quota codes already cover seats)
 * - Google OAuth complete / device auth poll edge cases
 */
