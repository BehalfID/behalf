import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
import { MarketingNavbarClient } from "@/components/marketing-v2/MarketingNavbarClient";
import {
  createPublicAuthAction,
  getPublicAuthAction,
  PUBLIC_DASHBOARD_ENTRY_HREF
} from "@/lib/publicAuthAction";

const sessionMocks = vi.hoisted(() => ({
  getCurrentDeveloper: vi.fn()
}));

vi.mock("@/i18n/navigation", () => ({ Link: "a" }));
vi.mock("@/lib/developerAuth", () => ({
  getCurrentDeveloper: sessionMocks.getCurrentDeveloper
}));

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

function occurrenceCount(value: string, search: string) {
  return value.split(search).length - 1;
}

describe("public authentication actions", () => {
  it("keeps the unauthenticated action on Sign in without a dashboard duplicate", () => {
    const action = createPublicAuthAction(false);
    const html = renderToStaticMarkup(createElement(PublicAuthAction, { action }));

    expect(action).toEqual({
      href: "/login",
      label: "Sign in",
      isAuthenticated: false
    });
    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("To Dashboard");
  });

  it("shows only To Dashboard for an authenticated session", () => {
    const action = createPublicAuthAction(true);
    const html = renderToStaticMarkup(createElement(PublicAuthAction, { action }));

    expect(action).toEqual({
      href: PUBLIC_DASHBOARD_ENTRY_HREF,
      label: "To Dashboard",
      isAuthenticated: true
    });
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("To Dashboard");
    expect(html).not.toContain("Sign in");
  });

  it("resolves the authenticated action from the existing server session helper", async () => {
    sessionMocks.getCurrentDeveloper.mockResolvedValue({ userId: "user_test" });

    await expect(getPublicAuthAction()).resolves.toEqual({
      href: PUBLIC_DASHBOARD_ENTRY_HREF,
      label: "To Dashboard",
      isAuthenticated: true
    });
    expect(sessionMocks.getCurrentDeveloper).toHaveBeenCalledOnce();
  });

  it("renders the authenticated homepage navbar without a Sign in action", () => {
    const html = renderToStaticMarkup(
      createElement(MarketingNavbarClient, {
        authAction: createPublicAuthAction(true)
      })
    );

    expect(html).toContain("To Dashboard");
    expect(html).not.toContain("Sign in");
    expect(html).toContain("Start securing agents");
  });

  it("applies the same authenticated destination to public-page login CTAs", () => {
    expect(createPublicAuthAction(false, "Log In")).toMatchObject({
      href: "/login",
      label: "Log In"
    });
    expect(createPublicAuthAction(true, "Log In")).toMatchObject({
      href: PUBLIC_DASHBOARD_ENTRY_HREF,
      label: "To Dashboard"
    });
  });

  it("preserves the existing dashboard gateway that owns workspace and onboarding redirects", () => {
    const guard = source("app/dashboard/guard.tsx");

    expect(PUBLIC_DASHBOARD_ENTRY_HREF).toBe("/dashboard");
    expect(guard).toContain("getCurrentDeveloperContext");
    expect(guard).toContain("shouldForceAccountSetup");
    expect(guard).toContain("context.activeAccountId ?? context.user.primaryAccountId");
    expect(guard).toContain("ensureAccountHasSlug");
    expect(guard).toContain("workspaceDashboardHref(slug, subpath)");
  });
});

describe("public navigation integration", () => {
  const publicNavWrapper = source("components/layout/PublicNav.tsx");
  const publicNavClient = source("components/layout/PublicNavClient.tsx");
  const marketingWrapper = source("components/marketing-v2/MarketingNavbar.tsx");
  const marketingClient = source("components/marketing-v2/MarketingNavbarClient.tsx");
  const docsWrapper = source("components/layout/DocsLayout.tsx");
  const docsClient = source("components/layout/DocsLayoutClient.tsx");

  it("uses one server-resolved action for desktop and mobile public navigation", () => {
    expect(publicNavWrapper).toContain("getPublicAuthAction");
    expect(marketingWrapper).toContain("getPublicAuthAction");
    expect(occurrenceCount(publicNavClient, "<PublicAuthAction")).toBe(2);
    expect(occurrenceCount(marketingClient, "<PublicAuthAction")).toBe(2);
    expect(publicNavClient).toContain("onClick={close}");
    expect(marketingClient).toContain("onClick={() => setOpen(false)}");
  });

  it("keeps docs on the shared server-resolved action", () => {
    expect(docsWrapper).toContain("getPublicAuthAction");
    expect(occurrenceCount(docsClient, "<PublicAuthAction")).toBe(1);
    expect(docsClient).toContain('aria-label="Documentation utilities"');
  });

  it("keeps homepage and docs shells wired to their existing navigation", () => {
    expect(source("components/marketing-v2/MarketingHomePage.tsx")).toContain("<MarketingNavbar />");
    expect(source("app/docs/content.tsx")).toContain("<DocsLayout>");
    expect(source("app/[locale]/docs/content.tsx")).toContain("<DocsLayout>");
  });

  it("does not turn the final homepage CTA into a login action", () => {
    const finalCta = source("components/marketing-v2/FinalCTA.tsx");

    expect(finalCta).toContain('href="/signup"');
    expect(finalCta).not.toContain('href="/login"');
    expect(finalCta).not.toContain("To Dashboard");
  });
});
