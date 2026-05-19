import { describe, expect, it, vi } from "vitest";

describe("production environment validation", () => {
  it("fails loudly for missing required production variables without leaking values", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_URI", "");
    vi.stubEnv("BEHALFID_ADMIN_PASSWORD", "replace-this-password");
    vi.stubEnv("BEHALFID_SETUP_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");

    const { validateProductionEnv } = await import("@/lib/env");
    const result = validateProductionEnv();

    expect(result.valid).toBe(false);
    expect(result.missingRequired).toEqual(expect.arrayContaining([
      "MONGODB_URI",
      "BEHALFID_SETUP_TOKEN",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRO_PRICE_ID"
    ]));
    expect(result.invalid).toContain("BEHALFID_ADMIN_PASSWORD must not use a placeholder or default value.");
    expect(result.invalid).toContain("NEXT_PUBLIC_APP_URL must use https:// in production.");
    expect(JSON.stringify(result)).not.toContain("replace-this-password");
  });

  it("warns but remains valid when optional production integrations are absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_URI", "mongodb+srv://user:pass@example.mongodb.net/behalfid");
    vi.stubEnv("BEHALFID_ADMIN_PASSWORD", "a-long-random-admin-password");
    vi.stubEnv("BEHALFID_SETUP_TOKEN", "a-long-random-setup-token");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://behalfid.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_test");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("BEHALFID_PUBLIC_AGENT_CREATION", "true");

    const { validateProductionEnv } = await import("@/lib/env");
    const result = validateProductionEnv();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Upstash Redis is not configured; production rate limits will use per-process memory fallback.",
      "BEHALFID_PUBLIC_AGENT_CREATION=true allows anonymous agent creation."
    ]));
  });
});
