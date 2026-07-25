import { connectToDatabase } from "@/lib/db";
import { deleteDeveloperUser } from "@/lib/accountDeletion";
import DeveloperUser from "@/models/DeveloperUser";

export const UNVERIFIED_ACCOUNT_RETENTION_MS = 1000 * 60 * 60 * 24 * 3;

export type UnverifiedAccountCleanupSummary = {
  scanned: number;
  deleted: number;
  errors: number;
};

/**
 * Permanently remove developer accounts that remain unverified past the retention window.
 */
export async function cleanupUnverifiedAccounts(
  retentionMs = UNVERIFIED_ACCOUNT_RETENTION_MS
): Promise<UnverifiedAccountCleanupSummary> {
  await connectToDatabase();

  const cutoff = new Date(Date.now() - retentionMs);
  const staleUsers = await DeveloperUser.find({
    emailVerified: false,
    createdAt: { $lte: cutoff }
  })
    .select("userId")
    .lean();

  const summary: UnverifiedAccountCleanupSummary = {
    scanned: staleUsers.length,
    deleted: 0,
    errors: 0
  };

  for (const user of staleUsers) {
    try {
      const result = await deleteDeveloperUser(user.userId);
      if (result.ok) {
        summary.deleted += 1;
      } else {
        summary.errors += 1;
      }
    } catch {
      summary.errors += 1;
    }
  }

  return summary;
}
