import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import DeveloperUser from "@/models/DeveloperUser";
import ApprovalRequest from "@/models/ApprovalRequest";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalAgents,
    activePermissions,
    logsToday,
    lastLog,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    highRiskToday
  ] = await Promise.all([
    Agent.countDocuments({ accountId }),
    Permission.countDocuments({ accountId, status: "active" }),
    VerificationLog.countDocuments({ accountId, createdAt: { $gte: startOfDay } }),
    VerificationLog.findOne({ accountId })
      .sort({ createdAt: -1 })
      .select("-_id requestId agentId agentName action allowed reason risk createdAt")
      .lean(),
    DeveloperUser.countDocuments({}),
    DeveloperUser.countDocuments({ createdAt: { $gte: startOfDay } }),
    ApprovalRequest.countDocuments({ accountId, status: "pending" }).catch(() => 0),
    VerificationLog.countDocuments({ accountId, risk: "high", createdAt: { $gte: startOfDay } }).catch(() => 0)
  ]);

  return NextResponse.json({
    totalAgents,
    activePermissions,
    logsToday,
    lastVerification: lastLog ?? null,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    highRiskToday
  });
}
