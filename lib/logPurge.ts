import { PLANS, getLogRetentionDays, type Plan } from "@/lib/plans";
import { effectiveEntitlements, effectivePlan } from "@/lib/planGrants";
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
      /** Retention window actually applied, which a grant can widen. */
      retentionDays: number;
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
 * retention window plus a grace period. Orphaned logs (unknown accountId) use
 * the longest plan retention so we never delete more aggressively than any paid
 * tier would allow.
 *
 * Accounts are bucketed by *effective* plan, not by `account.plan`. Grouping by
 * the billing plan would purge a comped workspace's logs on the free-tier
 * seven-day window while the product was showing it ninety days of history —
 * an irreversible loss caused by reading the wrong plan field.
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

  const allAccounts = await listAccounts(
    {},
    "accountId plan complimentaryPlan complimentaryPlanExpiresAt"
  );

  // Within a bucket the widest retention wins, so an account is never purged on
  // a shorter window than it holds. That also covers the non-monotonic tiers:
  // a paying "pro" workspace granted "team" reports as team but keeps pro's
  // ninety days, because `effectiveEntitlements` takes the per-field maximum.
  const buckets = new Map<Plan, { accountIds: string[]; retentionDays: number }>();
  for (const account of allAccounts) {
    const plan = effectivePlan(account, now);
    const retention = effectiveEntitlements(account, now).logRetentionDays;
    const bucket = buckets.get(plan) ?? { accountIds: [], retentionDays: 0 };
    bucket.accountIds.push(account.accountId);
    bucket.retentionDays = Math.max(bucket.retentionDays, retention);
    buckets.set(plan, bucket);
  }

  for (const plan of PLANS) {
    const bucket = buckets.get(plan);
    const retentionDays = bucket?.retentionDays ?? getLogRetentionDays(plan);
    const cutoff = cutoffForRetentionDays(retentionDays, now);
    const accountIds = bucket?.accountIds ?? [];

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
      retentionDays,
      cutoffIso: cutoff.toISOString(),
      verificationDeleted,
      siteAccessDeleted
    };
  }

  const longestRetention = Math.max(...PLANS.map((p: Plan) => getLogRetentionDays(p)));
  const orphanCutoff = cutoffForRetentionDays(longestRetention, now);
  const knownAccountIds = allAccounts.map((a) => a.accountId);

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
