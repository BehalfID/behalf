import { type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import {
  getVerificationOutcomeTotals,
  getVerificationSeries,
  utcDayWindow
} from "@/lib/adminAnalytics";
import { noCacheJson } from "@/lib/responses";
import { countAccountDocuments } from "@/lib/repositories/accounts";
import { countAgents } from "@/lib/repositories/agents";
import { countApprovals } from "@/lib/repositories/approvals";
import { countPermissions } from "@/lib/repositories/permissions";
import { countUserDocuments } from "@/lib/repositories/users";
import { countLogs, findOneLog } from "@/lib/repositories/verificationLogs";

const ACTIVITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Console health summary.
 *
 * Every count here is platform-wide. The console is the internal admin view, so
 * scoping verification metrics to one workspace while counting users and
 * workspaces globally would report two different populations side by side.
 *
 * "Today" means the current UTC calendar day, matching the UTC buckets used by
 * the activity series. The UI labels the timezone.
 */
export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const now = new Date();
  const today = utcDayWindow(now);
  const activityStart = new Date(today.end.getTime() - ACTIVITY_DAYS * DAY_MS);

  const [
    totalAgents,
    activePermissions,
    lastLog,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    totalAuditLogs,
    totalCustomers,
    paidCustomers,
    todayTotals,
    dailyActivity
  ] = await Promise.all([
    countAgents({}),
    countPermissions({ status: "active" }),
    findOneLog({}, { select: "-_id requestId agentId action allowed approvalRequired shadow reason risk createdAt" }),
    countUserDocuments({}),
    countUserDocuments({ createdAt: { $gte: today.start, $lt: today.end } }),
    countApprovals({ status: "pending" }).catch(() => 0),
    countLogs({}),
    countAccountDocuments({}),
    countAccountDocuments({ plan: { $in: ["pro", "team", "business", "enterprise"] } }),
    getVerificationOutcomeTotals({ start: today.start, end: today.end }),
    getVerificationSeries({ start: activityStart, end: today.end, granularity: "day" })
  ]);

  const totals = todayTotals ?? {
    attempts: 0,
    enforced: 0,
    allowed: 0,
    denied: 0,
    approvalRequired: 0,
    indeterminate: 0,
    shadow: 0,
    highRisk: 0
  };

  // Rates are fractions of enforced attempts. A zero denominator yields null
  // rather than 0 — "no traffic today" is not "a 0% deny rate".
  const denyRatePercent = totals.enforced > 0
    ? Math.round((totals.denied / totals.enforced) * 100)
    : null;

  return noCacheJson({
    timezone: "UTC",
    asOf: now.toISOString(),
    totalAgents,
    activePermissions,
    lastVerification: lastLog ?? null,
    totalUsers,
    newUsersToday,
    pendingApprovals,
    totalAuditLogs,
    totalCustomers,
    paidCustomers,
    // Today's verification activity, split by the canonical outcome taxonomy.
    // Enforced totals exclude shadow mode, which is reported on its own.
    today: {
      attempts: totals.attempts,
      enforced: totals.enforced,
      allowed: totals.allowed,
      denied: totals.denied,
      approvalRequired: totals.approvalRequired,
      indeterminate: totals.indeterminate,
      shadow: totals.shadow,
      highRisk: totals.highRisk,
      denyRatePercent
    },
    logsToday: totals.attempts,
    highRiskToday: totals.highRisk,
    dailyActivity
  });
}
