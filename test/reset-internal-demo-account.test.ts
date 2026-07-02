import { describe, expect, it } from "vitest";
import {
  canRunInternalDemoReset,
  DEFAULT_INTERNAL_DEMO_EMAIL,
  extractDatabaseName,
  generateInternalDemoPassword,
  INTERNAL_DEMO_RESET_REFUSAL_REASON,
  isNonProductionDatabaseName,
  isPublicConsumerEmail,
  isWeakInternalDemoPassword,
  MIN_INTERNAL_DEMO_PASSWORD_LENGTH,
  resolveDemoEmail,
  resolveInternalDemoPassword,
  shouldClearInternalDemoData,
  shouldPreserveInternalDemoData,
  splitDatabaseNameSegments,
  validateInternalDemoPassword
} from "@/scripts/dev/reset-internal-demo-account-helpers";

describe("internal demo reset safety guards", () => {
  it("rejects production-looking databases without override", () => {
    const result = canRunInternalDemoReset({
      NODE_ENV: "production",
      MONGODB_URI: "mongodb+srv://cluster.example.net/behalf-prod"
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(INTERNAL_DEMO_RESET_REFUSAL_REASON);
  });

  it("rejects development NODE_ENV with a production-looking database", () => {
    const result = canRunInternalDemoReset({
      NODE_ENV: "development",
      MONGODB_URI: "mongodb+srv://cluster.example.net/behalf-production"
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(INTERNAL_DEMO_RESET_REFUSAL_REASON);
  });

  it("rejects test NODE_ENV with a production-looking database", () => {
    const result = canRunInternalDemoReset({
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017/behalf-live"
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(INTERNAL_DEMO_RESET_REFUSAL_REASON);
  });

  it("allows dev/test/staging database names regardless of NODE_ENV", () => {
    expect(
      canRunInternalDemoReset({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb+srv://cluster.example.net/behalf-staging"
      }).allowed
    ).toBe(true);

    expect(
      canRunInternalDemoReset({
        NODE_ENV: "development",
        MONGODB_URI: "mongodb://localhost:27017/behalf-test"
      }).allowed
    ).toBe(true);

    expect(
      canRunInternalDemoReset({
        NODE_ENV: "test",
        MONGODB_URI: "mongodb://127.0.0.1:27017/behalf_dev"
      }).allowed
    ).toBe(true);
  });

  it("rejects missing database names unless override is set", () => {
    expect(canRunInternalDemoReset({ NODE_ENV: "development" }).allowed).toBe(false);
    expect(canRunInternalDemoReset({ NODE_ENV: "development", MONGODB_URI: "" }).allowed).toBe(
      false
    );
    expect(
      canRunInternalDemoReset({
        NODE_ENV: "development",
        MONGODB_URI: "mongodb://localhost:27017"
      }).allowed
    ).toBe(false);
  });

  it("allows override with ALLOW_INTERNAL_DEMO_RESET=1", () => {
    expect(
      canRunInternalDemoReset({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb+srv://cluster.example.net/behalf-prod",
        ALLOW_INTERNAL_DEMO_RESET: "1"
      }).allowed
    ).toBe(true);
  });
});

describe("internal demo database name heuristics", () => {
  it("matches whole segments instead of unsafe substrings", () => {
    expect(splitDatabaseNameSegments("behalf-prod")).toEqual(["behalf", "prod"]);
    expect(isNonProductionDatabaseName("behalf-prod")).toBe(false);
    expect(isNonProductionDatabaseName("behalf_dev")).toBe(true);
    expect(isNonProductionDatabaseName("behalf-development")).toBe(true);
    expect(isNonProductionDatabaseName("behalf-preview")).toBe(true);
    expect(isNonProductionDatabaseName("behalf-production")).toBe(false);
    expect(isNonProductionDatabaseName("production-preview-copy")).toBe(false);
    expect(isNonProductionDatabaseName("behalf")).toBe(false);
    expect(isNonProductionDatabaseName("live")).toBe(false);
  });
});

describe("internal demo email resolution", () => {
  it("uses the safe internal default email", () => {
    expect(resolveDemoEmail({})).toEqual({ email: DEFAULT_INTERNAL_DEMO_EMAIL });
  });

  it("rejects public consumer-looking emails by default", () => {
    const result = resolveDemoEmail({ INTERNAL_DEMO_EMAIL: "demo@gmail.com" });
    expect(result).toEqual({
      error:
        "Refusing to use a public consumer email domain for the internal demo account. " +
        "Use an internal address or set ALLOW_PUBLIC_DEMO_EMAIL=1."
    });
    expect(isPublicConsumerEmail("demo@gmail.com")).toBe(true);
  });

  it("allows public consumer emails only with explicit override", () => {
    expect(
      resolveDemoEmail({
        INTERNAL_DEMO_EMAIL: "demo@gmail.com",
        ALLOW_PUBLIC_DEMO_EMAIL: "1"
      })
    ).toEqual({ email: "demo@gmail.com" });
  });
});

describe("internal demo password handling", () => {
  it("rejects passwords shorter than 46 characters", () => {
    const shortPassword = "Aa1!".repeat(10);
    expect(shortPassword.length).toBe(40);
    expect(validateInternalDemoPassword(shortPassword)).toEqual({
      valid: false,
      error: `INTERNAL_DEMO_PASSWORD must be at least ${MIN_INTERNAL_DEMO_PASSWORD_LENGTH} characters.`
    });
  });

  it("rejects obvious weak passwords", () => {
    const weakPassword = `demo-${"Xy9!".repeat(12)}`;
    expect(isWeakInternalDemoPassword(weakPassword)).toBe(true);
    expect(validateInternalDemoPassword(weakPassword).valid).toBe(false);
    expect(validateInternalDemoPassword(`${"a".repeat(46)}`).valid).toBe(false);
  });

  it("generates a password that meets length and entropy requirements", () => {
    const password = generateInternalDemoPassword();
    expect(password.length).toBeGreaterThanOrEqual(MIN_INTERNAL_DEMO_PASSWORD_LENGTH);
    expect(validateInternalDemoPassword(password).valid).toBe(true);
  });

  it("requires an explicit password in production NODE_ENV", () => {
    expect(
      resolveInternalDemoPassword({
        NODE_ENV: "production"
      })
    ).toEqual({
      password: "",
      generated: false,
      error: "INTERNAL_DEMO_PASSWORD is required when NODE_ENV is production."
    });
  });

  it("generates a local password when none is provided outside production", () => {
    const result = resolveInternalDemoPassword({ NODE_ENV: "development" });
    expect(result.generated).toBe(true);
    expect(result.password.length).toBeGreaterThanOrEqual(MIN_INTERNAL_DEMO_PASSWORD_LENGTH);
    expect(result.error).toBeUndefined();
  });
});

describe("internal demo reset helpers", () => {
  it("parses database names from Mongo URIs", () => {
    expect(extractDatabaseName("mongodb://localhost:27017/behalf-dev?retryWrites=true")).toBe(
      "behalf-dev"
    );
    expect(extractDatabaseName("mongodb+srv://user:pass@cluster.mongodb.net/behalf-staging")).toBe(
      "behalf-staging"
    );
  });

  it("clears demo activity by default", () => {
    expect(shouldClearInternalDemoData({})).toBe(true);
    expect(shouldPreserveInternalDemoData({})).toBe(false);
  });

  it("preserves demo activity only with KEEP_INTERNAL_DEMO_DATA=1", () => {
    expect(shouldPreserveInternalDemoData({ KEEP_INTERNAL_DEMO_DATA: "1" })).toBe(true);
    expect(shouldClearInternalDemoData({ KEEP_INTERNAL_DEMO_DATA: "1" })).toBe(false);
  });
});
