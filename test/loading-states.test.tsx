import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDashboardLoadingVariant } from "@/lib/dashboardShellPresentation";
import {
  PageLoadingState,
  RefreshingIndicator,
  SectionLoadingState,
  SkeletonTable
} from "@/components/ui/LoadingStates";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const foundationCss = source("app/design-system-foundation.css");
const dashboardSource = source("app/dashboard/client.tsx");
const dashboardShellSource = source("components/layout/DashboardShell.tsx");
const inboxSource = source("components/dashboard/OpsInboxConsole.tsx");
const consoleSource = source("app/console/client.tsx");
const workspaceLoadingSource = source("app/workspace/[workspaceSlug]/dashboard/loading.tsx");

describe("shared loading-state primitives", () => {
  it("announces one page-level status while hiding decorative geometry", () => {
    const html = renderToStaticMarkup(
      createElement(PageLoadingState, { label: "Loading agent details", variant: "detail" })
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading agent details");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("ui-page-loading--detail");
  });

  it("renders stable table and section row geometry", () => {
    const table = renderToStaticMarkup(createElement(SkeletonTable, { columns: 4, rows: 5 }));
    const section = renderToStaticMarkup(createElement(SectionLoadingState, { rows: 4 }));

    expect(table.match(/class="ui-skeleton-table__row/g)?.length).toBe(6);
    expect(table).toContain("ui-skeleton-table__footer");
    expect(section.match(/ui-skeleton-list__row/g)?.length).toBe(4);
  });

  it("uses a distinct non-blocking refresh status", () => {
    const html = renderToStaticMarkup(
      createElement(RefreshingIndicator, { label: "Refreshing approvals" })
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Refreshing approvals");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("uses theme tokens, responsive geometry, and disables skeleton motion", () => {
    expect(foundationCss).toContain("background: var(--surface-elevated)");
    expect(foundationCss).toContain("border: 1px solid var(--border-standard)");
    expect(foundationCss).toContain("@media (max-width: 768px)");
    expect(foundationCss).toContain("@media (max-width: 520px)");
    expect(foundationCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-skeleton[\s\S]*animation: none/);
  });
});

describe("route loading boundaries", () => {
  it("selects geometry that matches dashboard route families", () => {
    expect(getDashboardLoadingVariant("/alpha/dashboard")).toBe("overview");
    expect(getDashboardLoadingVariant("/alpha/dashboard/agents")).toBe("table");
    expect(getDashboardLoadingVariant("/alpha/dashboard/agents/agent_1")).toBe("detail");
    expect(getDashboardLoadingVariant("/alpha/dashboard/logs")).toBe("activity");
    expect(getDashboardLoadingVariant("/alpha/dashboard/settings")).toBe("settings");
    expect(getDashboardLoadingVariant("/alpha/dashboard/agents/new")).toBe("form");
  });

  it("keeps workspace loading inside the shared dashboard shell boundary", () => {
    expect(workspaceLoadingSource).toContain("DashboardRouteLoading");
    expect(source("app/dashboard/loading.tsx")).toContain("DashboardRouteLoading");
    expect(source("app/dashboard/layout.tsx")).toContain("DashboardShellLayout");
    expect(source("app/console/loading.tsx")).toContain("PageLoadingState");
    expect(source("app/console/layout.tsx")).toContain("ConsoleLayoutClient");
  });
});

describe("coordinated initial reveal and refresh behavior", () => {
  it("waits for all required overview and settings payloads", () => {
    expect(dashboardSource).toContain("[summary, inbox, activity].some");
    expect(dashboardSource).toContain("[settings, tokens, members].some");
    expect(dashboardSource).toContain('label="Loading workspace overview"');
    expect(dashboardSource).toContain('label="Loading settings, members, and developer tokens"');
  });

  it("does not render empty states while required data is pending", () => {
    expect(dashboardSource).toContain("resource.loading && !resource.data");
    expect(consoleSource).toContain("resource.loading && !resource.data");
    expect(consoleSource).toContain("if (initialLoading)");
  });

  it("keys client payloads to route or workspace identity", () => {
    expect(dashboardSource).toContain('`${workspaceSlug ?? "legacy"}:${path}`');
    expect(dashboardSource).toContain("state.key === key");
    expect(consoleSource).toContain("state.path === path");
    expect(dashboardSource).toContain("contentKey");
  });

  it("masks the prior workspace from switch start through provider replacement", () => {
    expect(dashboardShellSource).toContain("setSwitching(true)");
    expect(dashboardShellSource).toContain('label="Switching workspace"');
    expect(dashboardShellSource).toContain("workspaceSlug !== switchTargetSlug");
    expect(dashboardShellSource).toContain("workspaceState.switching ?");
  });

  it("preserves same-resource data during background refresh", () => {
    expect(dashboardSource).toContain("previous.key === key ? previous.data : null");
    expect(dashboardSource).toContain("refreshing: current.loading && Boolean(current.data)");
    expect(consoleSource).toContain("previous.path === path ? previous.data : null");
    expect(consoleSource).toContain("Refreshing console data");
  });

  it("keeps errors distinct from loading and empty states", () => {
    expect(inboxSource).toContain("Action inbox could not be loaded");
    expect(dashboardSource).toContain("Approval queue unavailable");
    expect(consoleSource).toContain("Console data could not be loaded");
    expect(consoleSource).toContain("Console session expired");
  });
});

describe("public and optional loading behavior", () => {
  it("keeps static docs and blog routes free of misleading loading files", () => {
    expect(source("app/docs/page.tsx")).not.toContain("PageLoadingState");
    expect(source("app/blog/page.tsx")).not.toContain("PageLoadingState");
  });

  it("keeps public status skeletons decorative and locale-equivalent", () => {
    expect(source("app/status/loading.tsx")).toContain('aria-busy="true"');
    expect(source("app/status/loading.tsx")).toContain('aria-hidden="true"');
    expect(source("app/[locale]/status/loading.tsx")).toContain('from "@/app/status/loading"');
  });
});
