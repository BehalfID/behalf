import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import DeveloperUser from "@/models/DeveloperUser";
import ApprovalRequest from "@/models/ApprovalRequest";
import Account from "@/models/Account";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Last 14 days for the graph
  const days14Ago = new Date();
  days14Ago.setDate(days14Ago.getDate() - 13);
  days14Ago.setHours(0, 0, 0, 0);

  const [
    totalAgents,
    activePermissions,
    logsToday,
    lastLog,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    highRiskToday,
    totalAuditLogs,
    allowedToday,
    deniedToday,
    totalCustomers,
    paidCustomers,
    dailyLogDocs
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
    VerificationLog.countDocuments({ accountId, risk: "high", createdAt: { $gte: startOfDay } }).catch(() => 0),
    VerificationLog.countDocuments({ accountId }),
    VerificationLog.countDocuments({ accountId, allowed: true, createdAt: { $gte: startOfDay } }).catch(() => 0),
    VerificationLog.countDocuments({ accountId, allowed: false, createdAt: { $gte: startOfDay } }).catch(() => 0),
    Account.countDocuments({}),
    Account.countDocuments({ plan: { $in: ["pro", "enterprise"] } }),
    VerificationLog.aggregate([
      { $match: { accountId, createdAt: { $gte: days14Ago } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          total: { $sum: 1 },
          allowed: { $sum: { $cond: ["$allowed", 1, 0] } },
          denied: { $sum: { $cond: ["$allowed", 0, 1] } }
        }
      },
      { $sort: { _id: 1 } }
    ]).catch(() => [])
  ]);

  const errorRateToday = logsToday > 0 ? Math.round((deniedToday / logsToday) * 100) : 0;

  // Build a full 14-day array (fill gaps with zeros)
  const dailyMap = new Map<string, { total: number; allowed: number; denied: number }>();
  for (const doc of dailyLogDocs as Array<{ _id: string; total: number; allowed: number; denied: number }>) {
    dailyMap.set(doc._id, { total: doc.total, allowed: doc.allowed, denied: doc.denied });
  }
  const dailyActivity: Array<{ date: string; total: number; allowed: number; denied: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(key) ?? { total: 0, allowed: 0, denied: 0 };
    dailyActivity.push({ date: key, ...entry });
  }

  return NextResponse.json({
    totalAgents,
    activePermissions,
    logsToday,
    lastVerification: lastLog ?? null,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    highRiskToday,
    totalAuditLogs,
    errorRateToday,
    totalCustomers,
    paidCustomers,
    dailyActivity
  });
}
