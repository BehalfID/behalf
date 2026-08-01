import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOAuthAuthorizationState: vi.fn(),
  consumeOAuthAuthorizationState: vi.fn(),
  findOAuthAuthorizationStateByHash: vi.fn(),
  deleteExpiredOAuthAuthorizationStates: vi.fn(),
  getPostgresDb: vi.fn(() => ({}))
}));

vi.mock("@/lib/db/postgres", () => ({
  getPostgresDb: mocks.getPostgresDb
}));

vi.mock("@/lib/repositories/postgres/oauthAuthorizationStates", () => ({
  createOAuthAuthorizationState: mocks.createOAuthAuthorizationState,
  consumeOAuthAuthorizationState: mocks.consumeOAuthAuthorizationState,
  findOAuthAuthorizationStateByHash: mocks.findOAuthAuthorizationStateByHash,
  deleteExpiredOAuthAuthorizationStates: mocks.deleteExpiredOAuthAuthorizationStates
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  consumeOAuthStateDetailed,
  createOAuthState,
  hashOAuthState,
  logOAuthStateFailure,
  oauthCookieOptions
} from "@/lib/authProviders/oauthState";
import { logger } from "@/lib/logger";

describe("OAuth state consume classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BEHALFID_COOKIE_DOMAIN", ".behalfid.com");
  });

  it("sets cookie Domain when BEHALFID_COOKIE_DOMAIN is configured", () => {
    const opts = oauthCookieOptions(600);
    expect(opts.domain).toBe(".behalfid.com");
    expect(opts.sameSite).toBe("lax");
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
    expect(opts.secure).toBe(true);
  });

  it("creates hashed state and stores PKCE verifier (not plaintext state)", async () => {
    mocks.createOAuthAuthorizationState.mockResolvedValue({});
    const created = await createOAuthState({ provider: "github", mode: "login" });
    expect(created.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.codeChallenge).toBeTruthy();
    const call = mocks.createOAuthAuthorizationState.mock.calls[0]?.[1];
    expect(call.stateHash).toBe(hashOAuthState(created.state));
    expect(call.stateHash).not.toBe(created.state);
    expect(call.codeVerifier).toBeTruthy();
    expect(JSON.stringify(call)).not.toContain(created.state);
  });

  it("accepts matching provider state + cookie and returns verifier", async () => {
    const secret = "fresh-state-secret-value";
    mocks.consumeOAuthAuthorizationState.mockResolvedValue({
      stateId: "oas_1",
      provider: "github",
      mode: "login",
      stateHash: hashOAuthState(secret),
      codeVerifier: "pkce-verifier",
      next: "/dashboard",
      userId: null,
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date()
    });

    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: secret,
      stateFromCookie: secret
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.codeVerifier).toBe("pkce-verifier");
    expect(result.state.next).toBe("/dashboard");
  });

  it("rejects missing cookie (cross-host host-only cookie failure class)", async () => {
    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: "abc",
      stateFromCookie: null
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "missing_browser_cookie",
      diagnostics: { statePresent: true, cookiePresent: false }
    });
  });

  it("rejects mismatched cookie vs callback state", async () => {
    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: "abc",
      stateFromCookie: "xyz"
    });
    expect(result).toMatchObject({ ok: false, reason: "state_cookie_mismatch" });
    expect(mocks.consumeOAuthAuthorizationState).not.toHaveBeenCalled();
  });

  it("rejects already-consumed state", async () => {
    const secret = "used-once";
    mocks.consumeOAuthAuthorizationState.mockResolvedValue(null);
    mocks.findOAuthAuthorizationStateByHash.mockResolvedValue({
      stateId: "oas_1",
      provider: "github",
      mode: "login",
      stateHash: hashOAuthState(secret),
      codeVerifier: "v",
      next: null,
      userId: null,
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date()
    });
    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: secret,
      stateFromCookie: secret
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "state_already_consumed",
      diagnostics: { databaseRowFound: true, consumed: true }
    });
  });

  it("rejects expired state", async () => {
    const secret = "expired-state";
    mocks.consumeOAuthAuthorizationState.mockResolvedValue(null);
    mocks.findOAuthAuthorizationStateByHash.mockResolvedValue({
      stateId: "oas_1",
      provider: "github",
      mode: "login",
      stateHash: hashOAuthState(secret),
      codeVerifier: "v",
      next: null,
      userId: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date()
    });
    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: secret,
      stateFromCookie: secret,
      now: new Date()
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "state_expired",
      diagnostics: { expired: true, consumed: false }
    });
  });

  it("rejects wrong provider", async () => {
    const secret = "provider-mismatch";
    mocks.consumeOAuthAuthorizationState.mockResolvedValue(null);
    mocks.findOAuthAuthorizationStateByHash.mockResolvedValue({
      stateId: "oas_1",
      provider: "google",
      mode: "login",
      stateHash: hashOAuthState(secret),
      codeVerifier: "v",
      next: null,
      userId: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date()
    });
    const result = await consumeOAuthStateDetailed({
      provider: "github",
      stateFromProvider: secret,
      stateFromCookie: secret
    });
    expect(result).toMatchObject({ ok: false, reason: "provider_mismatch" });
  });

  it("logs sanitized failure without secrets", () => {
    logOAuthStateFailure({
      provider: "github",
      mode: "login",
      callbackHost: "behalfid.com",
      result: {
        ok: false,
        reason: "missing_browser_cookie",
        diagnostics: {
          statePresent: true,
          cookiePresent: false,
          databaseRowFound: false,
          expired: false,
          consumed: false
        }
      }
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "oauth.state_consume_failed",
      expect.objectContaining({
        provider: "github",
        callbackHost: "behalfid.com",
        reason: "missing_browser_cookie",
        statePresent: true,
        cookiePresent: false
      })
    );
    const payload = vi.mocked(logger.warn).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/secret|verifier|cookie=/i);
  });
});
