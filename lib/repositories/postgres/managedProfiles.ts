/**
 * Test-only Postgres managed-profile adapters — not exported from lib/repositories/index.ts.
 * Policy row + protected-repos child table mirror Mongo ManagedProfilePolicy.protectedRepos[].
 */

import { count, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  managedProfilePolicies,
  managedProfileProtectedRepos
} from "@/lib/db/postgres/schema";

type ProtectedRepo = {
  repoHash: string;
  label?: string | null;
  mode?: string;
  enabled?: boolean;
};

type ManagedProfilePolicyLean = {
  policyId: string;
  accountId: string;
  timezone?: string;
  enabled?: boolean;
  workHours?: unknown;
  duringHoursMode?: string;
  outsideHoursMode?: string;
  defaultMode?: string;
  toolModes?: unknown;
  pausePolicy?: unknown;
  protectedRepos: ProtectedRepo[];
  createdAt?: Date;
  updatedAt?: Date;
};

function normalizeProtectedRepos(value: unknown): ProtectedRepo[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      repoHash: String(entry.repoHash ?? ""),
      label: typeof entry.label === "string" ? entry.label : null,
      mode: typeof entry.mode === "string" ? entry.mode : "required",
      enabled: entry.enabled !== false
    }))
    .filter((entry) => entry.repoHash.length > 0);
}

async function loadProtectedRepos(
  db: BehalfPostgresDb,
  policyId: string
): Promise<ProtectedRepo[]> {
  const rows = await db.query.managedProfileProtectedRepos.findMany({
    where: eq(managedProfileProtectedRepos.policyId, policyId)
  });
  return rows.map((row) => ({
    repoHash: row.repoHash,
    label: row.label,
    mode: row.mode,
    enabled: row.enabled
  }));
}

export async function findManagedProfilePolicyByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<ManagedProfilePolicyLean | null> {
  const row =
    (await db.query.managedProfilePolicies.findFirst({
      where: eq(managedProfilePolicies.accountId, accountId)
    })) ?? null;

  if (!row) {
    return null;
  }

  return {
    policyId: row.policyId,
    accountId: row.accountId,
    timezone: row.timezone,
    enabled: row.enabled,
    workHours: row.workHours,
    duringHoursMode: row.duringHoursMode,
    outsideHoursMode: row.outsideHoursMode,
    defaultMode: row.defaultMode,
    toolModes: row.toolModes,
    pausePolicy: row.pausePolicy,
    protectedRepos: await loadProtectedRepos(db, row.policyId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function findManagedProfilePolicyProtectedReposByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<{ protectedRepos: ProtectedRepo[] } | null> {
  const policy = await findManagedProfilePolicyByAccountId(db, accountId);
  if (!policy) {
    return null;
  }
  return { protectedRepos: policy.protectedRepos };
}

export async function countProtectedReposByAccountId(db: BehalfPostgresDb, accountId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(managedProfileProtectedRepos)
    .where(eq(managedProfileProtectedRepos.accountId, accountId));

  return row?.value ?? 0;
}

export async function upsertManagedProfilePolicy(
  db: BehalfPostgresDb,
  accountId: string,
  policyId: string,
  policy: Record<string, unknown>
): Promise<ManagedProfilePolicyLean> {
  const protectedRepos = normalizeProtectedRepos(policy.protectedRepos);
  const {
    protectedRepos: _ignored,
    policyId: _policyId,
    accountId: _accountId,
    ...policyFields
  } = policy;

  await db.delete(managedProfilePolicies).where(eq(managedProfilePolicies.accountId, accountId));

  await db.insert(managedProfilePolicies).values({
    policyId,
    accountId,
    timezone: typeof policyFields.timezone === "string" ? policyFields.timezone : "UTC",
    enabled: policyFields.enabled === true,
    workHours: (policyFields.workHours as object | undefined) ?? {},
    duringHoursMode:
      typeof policyFields.duringHoursMode === "string" ? policyFields.duringHoursMode : "managed",
    outsideHoursMode:
      typeof policyFields.outsideHoursMode === "string"
        ? policyFields.outsideHoursMode
        : "unmanaged",
    defaultMode:
      typeof policyFields.defaultMode === "string" ? policyFields.defaultMode : "unmanaged",
    toolModes: (policyFields.toolModes as object | undefined) ?? {},
    pausePolicy: (policyFields.pausePolicy as object | undefined) ?? {}
  });

  if (protectedRepos.length > 0) {
    await db.insert(managedProfileProtectedRepos).values(
      protectedRepos.map((repo) => ({
        policyId,
        accountId,
        repoHash: repo.repoHash,
        label: repo.label ?? null,
        mode: repo.mode ?? "required",
        enabled: repo.enabled !== false
      }))
    );
  }

  const stored = await findManagedProfilePolicyByAccountId(db, accountId);
  if (!stored) {
    throw new Error("Failed to load managed profile policy after upsert");
  }
  return stored;
}
