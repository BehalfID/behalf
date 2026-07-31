import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
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

function fieldCondition(key: string, value: unknown): SQL {
  const column = columns[key];
  if (!column) {
    throw new Error(`Unsupported account filter field: ${key}`);
  }
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const operators = Object.entries(value as Record<string, unknown>).map(([operator, operand]) => {
      switch (operator) {
        case "$in":
          return inArray(column, operand as unknown[]);
        default:
          throw new Error(`Unsupported account filter operator: ${operator}`);
      }
    });
    return and(...operators)!;
  }
  if (key === "slug" && typeof value === "string") {
    return eq(column, value.trim().toLowerCase());
  }
  return eq(column, value);
}

function buildWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    conditions.push(fieldCondition(key, value));
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
  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported account update field: ${key}`);
      result[key] = null;
    }
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

export const createAccountDocument = createAccount;
export const findAccounts = listAccounts;
export const findOneAccount = findAccount;
export const countAccountDocuments = countAccounts;

export async function findOneAndUpdateAccount(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
): Promise<AccountLean | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(accounts)
      .where(buildWhere(filter))
      .limit(1)
      .for("update");
    if (!before) return null;
    try {
      const [after] = await tx
        .update(accounts)
        .set(normalizeUpdate(update))
        .where(eq(accounts.accountId, before.accountId))
        .returning();
      const row = options.returnDocument === "after" || options.new === true ? after : before;
      return row ? toLean(row) : null;
    } catch (error) {
      translatePostgresError(error);
    }
  });
}

export async function updateAccountByFilter(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ accountId: accounts.accountId })
      .from(accounts)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    try {
      const rows = await tx
        .update(accounts)
        .set(normalizeUpdate(update))
        .where(eq(accounts.accountId, match.accountId))
        .returning({ accountId: accounts.accountId });
      return { acknowledged: true, matchedCount: 1, modifiedCount: rows.length };
    } catch (error) {
      translatePostgresError(error);
    }
  });
}

function ssoDomainMatches(row: AccountRow, domain: string): boolean {
  const sso = row.sso as
    | { enabled?: boolean; enforce?: boolean; allowedEmailDomains?: string[] }
    | null
    | undefined;
  if (!sso?.enabled || !Array.isArray(sso.allowedEmailDomains)) return false;
  const normalized = domain.trim().toLowerCase();
  return sso.allowedEmailDomains.some((entry) => entry.trim().toLowerCase() === normalized);
}

/** Accounts with SSO enabled+enforced that list this email domain. */
export async function findAccountsEnforcingSsoForDomain(db: BehalfPostgresDb, domain: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        sql`(${accounts.sso}->>'enabled')::boolean = true`,
        sql`(${accounts.sso}->>'enforce')::boolean = true`
      )
    );
  return rows.filter((row) => ssoDomainMatches(row, domain)).map(toLean);
}

/** SSO-enabled accounts among the given IDs that list this email domain. */
export async function findAccountsWithSsoForDomain(
  db: BehalfPostgresDb,
  accountIds: string[],
  domain: string
) {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        inArray(accounts.accountId, accountIds),
        sql`(${accounts.sso}->>'enabled')::boolean = true`
      )
    );
  return rows.filter((row) => ssoDomainMatches(row, domain)).map(toLean);
}
