/**
 * Dashboard chrome port — the paths a browser cannot reach without a session.
 *
 * The browser matrix (`test/browser/dashboard-shell.mjs`) proves the shell
 * server-renders once, with one nav landmark, opted into the design-system
 * tokens. It cannot log in, so the identity menu, the multi-workspace switcher
 * and the plan descriptor are asserted here instead — against the real server
 * resolver, with only the repository stubbed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();

const shellMocks = vi.hoisted(() => ({
  getCurrentDeveloperContext: vi.fn(),
  findAccountById: vi.fn(),
  findMembershipsByUserId: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  getCurrentDeveloperContext: shellMocks.getCurrentDeveloperContext
}));
vi.mock("@/lib/repositories/accounts", () => ({
  findAccountById: shellMocks.findAccountById
}));
vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipsByUserId: shellMocks.findMembershipsByUserId
}));

describe("sidebar initials", () => {
  it("derives a workspace mark from the name", async () => {
    const { workspaceInitials } = await import("@/lib/dashboardShellPresentation");
    expect(workspaceInitials("Floofscape Solutions")).toBe("FS");
    expect(workspaceInitials("Behalf")).toBe("BE");
    expect(workspaceInitials("  spaced   out  ")).toBe("SO");
    expect(workspaceInitials("")).toBe("??");
  });

  it("falls back to the email when a person has no name", async () => {
    const { userInitials } = await import("@/lib/dashboardShellPresentation");
    expect(userInitials("Ada Lovelace", "ada@example.test")).toBe("AL");
    expect(userInitials(null, "ada.lovelace@example.test")).toBe("AL");
    expect(userInitials("   ", "founder@example.test")).toBe("FO");
  });
});

describe("resolveDashboardShellProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellMocks.findAccountById.mockResolvedValue(null);
    shellMocks.findMembershipsByUserId.mockResolvedValue([]);
  });

  it("returns nothing to render when there is no session", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue(null);
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect(await resolveDashboardShellProps()).toMatchObject({ user: null, effectivePlan: null });
    // No session must not trigger an account read.
    expect(shellMocks.findAccountById).not.toHaveBeenCalled();
  });

  it("builds identity from the real user record", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "ada@example.test", firstName: "Ada", lastName: "Lovelace" },
      activeAccountId: "acct_1"
    });
    shellMocks.findAccountById.mockResolvedValue({ accountId: "acct_1", plan: "free" });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const props = await resolveDashboardShellProps();
    expect(props.user).toEqual({
      // The stable internal id travels with the shell user so the client can
      // identify the analytics person without a second round trip.
      userId: "u1",
      name: "Ada Lovelace",
      email: "ada@example.test",
      initials: "AL"
    });
  });

  it("shows the email rather than inventing a name for an incomplete profile", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "nameless@example.test", firstName: null, lastName: null },
      activeAccountId: null
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const props = await resolveDashboardShellProps();
    expect(props.user?.name).toBe("nameless@example.test");
    expect(props.effectivePlan).toBeNull();
  });

  it("reports the effective plan, so a complimentary grant is not shown as free", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "jason@example.test", firstName: "Jason", lastName: null },
      activeAccountId: "acct_comped"
    });
    // Billing says free; the grant is what the workspace actually runs on.
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_comped",
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: null
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect((await resolveDashboardShellProps()).effectivePlan).toBe("pro");
  });

  it("ignores an expired grant", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "j@example.test" },
      activeAccountId: "acct_expired"
    });
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_expired",
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: new Date(Date.now() - 86_400_000)
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect((await resolveDashboardShellProps()).effectivePlan).toBe("free");
  });

  it("scopes the plan to the workspace being viewed, not the session's active one", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "j@example.test" },
      activeAccountId: "acct_session"
    });
    shellMocks.findAccountById.mockResolvedValue({ accountId: "acct_viewed", plan: "business" });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    await resolveDashboardShellProps("acct_viewed");
    // The two diverge while a workspace switch is in flight; reading the
    // session's account would label the sidebar with the wrong workspace's plan.
    expect(shellMocks.findAccountById).toHaveBeenCalledWith("acct_viewed");
  });

  it("keeps the sidebar rendering when the account cannot be read", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "j@example.test" },
      activeAccountId: "acct_missing"
    });
    shellMocks.findAccountById.mockResolvedValue(null);
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const props = await resolveDashboardShellProps();
    // A missing account degrades the descriptor, never the whole layout.
    expect(props.user).not.toBeNull();
    expect(props.effectivePlan).toBeNull();
  });
});

describe("plan usage and authority come from real state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellMocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "u1", email: "j@example.test", firstName: "Jasper", lastName: "Dragoo" },
      activeAccountId: "acct_1"
    });
    shellMocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_1", role: "OWNER" }
    ]);
  });

  it("derives usage from the account row the layout already read", async () => {
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_1",
      plan: "business",
      verificationCount: 30_300
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    // 2,000,000 is the business monthly verification allowance.
    expect((await resolveDashboardShellProps()).usage).toEqual({
      used: 30_300,
      limit: 2_000_000,
      percent: 2
    });
  });

  it("reports an unlimited plan without a percentage", async () => {
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_1",
      plan: "enterprise",
      verificationCount: 12
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const usage = (await resolveDashboardShellProps()).usage;
    // Unlimited has no denominator, so a bar would be meaningless.
    expect(usage).toEqual({ used: 12, limit: null, percent: null });
  });

  it("marks a complimentary grant so the card cannot read as paid", async () => {
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_1",
      plan: "free",
      complimentaryPlan: "pro",
      complimentaryPlanExpiresAt: null,
      verificationCount: 100
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const props = await resolveDashboardShellProps();
    expect(props.effectivePlan).toBe("pro");
    expect(props.planIsComplimentary).toBe(true);
  });

  it("does not mark a paid plan as complimentary", async () => {
    shellMocks.findAccountById.mockResolvedValue({
      accountId: "acct_1",
      plan: "pro",
      verificationCount: 100
    });
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect((await resolveDashboardShellProps()).planIsComplimentary).toBe(false);
  });

  it("withholds mutation controls from a viewer", async () => {
    shellMocks.findAccountById.mockResolvedValue({ accountId: "acct_1", plan: "pro" });
    shellMocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_1", role: "VIEWER" }
    ]);
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    const props = await resolveDashboardShellProps();
    expect(props.role).toBe("VIEWER");
    // The API would reject the mutation, so the shell must not offer it.
    expect(props.canMutate).toBe(false);
  });

  it.each(["OWNER", "ENGINEERING_LEAD", "SENIOR_ENGINEER", "ENGINEER"])(
    "allows mutation controls for %s",
    async (role) => {
      shellMocks.findAccountById.mockResolvedValue({ accountId: "acct_1", plan: "pro" });
      shellMocks.findMembershipsByUserId.mockResolvedValue([{ accountId: "acct_1", role }]);
      const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

      expect((await resolveDashboardShellProps()).canMutate).toBe(true);
    }
  );

  it("treats an unknown stored role as least privilege", async () => {
    shellMocks.findAccountById.mockResolvedValue({ accountId: "acct_1", plan: "pro" });
    shellMocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_1", role: "SUPERUSER" }
    ]);
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect((await resolveDashboardShellProps()).canMutate).toBe(false);
  });
});

describe("the shell stays production infrastructure", () => {
  const SHELL_FILES = [
    "components/layout/DashboardShell.tsx",
    "components/layout/DashboardMenu.tsx",
    "lib/dashboardShellServer.ts",
    "app/dashboard/layout.tsx",
    "app/workspace/[workspaceSlug]/dashboard/providers.tsx"
  ];

  const sources = SHELL_FILES.map((file) => ({
    file,
    source: readFileSync(join(ROOT, file), "utf-8")
  }));

  it.each(SHELL_FILES)("%s imports no Lovable or Supabase scaffolding", (file) => {
    const { source } = sources.find((entry) => entry.file === file)!;
    // The Lovable shell is bound to `@/lib/mock/data` and a Supabase client;
    // neither may follow the design into production.
    expect(source).not.toMatch(/lib\/mock\/data/);
    expect(source).not.toMatch(/@supabase\//);
    expect(source).not.toMatch(/@tanstack\/react-router/);
    expect(source).not.toMatch(/localStorage\.(get|set)Item\(\s*["'](token|session|jwt)/i);
  });

  it("renders exactly one dashboard navigation landmark", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    const navLandmarks = shell.match(/<nav\b[^>]*aria-label=/g) ?? [];
    // The reference has no breadcrumb, so the shell declares a single nav.
    expect(navLandmarks).toHaveLength(1);
    expect(shell).toContain('aria-label="Dashboard"');
  });

  it("drops the legacy chrome the reference does not have", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    // The first attempt kept all three and only recoloured them.
    expect(shell).not.toContain("Control plane");
    expect(shell).not.toContain("dashboard-breadcrumb");
    expect(shell).not.toContain("dashboard-topbar__workspace");
  });

  it("builds the reference's navigation groups from real routes", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    expect(shell).toMatch(/label: "Operate"/);
    expect(shell).toMatch(/label: "Workspace"/);
    expect(shell).toMatch(/label: "Overview"/);
    // Legacy taxonomy the reference replaces.
    expect(shell).not.toMatch(/label: "Control plane"/);
    expect(shell).not.toMatch(/label: "Agents & access"/);
  });

  it("puts search in the top bar and identity in the sidebar footer", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    const topbar = shell.slice(shell.indexOf("shell-topbar"), shell.indexOf("shell-mobilebar"));
    expect(topbar).toContain("DashboardOmniSearchTrigger");
    // The workspace name used to float as raw text in the top right.
    expect(topbar).not.toContain("workspaceName");
    const sidebar = shell.slice(shell.indexOf("shell-sidebar"), shell.indexOf("shell-body"));
    expect(sidebar).toContain("UserFooter");
    expect(sidebar).toContain("PlanUsageCard");
  });

  it("gates the add-agent action on real authority", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    expect(shell).toMatch(/canMutate \? \(/);
    expect(shell).toContain('className="shell-cta"');
  });

  it("opts only the chrome into the design system, never the content area", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    expect(shell).toContain('className="ds shell-sidebar"');
    expect(shell).toContain('<header className="ds shell-topbar">');
    // Putting `.ds` on the wrapper pulled <main> into scope and restyled page
    // interiors — caught in the browser, not by a test, the first time.
    expect(shell).not.toContain('className="ds shell"');
    expect(shell).not.toMatch(/<main[^>]*className="ds/);
    // The legacy class stays on the wrapper so interior rules keep applying.
    expect(shell).toContain('className="shell dashboard-shell"');
    expect(shell).toContain('className="shell-main app-main"');
  });

  it("keeps identity server-resolved instead of fetched after hydration", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    // A client fetch would add a request per page and visibly swap the name in.
    expect(shell).not.toMatch(/\/api\/auth\/me/);
    const layout = sources.find((entry) => entry.file === "app/dashboard/layout.tsx")!.source;
    expect(layout).toContain("resolveDashboardShellProps");
  });

  it("logs out through a document navigation so the session is actually cleared", () => {
    const menu = sources.find((entry) => entry.file === "components/layout/DashboardMenu.tsx")!.source;
    // A client-side <Link> would keep the stale tree mounted after the GET
    // route clears the session.
    expect(menu).toMatch(/<a[\s\S]{0,200}href="\/logout"/);
    expect(menu).not.toMatch(/<Link[^>]*href="\/logout"/);
  });

  it("does not hardcode a dashboard statistic in the navigation", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    // Lovable's nav carries a pending-approvals badge computed from mock data.
    // Production has no cheap count for it, so the badge is omitted rather than
    // faked — this guard stops a literal creeping in later.
    expect(shell).not.toMatch(/badge:\s*\d+/);
    expect(shell).not.toMatch(/pendingCount\s*=\s*\d+/);
  });
});
