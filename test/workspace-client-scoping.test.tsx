import { describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";
import { renderToString } from "react-dom/server";
import {
  WorkspaceProvider,
  useDashboardApi,
  useDashboardPaths
} from "@/components/workspace/WorkspaceProvider";
import { resolveDashboardFetchPath } from "@/lib/workspaceClient";

describe("resolveDashboardFetchPath explicit slug", () => {
  it("requires an explicit slug and never reads module globals", () => {
    expect(resolveDashboardFetchPath("/api/dashboard/summary", null)).toBe("/api/dashboard/summary");
    expect(resolveDashboardFetchPath("/api/dashboard/summary", "alpha")).toBe(
      "/alpha/api/dashboard/summary"
    );
    expect(resolveDashboardFetchPath("/dashboard/agents", "alpha")).toBe("/alpha/dashboard/agents");
    expect(resolveDashboardFetchPath("/api/billing/checkout", "beta")).toBe(
      "/beta/api/billing/checkout"
    );
  });
});

describe("first-render workspace scoping", () => {
  it("renders scoped dashboard links on the initial render without useEffect", () => {
    function LinkProbe() {
      const { href, workspaceSlug } = useDashboardPaths();
      return createElement(
        "a",
        {
          "data-slug": workspaceSlug ?? "",
          href: href("/dashboard/agents")
        },
        "Agents"
      );
    }

    const html = renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "alpha" }, createElement(LinkProbe))
    );
    expect(html).toContain('href="/alpha/dashboard/agents"');
    expect(html).toContain('data-slug="alpha"');
    expect(html).not.toContain('href="/dashboard/agents"');
  });

  it("first API path generated for a scoped dashboard is /alpha/api/dashboard/...", () => {
    const seen: string[] = [];

    function FetchProbe() {
      const { apiPath, workspaceSlug } = useDashboardApi();
      // Synchronous during render — proves no useEffect/module-global dependency.
      seen.push(apiPath("/api/dashboard/summary"));
      return createElement("span", { "data-slug": workspaceSlug ?? "" }, seen[0]);
    }

    const html = renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "alpha" }, createElement(FetchProbe))
    );
    expect(seen[0]).toBe("/alpha/api/dashboard/summary");
    expect(html).toContain("/alpha/api/dashboard/summary");
    expect(seen.every((path) => path.startsWith("/alpha/"))).toBe(true);
  });
});

describe("multi-tab request path independence", () => {
  it("keeps alpha and beta API paths isolated without shared module tenancy state", () => {
    const alphaPaths: string[] = [];
    const betaPaths: string[] = [];

    function TabProbe({ bucket }: { bucket: string[] }) {
      const { apiPath, href } = useDashboardApi();
      bucket.push(apiPath("/api/dashboard/inbox"));
      bucket.push(href("/dashboard/settings"));
      return createElement("div", null, bucket.join("|"));
    }

    const alphaHtml = renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "alpha" }, createElement(TabProbe, { bucket: alphaPaths }))
    );
    const betaHtml = renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "beta" }, createElement(TabProbe, { bucket: betaPaths }))
    );

    expect(alphaPaths).toEqual(["/alpha/api/dashboard/inbox", "/alpha/dashboard/settings"]);
    expect(betaPaths).toEqual(["/beta/api/dashboard/inbox", "/beta/dashboard/settings"]);
    expect(alphaHtml).toContain("/alpha/");
    expect(betaHtml).toContain("/beta/");
    expect(alphaPaths.some((p) => p.includes("/beta/"))).toBe(false);
    expect(betaPaths.some((p) => p.includes("/alpha/"))).toBe(false);
  });

  it("proves two concurrent providers never share module-global tenancy", () => {
    const seen = new Map<string, string[]>();

    function FetchProbe({ id }: { id: string }) {
      const { apiPath, workspaceSlug } = useDashboardApi();
      const paths = seen.get(id) ?? [];
      paths.push(apiPath("/api/dashboard/summary"));
      seen.set(id, paths);
      return createElement("span", { "data-tab": id, "data-slug": workspaceSlug ?? "" });
    }

    // Shared authenticated session; different route trees (tab A vs tab B).
    renderToString(
      createElement(
        "div",
        null,
        createElement(WorkspaceProvider, { workspaceSlug: "alpha" }, createElement(FetchProbe, { id: "A" })),
        createElement(WorkspaceProvider, { workspaceSlug: "beta" }, createElement(FetchProbe, { id: "B" }))
      )
    );

    expect(seen.get("A")).toEqual(["/alpha/api/dashboard/summary"]);
    expect(seen.get("B")).toEqual(["/beta/api/dashboard/summary"]);
  });

  it("route transition from alpha to beta does not emit an intermediate legacy or prior-slug path", () => {
    const paths: string[] = [];

    function TransitionProbe({ slug }: { slug: string }) {
      const { apiPath } = useDashboardApi();
      paths.push(apiPath("/api/dashboard/summary"));
      useEffect(() => {
        paths.push(apiPath("/api/dashboard/summary"));
      }, [apiPath]);
      return createElement("span", null, slug);
    }

    // Simulate two sequential mounts as if navigating tabs/workspaces.
    renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "alpha" }, createElement(TransitionProbe, { slug: "alpha" }))
    );
    renderToString(
      createElement(WorkspaceProvider, { workspaceSlug: "beta" }, createElement(TransitionProbe, { slug: "beta" }))
    );

    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.every((p) => p === "/alpha/api/dashboard/summary" || p === "/beta/api/dashboard/summary")).toBe(
      true
    );
    expect(paths.includes("/api/dashboard/summary")).toBe(false);
  });
});

describe("no module-global tenancy exports", () => {
  it("does not export setActiveWorkspaceSlug or getActiveWorkspaceSlug", async () => {
    const mod = await import("@/lib/workspaceClient");
    expect("setActiveWorkspaceSlug" in mod).toBe(false);
    expect("getActiveWorkspaceSlug" in mod).toBe(false);
    expect("activeWorkspaceSlug" in mod).toBe(false);
  });
});
