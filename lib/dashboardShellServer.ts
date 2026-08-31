import { AUTHORITY_LEVELS, resolveWorkspaceRole, type WorkspaceRole } from "@/lib/authority";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { userInitials } from "@/lib/dashboardShellPresentation";
import { effectiveEntitlements, effectivePlan, planSource } from "@/lib/planGrants";
import { isUnlimitedLimit } from "@/lib/plans";
import { findMembershipsByUserId } from "@/lib/repositories/memberships";
import { findAccountById } from "@/lib/repositories/accounts";
import type { DashboardShellUser } from "@/components/layout/DashboardShell";

/**
 * Verification usage for the sidebar plan card.
 *
 * `limit` is null for an unlimited plan and `used` is null when the account row
 * could not be read — the card renders a reduced state rather than inventing a
 * number or disappearing without explanation.
 */
export type DashboardShellUsage = {
  used: number | null;
  limit: number | null;
  percent: number | null;
};

export type DashboardShellServerProps = {
  user: DashboardShellUser | null;
  effectivePlan: string | null;
  /** True when a grant is what raises the plan above what is billed. */
  planIsComplimentary: boolean;
  usage: DashboardShellUsage | null;
  /** Whether this actor may perform workspace mutations such as adding an agent. */
  canMutate: boolean;
  role: WorkspaceRole | null;
};

const EMPTY: DashboardShellServerProps = {
  user: null,
  effectivePlan: null,
  planIsComplimentary: false,
  usage: null,
  canMutate: false,
  role: null
};

function displayName(user: { firstName?: string | null; lastName?: string | null; email: string }) {
  const full = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  // Falling back to the email keeps the menu honest rather than inventing a
  // name for accounts that never completed the profile step.
  return full || user.email;
}

/**
 * Resolves everything the sidebar chrome renders, on the server.
 *
 * Identity, plan, usage and authority are all known during SSR, so fetching
 * them from the client would add requests per dashboard page and make the
 * sidebar visibly assemble itself after hydration. `getCurrentDeveloperContext`
 * is request-cached, and the account row already carries the verification
 * counter, so the plan card costs no extra query.
 *
 * `accountId` should be the workspace actually being viewed; without it the
 * session's active account is used, which is correct for the non-workspace
 * `/dashboard` tree.
 */
export async function resolveDashboardShellProps(
  accountId?: string | null
): Promise<DashboardShellServerProps> {
  const context = await getCurrentDeveloperContext();
  if (!context?.user) return EMPTY;

  const user: DashboardShellUser = {
    userId: context.user.userId,
    name: displayName(context.user),
    email: context.user.email,
    initials: userInitials(displayName(context.user), context.user.email)
  };

  const resolvedAccountId = accountId ?? context.activeAccountId;
  if (!resolvedAccountId) return { ...EMPTY, user };

  // A missing account degrades the descriptor, never the whole layout.
  const account = await findAccountById(resolvedAccountId);
  if (!account) return { ...EMPTY, user };

  const entitlements = effectiveEntitlements(account);
  const limit = isUnlimitedLimit(entitlements.monthlyVerifications)
    ? null
    : entitlements.monthlyVerifications;
  const used = typeof account.verificationCount === "number" ? account.verificationCount : null;

  const memberships = await findMembershipsByUserId(context.user.userId);
  const membership = memberships.find((entry) => entry.accountId === resolvedAccountId);
  const role = membership ? resolveWorkspaceRole(membership.role) : null;

  return {
    user,
    effectivePlan: effectivePlan(account),
    planIsComplimentary: planSource(account) === "complimentary",
    usage: {
      used,
      limit,
      percent:
        used !== null && limit !== null && limit > 0
          ? Math.min(100, Math.round((used / limit) * 100))
          : null
    },
    // Viewers cannot mutate the workspace, so the shell must not offer them
    // controls the API would reject.
    canMutate: role !== null && AUTHORITY_LEVELS[role] > AUTHORITY_LEVELS.VIEWER,
    role
  };
}
