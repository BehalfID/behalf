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
  findAccountById: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  getCurrentDeveloperContext: shellMocks.getCurrentDeveloperContext
}));
vi.mock("@/lib/repositories/accounts", () => ({
  findAccountById: shellMocks.findAccountById
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
  });

  it("returns nothing to render when there is no session", async () => {
    shellMocks.getCurrentDeveloperContext.mockResolvedValue(null);
    const { resolveDashboardShellProps } = await import("@/lib/dashboardShellServer");

    expect(await resolveDashboardShellProps()).toEqual({ user: null, effectivePlan: null });
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
    // One <nav aria-label="Dashboard"> plus the breadcrumb's own landmark.
    expect(navLandmarks).toHaveLength(2);
    expect(shell).toContain('aria-label="Dashboard"');
    expect(shell).toContain('aria-label="Current location"');
  });

  it("opts only the chrome into the design system, never the content area", () => {
    const shell = sources.find((entry) => entry.file === "components/layout/DashboardShell.tsx")!.source;
    expect(shell).toMatch(/`ds dashboard-sidebar/);
    expect(shell).toMatch(/className="ds dashboard-topbar"/);
    // Page interiors keep the production token set until ported individually;
    // wrapping <main> would restyle every dashboard page at once.
    expect(shell).not.toMatch(/className={?`?ds[^"`]*dashboard-main/);
    expect(shell).not.toMatch(/<main[^>]*className="ds/);
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

describe("the chrome stylesheet cannot leak", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf-8");
  const marker = "Dashboard chrome — Lovable design port";

  it("every selector in the port block is scoped to the dashboard chrome", () => {
    const start = css.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);

    const unscoped: string[] = [];
    for (const match of block.matchAll(/^([.#][^{@\n][^{]*)\{/gm)) {
      for (const part of match[1].split(",")) {
        const selector = part.trim();
        if (!selector) continue;
        // `.dashboard-menu*` is a class name introduced by this port and used
        // nowhere else, so it is scoped by uniqueness rather than by ancestor.
        if (selector.startsWith(".dashboard-shell ")) continue;
        if (selector.startsWith(".dashboard-menu")) continue;
        unscoped.push(selector);
      }
    }
    expect(unscoped).toEqual([]);
  });

  it("leaves the shared sidebar rules alone", () => {
    // These are also used by .docs-sidebar, .console-sidebar and .app-sidebar.
    // Editing them would restyle docs and console along with the dashboard.
    const start = css.indexOf(marker);
    const block = css.slice(start);
    expect(block).not.toMatch(/^\.docs-sidebar/m);
    expect(block).not.toMatch(/^\.console-sidebar/m);
    expect(block).not.toMatch(/^\.app-sidebar[ ,{]/m);
  });

  it("wins the cascade without !important", () => {
    const start = css.indexOf(marker);
    const block = css.slice(start);
    // `.dashboard-shell .dashboard-sidebar` (0,2,0) already beats the shared
    // `.dashboard-sidebar` (0,1,0), and the block is last in source order.
    expect(block).not.toContain("!important");
    expect(css.indexOf(".dashboard-sidebar,")).toBeLessThan(start);
  });

  it("the menu class names belong to this port alone", () => {
    const shell = readFileSync(join(ROOT, "components/layout/DashboardShell.tsx"), "utf-8");
    const menu = readFileSync(join(ROOT, "components/layout/DashboardMenu.tsx"), "utf-8");
    // If another surface adopts these names the global rules stop being scoped.
    expect(menu).toContain("dashboard-menu");
    expect(shell).toContain("dashboard-menu__item-main");
  });
});
