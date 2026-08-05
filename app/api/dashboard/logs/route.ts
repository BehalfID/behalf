import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { retentionSince } from "@/lib/quota";
import {
  buildVerificationLogQuery,
  extractLogEnvironment,
  getVerificationLogSummaryAgg,
  logsToCsv,
  parseLogListParams,
  withAgentNames,
  withApprovalLinks,
  type VerificationLogListItem
} from "@/lib/verificationLogs";
import { serverErrorResponse } from "@/lib/apiErrors";
import { noCacheJson } from "@/lib/responses";
import { countLogs, findLogs } from "@/lib/repositories/verificationLogs";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return noCacheJson({ logs: [], summary: null, pagination: { limit: 0, page: 1, total: 0, hasMore: false } });

  // Repository faults (connection, pooler, schema drift, an unimplemented
  // backend adapter method) must not escape as an unhandled, bodiless 500 —
  // the client can only render "Request failed with 500" and the cause is lost.
  try {
    const { limit, page, skip, format } = parseLogListParams(request.nextUrl.searchParams);
    const query = buildVerificationLogQuery(
      request.nextUrl.searchParams,
      { ...accountScopeFilter(actor.accountId) },
      { retentionStart: retentionSince(auth.account?.plan) }
    );

    // Fetch the page of logs and the total count in parallel.
    // Summary stats are computed via an aggregation pipeline to avoid fetching
    // up to 1000 documents into JavaScript just for counting.
    const [rawLogs, total, summary] = await Promise.all([
      // Await the repository result directly — never a Mongo query method.
      // The Mongo adapter returns a thenable query (awaiting it resolves the
      // same lean rows `.lean()` would) and the Postgres adapter returns a
      // plain Promise of an array, which has no `.lean()`; calling it there
      // threw `TypeError: findLogs(...).lean is not a function`.
      // sort/limit/skip/select stay inside `options`, honoured by both adapters.
      findLogs(query, {
        sort: { createdAt: -1 },
        limit: limit,
        skip: skip,
        select:
          "-_id requestId agentId permissionId action amount vendor allowed approvalRequired reason risk shadow metadata createdAt"
      }) as Promise<VerificationLogListItem[]>,
      countLogs(query),
      getVerificationLogSummaryAgg(query)
    ]);
    const withEnvironment = rawLogs.map((log) => ({
      ...log,
      environment: extractLogEnvironment(log.metadata ?? null)
    }));
    const withNames = await withAgentNames(withEnvironment, { accountId: actor.accountId });
    const logs = await withApprovalLinks(withNames, { accountId: actor.accountId });
    const pagination = { limit, page, total, hasMore: skip + logs.length < total };

    if (format === "csv") {
      const csvResponse = new NextResponse(logsToCsv(logs), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"behalfid-verification-logs.csv\"",
          "Cache-Control": "no-store, private"
        }
      });
      return csvResponse;
    }

    return noCacheJson({ logs, summary, pagination });
  } catch (error) {
    return serverErrorResponse("dashboard.logs.list", error, {
      userId: auth.user.userId,
      accountId: actor.accountId
    });
  }
}
