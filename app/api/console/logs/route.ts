import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import VerificationLog from "@/models/VerificationLog";

export async function GET(request: NextRequest) {
  const authError = requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get("agentId")?.trim();
  const allowed = searchParams.get("allowed")?.trim();

  const query: Record<string, unknown> = { accountId };
  if (agentId) {
    query.agentId = agentId;
  }

  if (allowed === "true") {
    query.allowed = true;
  } else if (allowed === "false") {
    query.allowed = false;
  }

  const logs = await VerificationLog.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
    )
    .lean();

  return NextResponse.json({ logs });
}
