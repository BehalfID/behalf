import { and, count, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { accounts } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { AccountLean } from "@/lib/repositories/accounts";

type AccountRow = typeof accounts.$inferSelect;
type AccountInsert = typeof accounts.$inferInsert;

const columns: Record<string, AnyPgColumn> = {
  accountId: accounts.accountId,
  slug: accounts.slug,
  name: accounts.name,
  accountType: accounts.accountType,
  companyName: accounts.companyName,
  website: accounts.website,
  teamSize: accounts.teamSize,
  onboarding: accounts.onboarding,
  plan: accounts.plan,
  stripeCustomerId: accounts.stripeCustomerId,
  stripeSubscriptionId: accounts.stripeSubscriptionId,
  stripeSubscriptionStatus: accounts.stripeSubscriptionStatus,
  stripeTrialEnd: accounts.stripeTrialEnd,
  stripeCurrentPeriodEnd: accounts.stripeCurrentPeriodEnd,
  verificationCount: accounts.verificationCount,
  verificationPeriodStart: accounts.verificationPeriodStart,
  sso: accounts.sso,
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt
};

function toLean(row: AccountRow): AccountLean {
  return row as unknown as AccountLean;
}

function buildWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    const column = columns[key];
    if (!column) {
      throw new Error(`Unsupported account filter field: ${key}`);
    }
    if (key === "slug" && typeof value === "string") {
      conditions.push(eq(column, value.trim().toLowerCase()));
      continue;
    }
    conditions.push(eq(column, value));
  }
  return conditions.length ? and(...conditions) : undefined;
}

function normalizeUpdate(update: Record<string, unknown>): Partial<AccountInsert> {
  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!columns[key] || key === "createdAt" || key === "updatedAt") {
      if (!columns[key]) throw new Error(`Unsupported account update field: ${key}`);
      continue;
    }
    if (key === "slug" && typeof value === "string") {
      result.slug = value.trim().toLowerCase();
      continue;
    }
    result[key] = value;
  }
  return { ...result, updatedAt: new Date() } as Partial<AccountInsert>;
}

const DEFAULT_LEAN_COLUMNS = {
  accountId: true,
  name: true,
  slug: true,
  companyName: true
} as const;

function columnsFromSelect(select?: string) {
  if (!select) return DEFAULT_LEAN_COLUMNS;
  const fields = select.trim().split(/\s+/).filter(Boolean);
  const result: Record<string, boolean> = {};
  for (const field of fields) {
    if (field.startsWith("-") || field.startsWith("+")) continue;
    if (columns[field]) result[field] = true;
  }
  return Object.keys(result).length ? result : DEFAULT_LEAN_COLUMNS;
}

export async function findAccountById(db: BehalfPostgresDb, accountId: string) {
  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.accountId, accountId)
    })) ?? null
  );
}

export async function findAccountByIdLean(
  db: BehalfPostgresDb,
  accountId: string,
  select?: string
) {
  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.accountId, accountId),
      columns: columnsFromSelect(select)
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

export async function findAccountBySlugLean(
  db: BehalfPostgresDb,
  slug: string,
  select?: string
) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return (
    (await db.query.accounts.findFirst({
      where: eq(accounts.slug, normalized),
      columns: columnsFromSelect(select)
    })) ?? null
  );
}

export async function findAccount(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  _select?: string
): Promise<AccountLean | null> {
  const [row] = await db.select().from(accounts).where(buildWhere(filter)).limit(1);
  return row ? toLean(row) : null;
}

export async function listAccounts(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  _select?: string
): Promise<AccountLean[]> {
  const rows = await db.select().from(accounts).where(buildWhere(filter));
  return rows.map(toLean);
}

export async function createAccount(
  db: BehalfPostgresDb,
  input: Omit<AccountLean, "_id" | "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db
      .insert(accounts)
      .values({
        ...(input as AccountInsert),
        slug:
          typeof input.slug === "string" && input.slug
            ? input.slug.trim().toLowerCase()
            : (input.slug as string | null | undefined)
      })
      .returning();
    if (!row) throw new Error("createAccount failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateAccount(
  db: BehalfPostgresDb,
  accountId: string,
  update: Record<string, unknown>
) {
  try {
    const rows = await db
      .update(accounts)
      .set(normalizeUpdate(update))
      .where(eq(accounts.accountId, accountId))
      .returning({ accountId: accounts.accountId });
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findAccountAndUpdate(
  db: BehalfPostgresDb,
  accountId: string,
  update: Record<string, unknown>
): Promise<AccountLean | null> {
  try {
    const [row] = await db
      .update(accounts)
      .set(normalizeUpdate(update))
      .where(eq(accounts.accountId, accountId))
      .returning();
    return row ? toLean(row) : null;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function countAccounts(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  const [row] = await db.select({ value: count() }).from(accounts).where(buildWhere(filter));
  return row?.value ?? 0;
}

export async function resetVerificationPeriod(
  db: BehalfPostgresDb,
  accountId: string,
  periodStart: Date
) {
  return db
    .update(accounts)
    .set({ verificationCount: 1, verificationPeriodStart: periodStart, updatedAt: new Date() })
    .where(eq(accounts.accountId, accountId));
}

export async function incrementVerificationCount(db: BehalfPostgresDb, accountId: string) {
  return db
    .update(accounts)
    .set({
      verificationCount: sql`${accounts.verificationCount} + 1`,
      updatedAt: new Date()
    })
    .where(eq(accounts.accountId, accountId));
}
