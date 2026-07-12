import { eq, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { accounts } from "@/lib/db/postgres/schema";

export async function findAccountById(db: BehalfPostgresDb, accountId: string) {
  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.accountId, accountId)
    })) ?? null
  );
}

export async function findAccountBySlug(db: BehalfPostgresDb, slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.slug, normalized)
    })) ?? null
  );
}

export async function resetVerificationPeriod(
  db: BehalfPostgresDb,
  accountId: string,
  periodStart: Date
) {
  return db
    .update(accounts)
    .set({ verificationCount: 1, verificationPeriodStart: periodStart })
    .where(eq(accounts.accountId, accountId));
}

export async function incrementVerificationCount(db: BehalfPostgresDb, accountId: string) {
  return db
    .update(accounts)
    .set({ verificationCount: sql`${accounts.verificationCount} + 1` })
    .where(eq(accounts.accountId, accountId));
}
