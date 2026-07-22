import { and, eq, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { policyDocuments } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  PolicyDocumentLean,
  UpsertPolicyInput
} from "@/lib/repositories/policyDocuments";

type PolicyRow = typeof policyDocuments.$inferSelect;

function toLean(row: PolicyRow): PolicyDocumentLean {
  return {
    policyId: row.policyId,
    accountId: row.accountId,
    name: row.name ?? undefined,
    version: row.version,
    enabled: row.enabled,
    rules: (row.rules ?? []) as PolicyDocumentLean["rules"],
    updatedBy: row.updatedBy ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  } as PolicyDocumentLean;
}

export async function findActivePolicyByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<PolicyDocumentLean | null> {
  const row =
    (await db.query.policyDocuments.findFirst({
      where: and(eq(policyDocuments.accountId, accountId), eq(policyDocuments.enabled, true))
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findPolicyByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<PolicyDocumentLean | null> {
  const row =
    (await db.query.policyDocuments.findFirst({
      where: eq(policyDocuments.accountId, accountId)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function upsertPolicyDocument(
  db: BehalfPostgresDb,
  input: UpsertPolicyInput
): Promise<PolicyDocumentLean> {
  try {
    const existing = await findPolicyByAccountId(db, input.accountId);
    if (!existing) {
      const [row] = await db
        .insert(policyDocuments)
        .values({
          policyId: input.policyId,
          accountId: input.accountId,
          name: input.name,
          version: 1,
          enabled: input.enabled,
          rules: input.rules,
          updatedBy: input.updatedBy
        })
        .returning();
      if (!row) throw new Error("upsertPolicyDocument failed to return a row");
      return toLean(row);
    }

    const [row] = await db
      .update(policyDocuments)
      .set({
        name: input.name,
        enabled: input.enabled,
        rules: input.rules,
        updatedBy: input.updatedBy,
        version: sql`${policyDocuments.version} + 1`,
        updatedAt: new Date()
      })
      .where(eq(policyDocuments.accountId, input.accountId))
      .returning();
    if (!row) throw new Error("upsertPolicyDocument update failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updatePolicyDocument(
  db: BehalfPostgresDb,
  accountId: string,
  update: Partial<Pick<PolicyDocumentLean, "name" | "enabled" | "rules" | "updatedBy">>
): Promise<PolicyDocumentLean | null> {
  const existing = await findPolicyByAccountId(db, accountId);
  if (!existing) return null;

  const set: Record<string, unknown> = {
    version: sql`${policyDocuments.version} + 1`,
    updatedAt: new Date()
  };
  if (update.name !== undefined) set.name = update.name;
  if (update.enabled !== undefined) set.enabled = update.enabled;
  if (update.rules !== undefined) set.rules = update.rules;
  if (update.updatedBy !== undefined) set.updatedBy = update.updatedBy;

  const [row] = await db
    .update(policyDocuments)
    .set(set)
    .where(eq(policyDocuments.accountId, accountId))
    .returning();
  return row ? toLean(row) : null;
}

export async function deletePolicyDocument(db: BehalfPostgresDb, accountId: string) {
  const rows = await db
    .delete(policyDocuments)
    .where(eq(policyDocuments.accountId, accountId))
    .returning({ policyId: policyDocuments.policyId });
  return { acknowledged: true, deletedCount: rows.length };
}
