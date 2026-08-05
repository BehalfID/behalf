import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { userInitials } from "@/lib/dashboardShellPresentation";
import { effectivePlan } from "@/lib/planGrants";
import { findAccountById } from "@/lib/repositories/accounts";
import type { DashboardShellUser } from "@/components/layout/DashboardShell";

export type DashboardShellServerProps = {
  user: DashboardShellUser | null;
  effectivePlan: string | null;
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
 * Resolves the sidebar's identity and plan on the server.
 *
 * Both are already known during SSR, so fetching them from the client would add
 * a request per dashboard page and make the sidebar visibly swap from a
 * placeholder to the real name after hydration. `getCurrentDeveloperContext` is
 * request-cached, so calling this alongside a layout's own auth check costs
 * nothing extra.
 *
 * `accountId` should be the workspace actually being viewed; without it the
 * session's active account is used, which is correct for the non-workspace
 * `/dashboard` tree.
 */
export async function resolveDashboardShellProps(
  accountId?: string | null
): Promise<DashboardShellServerProps> {
  const context = await getCurrentDeveloperContext();
  if (!context?.user) return { user: null, effectivePlan: null };

  const user: DashboardShellUser = {
    name: displayName(context.user),
    email: context.user.email,
    initials: userInitials(displayName(context.user), context.user.email)
  };

  const resolvedAccountId = accountId ?? context.activeAccountId;
  if (!resolvedAccountId) return { user, effectivePlan: null };

  // A missing account is not an error here — the shell simply omits the plan
  // rather than failing the whole layout over a sidebar descriptor.
  const account = await findAccountById(resolvedAccountId);
  return { user, effectivePlan: account ? effectivePlan(account) : null };
}
