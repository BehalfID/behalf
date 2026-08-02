import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
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
  const marketingHeader = source("components/design-system/MarketingHeader.tsx");
  const docsWrapper = source("components/layout/DocsLayout.tsx");
  const docsClient = source("components/layout/DocsLayoutClient.tsx");

  it("uses one server-resolved action for the Lovable public header", () => {
    expect(publicNavWrapper).toContain("getPublicAuthAction");
    expect(publicNavClient).toContain("MarketingHeader");
    expect(marketingHeader).toContain("authAction");
    expect(marketingHeader).toContain("ContinueWithGoogle");
    expect(occurrenceCount(marketingHeader, "authHref")).toBeGreaterThanOrEqual(1);
  });

  it("keeps docs on the shared server-resolved action", () => {
    expect(docsWrapper).toContain("getPublicAuthAction");
    expect(occurrenceCount(docsClient, "<PublicAuthAction")).toBe(1);
    expect(docsClient).toContain('aria-label={t("utilities")}');
    expect(docsClient).toContain("LanguageSwitcher");
    expect(docsClient).toContain("useTranslations(\"docs\")");
  });

  it("keeps homepage and docs shells wired to navigation", () => {
    expect(source("components/marketing-v2/MarketingHomePage.tsx")).toContain("MarketingLayout");
    expect(source("app/docs/content.tsx")).toContain("<DocsLayout>");
    expect(source("app/[locale]/docs/content.tsx")).toContain("<DocsLayout>");
  });

  it("keeps primary homepage CTA on signup, not login", () => {
    const home = source("components/marketing/LovableHomeContent.tsx");
    expect(home).toContain('href="/signup"');
    expect(home).toContain("Start building");
  });

  it("surfaces Google OAuth from server-configured homepage and public nav", () => {
    expect(source("components/marketing-v2/MarketingHomePage.tsx")).toContain("isGoogleOAuthConfigured");
    expect(source("components/layout/PublicNav.tsx")).toContain("isGoogleOAuthConfigured");
    expect(source("components/design-system/MarketingHeader.tsx")).toContain("ContinueWithGoogle");
  });
});
