import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalAgents, activePermissions, logsToday, lastLog] = await Promise.all([
    Agent.countDocuments({ accountId }),
    Permission.countDocuments({ accountId, status: "active" }),
    VerificationLog.countDocuments({ accountId, createdAt: { $gte: startOfDay } }),
    VerificationLog.findOne({ accountId })
      .sort({ createdAt: -1 })
      .select("-_id requestId agentId action allowed reason risk createdAt")
      .lean()
  ]);

  return NextResponse.json({
    totalAgents,
    activePermissions,
    logsToday,
    lastVerification: lastLog ?? null
  });
}
