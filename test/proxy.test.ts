import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { next: vi.fn(), redirect: vi.fn() },
}));
vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import { shouldBypassIntl, shouldBypassProxy } from "@/proxy";

describe("proxy public bypasses", () => {
  it("bypasses health and static requests", () => {
    expect(shouldBypassProxy("/api/health")).toBe(true);
    expect(shouldBypassProxy("/api/health/db")).toBe(true);
    expect(shouldBypassProxy("/_next/static/chunks/app.js")).toBe(true);
    expect(shouldBypassProxy("/favicon.ico")).toBe(true);
    expect(shouldBypassProxy("/brand/logo.svg")).toBe(true);
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
