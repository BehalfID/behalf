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
});
