import Account from "@/models/Account";
import AccountMembership from "@/models/AccountMembership";
import DeveloperSession from "@/models/DeveloperSession";
import { cache } from "react";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/authority";
import { findAccountBySlugLean } from "@/lib/repositories/accounts";
import { jsonError } from "@/lib/responses";
import { normalizeWorkspaceSlug, validateWorkspaceSlug } from "@/lib/workspaceSlug";
import type { NextResponse } from "next/server";

export type UserAccountSummary = {
  accountId: string;
  slug: string | null;
  name: string;
  role: WorkspaceRole;
  isPrimary: boolean;
};

export type WorkspaceSlugResolution = {
  accountId: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
};

export type WorkspaceSlugError = {
  error: NextResponse;
  status: 403 | 404;
};

export async function listUserAccounts(
  userId: string,
  primaryAccountId: string | null | undefined
): Promise<UserAccountSummary[]> {
  const memberships = await AccountMembership.find({ userId }).sort({ createdAt: 1 }).lean();
  if (memberships.length === 0) return [];

  const accountIds = memberships.map((membership) => membership.accountId);
  const accounts = await Account.find({ accountId: { $in: accountIds } })
    .select("accountId name slug")
    .lean();
  const byAccountId = new Map(
    accounts.map((account) => [
      account.accountId,
      { name: account.name, slug: account.slug ?? null }
    ])
  );

  return memberships.map((membership) => {
    const account = byAccountId.get(membership.accountId);
    return {
      accountId: membership.accountId,
      slug: account?.slug ?? null,
      name: account?.name ?? membership.accountId,
      role: isWorkspaceRole(membership.role) ? membership.role : "VIEWER",
      isPrimary: membership.accountId === primaryAccountId
    };
  });
}

export async function resolveActiveAccountId(
  userId: string,
  options: {
    sessionActiveAccountId?: string | null;
    sessionId?: string;
    primaryAccountId?: string | null;
  }
): Promise<string | null> {
  const memberships = await AccountMembership.find({ userId }).select("accountId").lean();
  const memberAccountIds = new Set(memberships.map((membership) => membership.accountId));

  if (
    options.sessionActiveAccountId &&
    !memberAccountIds.has(options.sessionActiveAccountId) &&
    options.sessionId
  ) {
    await DeveloperSession.updateOne(
      { sessionId: options.sessionId, userId },
      { $unset: { activeAccountId: "" } }
    );
  }

  if (options.sessionActiveAccountId && memberAccountIds.has(options.sessionActiveAccountId)) {
    return options.sessionActiveAccountId;
  }

  if (options.primaryAccountId && memberAccountIds.has(options.primaryAccountId)) {
    return options.primaryAccountId;
  }

  if (memberships.length > 0) {
    return memberships[0]?.accountId ?? null;
  }

  return options.primaryAccountId ?? null;
}

export async function switchActiveAccount(
  userId: string,
  sessionId: string,
  accountId: string
): Promise<{ ok: true; accountId: string; slug: string | null; name: string } | { error: string }> {
  const membership = await AccountMembership.findOne({ userId, accountId }).lean();
  if (!membership) {
    return { error: "You do not have access to that workspace." };
  }

  const account = await Account.findOne({ accountId }).select("accountId name slug").lean();
  if (!account) {
    return { error: "Workspace account not found." };
  }

  await DeveloperSession.updateOne({ sessionId, userId }, { $set: { activeAccountId: accountId } });
  return {
    ok: true,
    accountId,
    slug: account.slug ?? null,
    name: account.name
  };
}

/**
 * Resolve a workspace by URL slug for a specific user.
 * Normalize input, exact unique account match, verify active membership.
 * 404 for nonexistent/invalid slugs; 403 when the workspace exists but user cannot access it.
 */
export async function resolveWorkspaceForUserBySlug(
  userId: string,
  slugInput: string
): Promise<{ workspace: WorkspaceSlugResolution } | WorkspaceSlugError> {
  const lookupSlug = normalizeWorkspaceSlug(slugInput);
  if (validateWorkspaceSlug(lookupSlug) !== null) {
    return { error: jsonError("Workspace not found.", 404), status: 404 };
  }

  // Exact unique match on stored slug (normalization only affects the query key).
  const account = await findAccountBySlugLean(lookupSlug, "accountId name slug");
  if (!account?.slug || account.slug !== lookupSlug) {
    return { error: jsonError("Workspace not found.", 404), status: 404 };
  }

  const membership = await AccountMembership.findOne({
    userId,
    accountId: account.accountId
  }).lean();

  if (!membership) {
    return { error: jsonError("You do not have access to this workspace.", 403), status: 403 };
  }

  return {
    workspace: {
      accountId: account.accountId,
      slug: account.slug,
      name: account.name,
      role: isWorkspaceRole(membership.role) ? membership.role : "VIEWER"
    }
  };
}

/** Server Component request memoization only; authorization is re-read next request. */
export const requireWorkspaceMembershipBySlug = cache(resolveWorkspaceForUserBySlug);
