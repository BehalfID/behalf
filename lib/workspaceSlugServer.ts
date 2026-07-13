import crypto from "crypto";
import { ACCOUNT_SETUP_LAUNCH } from "@/lib/onboarding";
import { findAccountByIdLean, findAccountBySlugLean } from "@/lib/repositories/accounts";
import {
  normalizeWorkspaceSlug,
  validateWorkspaceSlug,
  WORKSPACE_SLUG_MAX_LENGTH,
  WORKSPACE_SLUG_PATTERN,
  isReservedWorkspaceSlug
} from "@/lib/workspaceSlug";

export class WorkspaceSlugAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceSlugAllocationError";
  }
}

/** Deterministic hex suffix from the full public accountId (not a secret). */
export function stableAccountIdSuffix(accountId: string, length: 8 | 12): string {
  return crypto.createHash("sha256").update(accountId).digest("hex").slice(0, length);
}

function withSuffix(base: string, suffix: string): string {
  const sep = "-";
  const maxBase = WORKSPACE_SLUG_MAX_LENGTH - sep.length - suffix.length;
  const trimmedBase = base.slice(0, Math.max(1, maxBase)).replace(/-+$/g, "") || "workspace";
  const candidate = `${trimmedBase}${sep}${suffix}`;
  if (isReservedWorkspaceSlug(candidate) || !WORKSPACE_SLUG_PATTERN.test(candidate)) {
    return `workspace-${suffix}`.slice(0, WORKSPACE_SLUG_MAX_LENGTH);
  }
  return candidate;
}

/**
 * Bounded deterministic candidate list:
 *   base
 *   base-<stable8>
 *   base-<stable12>
 *   workspace-<stable12>
 */
export function buildWorkspaceSlugCandidates(input: string, accountId: string): string[] {
  const base = normalizeWorkspaceSlug(input);
  const s8 = stableAccountIdSuffix(accountId, 8);
  const s12 = stableAccountIdSuffix(accountId, 12);
  const raw = [base, withSuffix(base, s8), withSuffix(base, s12), withSuffix("workspace", s12)];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const candidate of raw) {
    if (seen.has(candidate)) continue;
    if (validateWorkspaceSlug(candidate) !== null) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }
  if (candidates.length === 0) {
    throw new WorkspaceSlugAllocationError(
      "Unable to build any valid workspace slug candidates."
    );
  }
  return candidates;
}

export function isMongoDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: number; message?: string };
  if (maybe.code === 11000) return true;
  return typeof maybe.message === "string" && /E11000/i.test(maybe.message);
}

/**
 * Pick the first candidate not owned by another account.
 * Never returns an unchecked candidate; throws after the bounded list is exhausted.
 */
export async function generateUniqueWorkspaceSlug(
  input: string,
  accountId: string
): Promise<string> {
  if (!accountId) {
    throw new WorkspaceSlugAllocationError("accountId is required to allocate a workspace slug.");
  }
  const candidates = buildWorkspaceSlugCandidates(input, accountId);
  for (const candidate of candidates) {
    const existing = await findAccountBySlugLean(candidate);
    if (!existing || existing.accountId === accountId) {
      return candidate;
    }
  }
  throw new WorkspaceSlugAllocationError(
    "Unable to allocate a unique workspace slug after exhausting deterministic candidates."
  );
}

/**
 * Persist a slug via writeFn, retrying the next deterministic candidate on E11000.
 * writeFn receives the candidate slug and must throw on duplicate-key conflicts.
 */
export async function assignSlugWithDuplicateRetry(
  input: string,
  accountId: string,
  writeFn: (slug: string) => Promise<void>
): Promise<string> {
  const candidates = buildWorkspaceSlugCandidates(input, accountId);
  let lastError: unknown;
  for (const candidate of candidates) {
    const existing = await findAccountBySlugLean(candidate);
    if (existing && existing.accountId !== accountId) {
      continue;
    }
    try {
      await writeFn(candidate);
      return candidate;
    } catch (error) {
      lastError = error;
      if (isMongoDuplicateKeyError(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new WorkspaceSlugAllocationError(
    `Unable to allocate a unique workspace slug after duplicate-key retries.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ""
    }`
  );
}

export type WorkspaceSlugSeedInput = {
  accountType?: string | null;
  companyName?: string | null;
  name?: string | null;
};

/**
 * Permanent slug seed assigned at onboarding completion:
 *   1. companyName for business accounts;
 *   2. workspace display name (Account.name);
 *   3. stable "workspace" fallback.
 */
export function resolvePermanentWorkspaceSlugSeed(input: WorkspaceSlugSeedInput): string {
  if (input.accountType === "business") {
    const company = typeof input.companyName === "string" ? input.companyName.trim() : "";
    if (company) return company;
  }
  const workspace = typeof input.name === "string" ? input.name.trim() : "";
  if (workspace) return workspace;
  return "workspace";
}

type AccountBackfillRow = {
  accountId: string;
  slug?: string | null;
  accountType?: string | null;
  companyName?: string | null;
  name?: string | null;
  createdAt?: Date | string | null;
  verificationCount?: number | null;
};

/**
 * True when a missing slug may be backfilled (legacy / post-onboarding), not mid-signup.
 *
 * Partial onboarding fields (accountType, onboarding.firstSetupGoal) are NOT sufficient —
 * those can be written before onboardingCompletedAt is set.
 *
 * Strong signals only:
 * - created before ACCOUNT_SETUP_LAUNCH;
 * - OWNER membership with DeveloperUser.onboardingCompletedAt;
 * - existing agents;
 * - recorded verification activity (verificationCount > 0).
 */
export async function isAccountEligibleForSlugBackfill(accountId: string): Promise<boolean> {
  const account = (await findAccountByIdLean(
    accountId,
    "accountId accountType companyName name createdAt verificationCount slug"
  )) as AccountBackfillRow | null;
  if (!account) return false;

  const existing = typeof account.slug === "string" ? account.slug.trim().toLowerCase() : "";
  // Valid existing slug is handled by ensureAccountHasSlug before eligibility;
  // do not treat "already has slug" as a backfill signal here.
  if (existing && !validateWorkspaceSlug(existing)) return false;

  const createdAt = account.createdAt ? new Date(account.createdAt) : null;
  if (createdAt && createdAt < ACCOUNT_SETUP_LAUNCH) return true;
  if ((account.verificationCount ?? 0) > 0) return true;

  const Agent = (await import("@/models/Agent")).default;
  if ((await Agent.countDocuments({ accountId })) > 0) return true;

  const AccountMembership = (await import("@/models/AccountMembership")).default;
  const DeveloperUser = (await import("@/models/DeveloperUser")).default;
  const owners = await AccountMembership.find({ accountId, role: "OWNER" })
    .select("userId")
    .lean();
  for (const owner of owners) {
    const user = await DeveloperUser.findOne({ userId: owner.userId })
      .select("onboardingCompletedAt")
      .lean();
    if (user?.onboardingCompletedAt) return true;
  }

  return false;
}

export async function ensureAccountHasSlug(accountId: string): Promise<string | null> {
  const account = (await findAccountByIdLean(
    accountId,
    "accountId name companyName slug accountType createdAt verificationCount onboarding"
  )) as AccountBackfillRow | null;
  if (!account) return null;
  const existing = typeof account.slug === "string" ? account.slug.trim().toLowerCase() : "";
  if (existing && !validateWorkspaceSlug(existing)) {
    return existing;
  }

  if (!(await isAccountEligibleForSlugBackfill(accountId))) {
    return null;
  }

  const seed = resolvePermanentWorkspaceSlugSeed(account);

  const Account = (await import("@/models/Account")).default;
  return assignSlugWithDuplicateRetry(seed, accountId, async (slug) => {
    // Never overwrite an existing valid slug if another writer won the race.
    const latest = await findAccountByIdLean(accountId, "slug");
    const latestSlug = typeof latest?.slug === "string" ? latest.slug.trim().toLowerCase() : "";
    if (latestSlug && !validateWorkspaceSlug(latestSlug)) {
      return;
    }
    const result = await Account.updateOne(
      {
        accountId,
        $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }]
      },
      { $set: { slug } }
    );
    if (result.matchedCount === 0) {
      // Another writer assigned a slug; treat as success if now present.
      const again = await findAccountByIdLean(accountId, "slug");
      if (again?.slug && !validateWorkspaceSlug(again.slug)) {
        return;
      }
    }
    // Detect unique-index races that surface only on conflicting inserts/updates.
    const collision = await findAccountBySlugLean(slug);
    if (collision && collision.accountId !== accountId) {
      const err = new Error("E11000 duplicate key error collection: accounts index: slug");
      (err as { code?: number }).code = 11000;
      throw err;
    }
  }).then(async (assigned) => {
    const refreshed = await findAccountByIdLean(accountId, "slug");
    return refreshed?.slug ?? assigned;
  });
}
