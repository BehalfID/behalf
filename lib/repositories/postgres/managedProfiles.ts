import { count, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  managedProfilePolicies,
  managedProfileProtectedRepos
} from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

type PolicyRow = typeof managedProfilePolicies.$inferSelect;
type RepoRow = typeof managedProfileProtectedRepos.$inferSelect;

export type ProtectedRepoDomain = {
  repoHash: string;
  label: string | null;
  mode: string;
  enabled: boolean;
};

export type ManagedProfilePolicyDomain = {
  policyId: string;
  accountId: string;
  timezone: string;
  enabled: boolean;
  workHours: Record<string, unknown>;
  duringHoursMode: string;
  outsideHoursMode: string;
  defaultMode: string;
  toolModes: Record<string, unknown>;
  pausePolicy: Record<string, unknown>;
  protectedRepos: ProtectedRepoDomain[];
  createdAt: Date;
  updatedAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeRepo(row: RepoRow): ProtectedRepoDomain {
  return {
    repoHash: row.repoHash,
    label: row.label,
    mode: row.mode,
    enabled: row.enabled
  };
}

function normalizePolicy(row: PolicyRow, repos: RepoRow[]): ManagedProfilePolicyDomain {
  return {
    policyId: row.policyId,
    accountId: row.accountId,
    timezone: row.timezone,
    enabled: row.enabled,
    workHours: asRecord(row.workHours),
    duringHoursMode: row.duringHoursMode,
    outsideHoursMode: row.outsideHoursMode,
    defaultMode: row.defaultMode,
    toolModes: asRecord(row.toolModes),
    pausePolicy: asRecord(row.pausePolicy),
    protectedRepos: repos.map(normalizeRepo),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function loadReposForPolicy(
  db: BehalfPostgresDb,
  policyId: string
): Promise<RepoRow[]> {
  return db.query.managedProfileProtectedRepos.findMany({
    where: eq(managedProfileProtectedRepos.policyId, policyId)
  });
}

export async function findManagedProfilePolicyByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<ManagedProfilePolicyDomain | null> {
  const row =
    (await db.query.managedProfilePolicies.findFirst({
      where: eq(managedProfilePolicies.accountId, accountId)
    })) ?? null;
  if (!row) return null;
  const repos = await loadReposForPolicy(db, row.policyId);
  return normalizePolicy(row, repos);
}

export async function findManagedProfilePolicyProtectedReposByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<{ protectedRepos: ProtectedRepoDomain[] } | null> {
  const policy = await findManagedProfilePolicyByAccountId(db, accountId);
  if (!policy) return null;
  return { protectedRepos: policy.protectedRepos };
}

export async function countProtectedReposByAccountId(
  db: BehalfPostgresDb,
  accountId: string
) {
  const [row] = await db
    .select({ value: count() })
    .from(managedProfileProtectedRepos)
    .where(eq(managedProfileProtectedRepos.accountId, accountId));
  return row?.value ?? 0;
}

type ProtectedRepoInput = {
  repoHash: string;
  label?: string | null;
  mode?: string;
  enabled?: boolean;
};

function parseProtectedRepos(value: unknown): ProtectedRepoInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    .map((entry) => ({
      repoHash: String(entry.repoHash ?? ""),
      label: (entry.label as string | null | undefined) ?? null,
      mode: typeof entry.mode === "string" ? entry.mode : "required",
      enabled: typeof entry.enabled === "boolean" ? entry.enabled : true
    }))
    .filter((entry) => entry.repoHash.length > 0);
}

export async function upsertManagedProfilePolicy(
  db: BehalfPostgresDb,
  accountId: string,
  policyId: string,
  policy: Record<string, unknown>
): Promise<ManagedProfilePolicyDomain> {
  const hasProtectedRepos = Object.prototype.hasOwnProperty.call(policy, "protectedRepos");
  const {
    protectedRepos: protectedReposInput,
    policyId: _policyId,
    accountId: _accountId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...policyFields
  } = policy;

  try {
    return await db.transaction(async (tx) => {
      const existing =
        (await tx.query.managedProfilePolicies.findFirst({
          where: eq(managedProfilePolicies.accountId, accountId)
        })) ?? null;

      const priorRepos = existing
        ? await tx.query.managedProfileProtectedRepos.findMany({
            where: eq(managedProfileProtectedRepos.policyId, existing.policyId)
          })
        : [];

      let row: PolicyRow;

      if (!existing) {
        const [inserted] = await tx
          .insert(managedProfilePolicies)
          .values({
            policyId,
            accountId,
            ...(policyFields as Partial<typeof managedProfilePolicies.$inferInsert>)
          })
          .returning();
        if (!inserted) throw new Error("upsertManagedProfilePolicy insert failed");
        row = inserted;
      } else if (existing.policyId === policyId) {
        const [updated] = await tx
          .update(managedProfilePolicies)
          .set({
            ...(policyFields as Partial<typeof managedProfilePolicies.$inferInsert>),
            updatedAt: new Date()
          })
          .where(eq(managedProfilePolicies.policyId, policyId))
          .returning();
        if (!updated) throw new Error("upsertManagedProfilePolicy update failed");
        row = updated;
      } else {
        // accountId is unique; policyId is PK — replace row when identity changes.
        await tx
          .delete(managedProfilePolicies)
          .where(eq(managedProfilePolicies.policyId, existing.policyId));
        const [inserted] = await tx
          .insert(managedProfilePolicies)
          .values({
            policyId,
            accountId,
            timezone: (policyFields.timezone as string | undefined) ?? existing.timezone,
            enabled:
              typeof policyFields.enabled === "boolean"
                ? policyFields.enabled
                : existing.enabled,
            workHours: (policyFields.workHours as object | undefined) ?? existing.workHours,
            duringHoursMode:
              (policyFields.duringHoursMode as string | undefined) ?? existing.duringHoursMode,
            outsideHoursMode:
              (policyFields.outsideHoursMode as string | undefined) ?? existing.outsideHoursMode,
            defaultMode:
              (policyFields.defaultMode as string | undefined) ?? existing.defaultMode,
            toolModes: (policyFields.toolModes as object | undefined) ?? existing.toolModes,
            pausePolicy:
              (policyFields.pausePolicy as object | undefined) ?? existing.pausePolicy
          })
          .returning();
        if (!inserted) throw new Error("upsertManagedProfilePolicy replace failed");
        row = inserted;
      }

      const nextRepos = hasProtectedRepos
        ? parseProtectedRepos(protectedReposInput)
        : existing?.policyId === policyId
          ? null
          : priorRepos.map((repo) => ({
              repoHash: repo.repoHash,
              label: repo.label,
              mode: repo.mode,
              enabled: repo.enabled
            }));

      if (nextRepos) {
        await tx
          .delete(managedProfileProtectedRepos)
          .where(eq(managedProfileProtectedRepos.policyId, row.policyId));
        if (nextRepos.length) {
          await tx.insert(managedProfileProtectedRepos).values(
            nextRepos.map((repo) => ({
              policyId: row.policyId,
              accountId,
              repoHash: repo.repoHash,
              label: repo.label ?? null,
              mode: repo.mode ?? "required",
              enabled: repo.enabled ?? true
            }))
          );
        }
      }

      const repos = await tx.query.managedProfileProtectedRepos.findMany({
        where: eq(managedProfileProtectedRepos.policyId, row.policyId)
      });
      return normalizePolicy(row, repos);
    });
  } catch (error) {
    translatePostgresError(error);
  }
}

export function createPostgresManagedProfilePolicyRepository(db: BehalfPostgresDb) {
  return {
    findOne: async (filter: Record<string, unknown>) => {
      if (typeof filter.accountId === "string") {
        return findManagedProfilePolicyByAccountId(db, filter.accountId);
      }
      if (typeof filter.policyId === "string") {
        const row =
          (await db.query.managedProfilePolicies.findFirst({
            where: eq(managedProfilePolicies.policyId, filter.policyId)
          })) ?? null;
        if (!row) return null;
        const repos = await loadReposForPolicy(db, row.policyId);
        return normalizePolicy(row, repos);
      }
      throw new Error("Unsupported managed profile policy filter");
    }
  };
}
