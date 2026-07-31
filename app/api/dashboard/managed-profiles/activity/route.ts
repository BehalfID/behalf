import { type NextRequest } from "next/server";
import {
  encodeActivityCursor,
  isManagedProfileActivityEventType,
  parseActivityListParams,
  serializeCliAuditActivityEvent,
} from "@/lib/cliAuditActivity";
import { getRequestAccountId, requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { findAuditLogs } from "@/lib/repositories/cli";
import { jsonError, noCacheJson } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = getRequestAccountId(auth);
  if (!accountId) return jsonError("Workspace account required.", 403);

  const actor = await getWorkspaceActor(auth.user.userId, accountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  let params;
  try {
    params = parseActivityListParams(request.nextUrl.searchParams);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid query parameters.", 400);
  }

  if (params.tool && !["claude", "codex", "cursor"].includes(params.tool)) {
    return jsonError("Invalid tool filter.", 400);
  }
  if (params.mode && !["unmanaged", "managed", "required"].includes(params.mode)) {
    return jsonError("Invalid mode filter.", 400);
  }
  if (
    params.eventType &&
    !isManagedProfileActivityEventType(params.eventType)
  ) {
    return jsonError("Invalid eventType filter.", 400);
  }

  const docs = await findAuditLogs({
    accountId: actor.accountId,
    tool: params.tool ?? undefined,
    mode: params.mode ?? undefined,
    eventType: params.eventType
      ? params.eventType
      : {
          $in: [
            "cli_session_policy",
            "cli_pause_grant",
            "cli_pause_deny",
            "cli_pause_approval_requested",
          ],
        },
    repo: params.repo ?? undefined,
    branch: params.branch ?? undefined,
    from: params.from,
    to: params.to,
    cursor: params.cursor,
    limit: params.limit + 1,
  });

  const page = docs
    .slice(0, params.limit)
    .filter((doc) => isManagedProfileActivityEventType(doc.eventType));
  const events = page.map((doc) => serializeCliAuditActivityEvent(doc));

  let nextCursor: string | null = null;
  if (docs.length > params.limit) {
    const last = page[page.length - 1];
    if (last?.auditId && last.createdAt) {
      nextCursor = encodeActivityCursor({
        auditId: last.auditId,
        createdAt:
          last.createdAt instanceof Date
            ? last.createdAt.toISOString()
            : new Date(last.createdAt).toISOString(),
      });
    }
  }

  return noCacheJson({ events, nextCursor });
}
