import { describe, expect, it } from "vitest";
import { shouldBypassMiddleware } from "@/middleware";

describe("middleware public bypasses", () => {
  it("bypasses public liveness and static requests", () => {
    expect(shouldBypassMiddleware("/api/health")).toBe(true);
    expect(shouldBypassMiddleware("/_next/static/chunks/app.js")).toBe(true);
    expect(shouldBypassMiddleware("/favicon.ico")).toBe(true);
    expect(shouldBypassMiddleware("/brand/logo.svg")).toBe(true);
  });

  it("keeps database health and dashboard requests on the middleware path", () => {
    expect(shouldBypassMiddleware("/api/health/db")).toBe(false);
    expect(shouldBypassMiddleware("/dashboard")).toBe(false);
  });
});
