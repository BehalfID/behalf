import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { next: vi.fn(), redirect: vi.fn() },
}));
vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import {
  shouldBypassIntl,
  shouldBypassProxy,
  shouldUsePrivateNoStore
} from "@/proxy";

describe("proxy public bypasses", () => {
  it("bypasses health and static requests", () => {
    expect(shouldBypassProxy("/api/health")).toBe(true);
    expect(shouldBypassProxy("/api/health/db")).toBe(true);
    expect(shouldBypassProxy("/_next/static/chunks/app.js")).toBe(true);
    expect(shouldBypassProxy("/favicon.ico")).toBe(true);
    expect(shouldBypassProxy("/brand/logo.svg")).toBe(true);
    expect(shouldBypassProxy("/install.sh")).toBe(true);
    expect(shouldBypassProxy("/llms.txt")).toBe(true);
    expect(shouldBypassProxy("/.well-known/atproto-did")).toBe(true);
    expect(shouldBypassProxy("/api/status")).toBe(true);
  });

  it("keeps extension-like API resources on the protected proxy path", () => {
    expect(shouldBypassProxy("/api/dashboard/agents/example.txt")).toBe(false);
    expect(shouldBypassProxy("/alpha/api/dashboard/agents/example.sh")).toBe(false);
  });

  it("keeps dashboard requests on the proxy path", () => {
    expect(shouldBypassProxy("/dashboard")).toBe(false);
  });

  it("keeps internal and redirect routes out of locale rewriting", () => {
    expect(shouldBypassIntl("/home-v2")).toBe(true);
    expect(shouldBypassIntl("/design-system/foundation")).toBe(true);
    expect(shouldBypassIntl("/")).toBe(false);
    expect(shouldBypassIntl("/de")).toBe(false);
  });
});

describe("private no-store classification", () => {
  it("classifies sensitive APIs and authenticated pages as private", () => {
    for (const path of [
      "/api/auth/me",
      "/api/dashboard/summary",
      "/api/console/logs",
      "/api/verify",
      "/api/permissions",
      "/api/logs/agent_1",
      "/api/billing/portal",
      "/api/site-guard/check",
      "/api/webhooks/process",
      "/dashboard",
      "/console",
      "/workspace/acme/dashboard",
      "/invite/token"
    ]) {
      expect(shouldUsePrivateNoStore(path)).toBe(true);
    }
  });

  it("does not classify public content as private by policy helper", () => {
    expect(shouldUsePrivateNoStore("/docs")).toBe(false);
    expect(shouldUsePrivateNoStore("/robots.txt")).toBe(false);
    expect(shouldUsePrivateNoStore("/api/status")).toBe(false);
  });
});
