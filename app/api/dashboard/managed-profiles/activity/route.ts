import { type NextRequest } from "next/server";
import { accountScopeFilter } from "@/lib/accountAccess";
import {
  buildCliAuditActivityQuery,
  encodeActivityCursor,
  parseActivityListParams,
  serializeCliAuditActivityEvent,
} from "@/lib/cliAuditActivity";
import { getRequestAccountId, requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { connectToDatabase } from "@/lib/db";
import { jsonError, noCacheJson } from "@/lib/responses";
import CliAuditLog from "@/models/CliAuditLog";

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

  let query: Record<string, unknown>;
  try {
    query = buildCliAuditActivityQuery(params);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid query parameters.", 400);
  }

  await connectToDatabase();

  const docs = await CliAuditLog.find({ ...accountScopeFilter(actor.accountId), ...query })
    .sort({ createdAt: -1, auditId: -1 })
    .limit(params.limit + 1)
    .select("auditId eventType tool mode granted reason repo branch metadata createdAt -_id")
    .lean();

  const page = docs.slice(0, params.limit);
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
