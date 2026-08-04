import { jsonError } from "@/lib/responses";

/**
 * Safe wording for an unexpected server fault. Deliberately generic: the cause
 * belongs in the server log, never in a response to the browser.
 */
const SAFE_MESSAGE = "Something went wrong loading this data. Please try again.";

type ErrorContext = Record<string, unknown>;

/**
 * Serializes an unknown throw for the server log without losing the stack or a
 * database driver's error code (Postgres surfaces SQLSTATE on `code`).
 */
function describe(error: unknown): ErrorContext {
  if (error instanceof Error) {
    const extra = error as Error & { code?: unknown; detail?: unknown; constraint?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(extra.code === undefined ? {} : { code: extra.code }),
      ...(extra.detail === undefined ? {} : { detail: extra.detail }),
      ...(extra.constraint === undefined ? {} : { constraint: extra.constraint })
    };
  }
  return { name: "NonError", message: String(error) };
}

/**
 * Logs the full failure server-side and returns a structured, safe 500.
 *
 * Dashboard read routes previously let repository exceptions escape, so Next.js
 * returned an unhandled 500 with no body — the client then fell back to
 * "Request failed with 500" and the server-side cause was never captured with
 * request context. This keeps the failure loud (still a 500, no fabricated
 * data) while making it diagnosable and giving the user a readable message.
 */
export function serverErrorResponse(scope: string, error: unknown, context?: ErrorContext) {
  console.error(`[api] ${scope} failed`, { scope, ...context, error: describe(error) });
  return jsonError(SAFE_MESSAGE, 500, { code: "internal_error" });
}
