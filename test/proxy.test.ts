import { describe, expect, it } from "vitest";
import { shouldBypassProxy } from "@/proxy";

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
});
