import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { retentionSince } from "@/lib/quota";
import {
  buildVerificationLogQuery,
  calculateVerificationLogSummary,
  logsToCsv,
  parseLogListParams,
  withAgentNames,
  type VerificationLogListItem
} from "@/lib/verificationLogs";
import VerificationLog from "@/models/VerificationLog";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { limit, page, skip, format } = parseLogListParams(request.nextUrl.searchParams);
  const query = buildVerificationLogQuery(
    request.nextUrl.searchParams,
    { developerUserId: auth.user.userId },
    { retentionStart: retentionSince(auth.account?.plan) }
  );

  const [rawLogs, total, summaryLogs] = await Promise.all([
    VerificationLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
      .lean<VerificationLogListItem[]>(),
    VerificationLog.countDocuments(query),
    VerificationLog.find(query)
      .sort({ createdAt: -1 })
      .limit(1000)
      .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
      .lean<VerificationLogListItem[]>()
  ]);
  const logs = await withAgentNames(rawLogs, { developerUserId: auth.user.userId });
  const summary = calculateVerificationLogSummary(summaryLogs);
  const pagination = { limit, page, total, hasMore: skip + logs.length < total };

  if (format === "csv") {
    return new NextResponse(logsToCsv(logs), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"behalfid-verification-logs.csv\""
      }
    });
  }

  return NextResponse.json({ logs, summary, pagination });
}
