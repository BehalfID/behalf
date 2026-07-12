import { findAccountByIdLean, findAccountBySlugLean } from "@/lib/repositories/accounts";
import {
  accountIdSlugSuffix,
  normalizeWorkspaceSlug,
  validateWorkspaceSlug,
  WORKSPACE_SLUG_MAX_LENGTH,
  WORKSPACE_SLUG_PATTERN,
  isReservedWorkspaceSlug
} from "@/lib/workspaceSlug";

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
 * Generate a unique slug. Prefers the normalized name; on collision appends a
 * stable suffix from accountId. Never loops indefinitely.
 * Server-only — do not import from client components.
 */
export async function generateUniqueWorkspaceSlug(
  input: string,
  accountId?: string
): Promise<string> {
  const base = normalizeWorkspaceSlug(input);
  const existing = await findAccountBySlugLean(base);
  if (!existing || (accountId && existing.accountId === accountId)) {
    if (!validateWorkspaceSlug(base)) return base;
  }

  const suffix = accountIdSlugSuffix(accountId ?? `acct_${base}`);
  const candidate = withSuffix(base === "workspace" ? "workspace" : base, suffix);
  const collision = await findAccountBySlugLean(candidate);
  if (!collision || (accountId && collision.accountId === accountId)) {
    return candidate;
  }

  const fallback = withSuffix("workspace", suffix);
  const fallbackCollision = await findAccountBySlugLean(fallback);
  if (!fallbackCollision || (accountId && fallbackCollision.accountId === accountId)) {
    return fallback;
  }

  const extended = accountIdSlugSuffix(`${accountId ?? "acct"}x${suffix}`);
  return withSuffix("ws", extended);
}

export async function ensureAccountHasSlug(accountId: string): Promise<string | null> {
  const account = await findAccountByIdLean(accountId, "accountId name companyName slug");
  if (!account) return null;
  const existing = typeof account.slug === "string" ? account.slug.trim().toLowerCase() : "";
  if (existing && !validateWorkspaceSlug(existing)) {
    return existing;
  }

  const seed =
    (typeof account.companyName === "string" && account.companyName.trim()) ||
    (typeof account.name === "string" && account.name.trim()) ||
    "workspace";
  const slug = await generateUniqueWorkspaceSlug(seed, accountId);
  const Account = (await import("@/models/Account")).default;
  await Account.updateOne(
    { accountId, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
    { $set: { slug } }
  );
  const refreshed = await findAccountByIdLean(accountId, "slug");
  return refreshed?.slug ?? slug;
}
