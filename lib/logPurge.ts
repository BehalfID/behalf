import { PLANS, getLogRetentionDays, type Plan } from "@/lib/plans";
import { listAccounts } from "@/lib/repositories/accounts";
import { deleteAccessLogs } from "@/lib/repositories/sites";
import { deleteLogs } from "@/lib/repositories/verificationLogs";

/** Extra days after plan retention before physical delete. */
export const LOG_PURGE_GRACE_DAYS = 7;

/** Max documents deleted per collection per plan batch. */
export const LOG_PURGE_BATCH_LIMIT = 5_000;

export type LogPurgeSummary = {
  graceDays: number;
  verificationLogsDeleted: number;
  siteAccessLogsDeleted: number;
  orphanVerificationLogsDeleted: number;
  orphanSiteAccessLogsDeleted: number;
  byPlan: Record<
    string,
    {
      accounts: number;
      cutoffIso: string;
      verificationDeleted: number;
      siteAccessDeleted: number;
    }
  >;
};

function cutoffForRetentionDays(retentionDays: number, now: Date): Date {
  const ms = (retentionDays + LOG_PURGE_GRACE_DAYS) * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

async function deleteVerificationOlderThan(
  filter: Record<string, unknown>,
  cutoff: Date
): Promise<number> {
  const result = await deleteLogs({ ...filter, createdAt: { $lt: cutoff } });
  return result?.deletedCount ?? 0;
}

async function deleteSiteAccessOlderThan(
  filter: Record<string, unknown>,
  cutoff: Date
): Promise<number> {
  const result = await deleteAccessLogs({ ...filter, createdAt: { $lt: cutoff } });
  return result?.deletedCount ?? 0;
}

/**
 * Physically delete verification and site-access logs older than each account's
 * plan retention window plus a grace period. Orphaned logs (unknown accountId)
 * use the longest plan retention so we never delete more aggressively than any
 * paid tier would allow.
 */
export async function purgeExpiredLogs(now = new Date()): Promise<LogPurgeSummary> {
  const summary: LogPurgeSummary = {
    graceDays: LOG_PURGE_GRACE_DAYS,
    verificationLogsDeleted: 0,
    siteAccessLogsDeleted: 0,
    orphanVerificationLogsDeleted: 0,
    orphanSiteAccessLogsDeleted: 0,
    byPlan: {}
  };

  for (const plan of PLANS) {
    const retentionDays = getLogRetentionDays(plan);
    const cutoff = cutoffForRetentionDays(retentionDays, now);
    const accountIds = (await listAccounts({ plan }, "accountId")).map((a) => a.accountId);

    let verificationDeleted = 0;
    let siteAccessDeleted = 0;

    if (accountIds.length > 0) {
      verificationDeleted = await deleteVerificationOlderThan(
        { accountId: { $in: accountIds } },
        cutoff
      );
      siteAccessDeleted = await deleteSiteAccessOlderThan(
        { accountId: { $in: accountIds } },
        cutoff
      );
    }

    summary.verificationLogsDeleted += verificationDeleted;
    summary.siteAccessLogsDeleted += siteAccessDeleted;
    summary.byPlan[plan] = {
      accounts: accountIds.length,
      cutoffIso: cutoff.toISOString(),
      verificationDeleted,
      siteAccessDeleted
    };
  }

  const longestRetention = Math.max(...PLANS.map((p: Plan) => getLogRetentionDays(p)));
  const orphanCutoff = cutoffForRetentionDays(longestRetention, now);
  const knownAccountIds = (await listAccounts({}, "accountId")).map((a) => a.accountId);

  const orphanFilter =
    knownAccountIds.length > 0
      ? {
          $or: [{ accountId: null }, { accountId: { $nin: knownAccountIds } }]
        }
      : { accountId: null };

  summary.orphanVerificationLogsDeleted = await deleteVerificationOlderThan(
    orphanFilter,
    orphanCutoff
  );
  summary.orphanSiteAccessLogsDeleted = await deleteSiteAccessOlderThan(
    orphanFilter,
    orphanCutoff
  );

  summary.verificationLogsDeleted += summary.orphanVerificationLogsDeleted;
  summary.siteAccessLogsDeleted += summary.orphanSiteAccessLogsDeleted;

  return summary;
}
