import { beforeEach, describe, expect, it, vi } from "vitest";

function request() {
  return new Request("http://localhost/api/test") as never;
}

describe("rate-limit production fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  it("emits the production memory fallback warning once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { checkRateLimit } = await import("@/lib/rateLimit");

    await checkRateLimit(request());
    await checkRateLimit(request());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("UPSTASH_REDIS_REST_URL");
    expect(warn.mock.calls[0][0]).toContain("UPSTASH_REDIS_REST_TOKEN");
  });

  it("uses memory mode when Redis env is partial", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { getRateLimitMode } = await import("@/lib/rateLimit");

    expect(getRateLimitMode()).toBe("memory");
  });

  it("falls back to memory rate-limit when Redis fetch times out or throws", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    // Simulate an unreachable Redis endpoint.
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { checkRateLimit } = await import("@/lib/rateLimit");

    // Should NOT throw or return limited:true — should fall back to memory.
    const result = await checkRateLimit(request());
    expect(result.limited).toBe(false);

    // Warning should have been emitted about Redis being unreachable.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Redis rate limiter");

    fetchSpy.mockRestore();
  });

  it("does not block requests when Redis is unreachable (prevents minute-long hangs)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    vi.spyOn(global, "fetch").mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { checkRateLimit } = await import("@/lib/rateLimit");
    const result = await checkRateLimit(request());

    // Memory fallback should let the request through (count = 1, not at limit).
    expect(result.limited).toBe(false);
  });
});
