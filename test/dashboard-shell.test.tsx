import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getDashboardContentVariant,
  isDashboardNavItemActive,
  isDashboardPath
} from "@/lib/dashboardShellPresentation";
import { DashboardState } from "@/components/ui/DashboardState";
import { PageHeader } from "@/components/ui/PageHeader";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

const shellSource = source("components/layout/DashboardShell.tsx");
const shellCss = source("app/dashboard-shell.css");
const layoutSource = source("app/layout.tsx");

describe("authenticated dashboard shell", () => {
  it("keeps dashboard home exact while activating nested route families", () => {
    expect(isDashboardNavItemActive("/alpha/dashboard", "/alpha/dashboard")).toBe(true);
    expect(isDashboardNavItemActive("/alpha/dashboard/agents", "/alpha/dashboard")).toBe(false);
    expect(isDashboardNavItemActive("/alpha/dashboard/agents/agent_1", "/alpha/dashboard/agents")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/webhooks/hook_1", "/dashboard/webhooks")).toBe(true);
  });

  it("assigns explicit content widths without changing route destinations", () => {
    expect(getDashboardContentVariant("/alpha/dashboard")).toBe("standard");
    expect(getDashboardContentVariant("/alpha/dashboard/logs")).toBe("wide");
    expect(getDashboardContentVariant("/alpha/dashboard/managed-profiles/activity")).toBe("activity");
    expect(getDashboardContentVariant("/alpha/dashboard/agents/new")).toBe("focused");
    expect(getDashboardContentVariant("/alpha/dashboard/agents/agent_1")).toBe("detail");
    expect(getDashboardContentVariant("/workspace/alpha/dashboard/webhooks/hook_1")).toBe("detail");
  });

  it("recognizes legacy, public workspace, and internal workspace dashboard URLs for fixed UI", () => {
    expect(isDashboardPath("/dashboard/settings")).toBe(true);
    expect(isDashboardPath("/alpha/dashboard/settings")).toBe(true);
    expect(isDashboardPath("/workspace/alpha/dashboard/settings")).toBe(true);
    expect(isDashboardPath("/design-system/foundation")).toBe(false);
    expect(isDashboardPath("/login")).toBe(false);
  });

  it("preserves workspace switching and logout destinations", () => {
    expect(shellSource).toContain('"/api/dashboard/accounts/switch"');
    expect(shellSource).toContain('href="/logout"');
    expect(shellSource).toContain("workspaceDashboardHref(nextSlug, extractDashboardSubpath(pathname))");
  });

  it("includes mobile focus management, safe areas, and reduced-motion handling", () => {
    expect(shellSource).toContain('event.key === "Escape"');
    expect(shellSource).toContain("select:not([disabled])");
    expect(shellSource).toContain("inert={isMobile && !drawerOpen ? true : undefined}");
    expect(shellSource).toContain('aria-current={active ? "page" : undefined}');
    expect(shellCss).toContain("env(safe-area-inset-top");
    expect(shellCss).toContain("env(safe-area-inset-bottom");
    expect(shellCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("loads the scoped shell layer after the approved foundation and auth layers", () => {
    const foundationIndex = layoutSource.indexOf('import "./design-system-foundation.css"');
    const authIndex = layoutSource.indexOf('import "./auth-onboarding.css"');
    const dashboardIndex = layoutSource.indexOf('import "./dashboard-shell.css"');
    expect(dashboardIndex).toBeGreaterThan(foundationIndex);
    expect(dashboardIndex).toBeGreaterThan(authIndex);
  });
});

describe("dashboard page framing", () => {
  it("renders breadcrumb, status, actions, and tabs in a single reusable header", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        eyebrow: "Workspace",
        breadcrumb: createElement("span", null, "Agents / Current"),
        title: "Agent identity",
        description: "Credentials and permissions.",
        status: createElement("span", null, "Active"),
        primaryAction: createElement("button", null, "Save"),
        secondaryActions: createElement("button", null, "Cancel"),
        tabs: createElement("div", null, "Activity")
      })
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("ui-page-header__status");
    expect(html).toContain("ui-page-header__action");
    expect(html).toContain("ui-page-header__tabs");
  });

  it("gives loading and failure states appropriate live-region semantics", () => {
    const loading = renderToStaticMarkup(createElement(DashboardState, { kind: "loading" }));
    const error = renderToStaticMarkup(createElement(DashboardState, { kind: "error" }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('role="status"');
    expect(error).toContain('role="alert"');
  });
});
