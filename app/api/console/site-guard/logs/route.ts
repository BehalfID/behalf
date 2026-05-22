import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import SiteAccessLog from "@/models/SiteAccessLog";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const accountId = await getConsoleAccountId();
  const logs = await SiteAccessLog.find({ accountId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id requestId siteId developerUserId ruleId domain path userAgent agentIdentifier allowed reason risk createdAt")
    .lean();

  return NextResponse.json({ logs });
}
