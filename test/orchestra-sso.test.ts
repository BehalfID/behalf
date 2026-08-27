import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const privateKey = generateKeyPairSync("ed25519").privateKey.export({
  format: "pem",
  type: "pkcs8"
}).toString();

describe("Agent Orchestra SSO assertion", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY", privateKey);
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_KEY_ID", "orchestra-2026-01");
    delete process.env.BEHALFID_ORCHESTRA_SSO_CALLBACK_URL;
  });

  afterEach(() => {
    delete process.env.BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY;
    delete process.env.BEHALFID_ORCHESTRA_SSO_KEY_ID;
    delete process.env.BEHALFID_ORCHESTRA_SSO_CALLBACK_URL;
  });

  it("validates state with strict base64url charset and length bounds", async () => {
    const { validateOrchestraSsoState } = await import("@/lib/orchestraSso");
    expect(validateOrchestraSsoState("a".repeat(32))).toBe("a".repeat(32));
    for (const invalid of [undefined, "", "a".repeat(31), "a".repeat(257), "with space".repeat(4), ["a".repeat(32)]]) {
      expect(validateOrchestraSsoState(invalid)).toBeNull();
    }
  });

  it("issues a 60-second EdDSA assertion with the required claims", async () => {
    const pair = generateKeyPairSync("ed25519");
    const signingPem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const verificationPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY", signingPem);
    const sso = await import("@/lib/orchestraSso");
    const state = "state_abcdefghijklmnopqrstuvwxyz_123456";
    const issued = await sso.issueOrchestraSsoAssertion({
      adminId: "cad_admin_1",
      state,
      now: new Date("2026-08-27T12:00:00Z")
    });
    const verified = await jwtVerify(issued.assertion, await importSPKI(verificationPem, "EdDSA"), {
      issuer: sso.ORCHESTRA_SSO_ISSUER,
      audience: sso.ORCHESTRA_SSO_AUDIENCE,
      currentDate: new Date("2026-08-27T12:00:30Z")
    });

    expect(decodeProtectedHeader(issued.assertion)).toMatchObject({
      alg: "EdDSA",
      typ: "JWT",
      kid: "orchestra-2026-01"
    });
    expect(verified.payload).toMatchObject({
      iss: "https://console.behalfid.com",
      aud: "serv1.behalfid.com",
      sub: "cad_admin_1",
      state,
      iat: 1787832000,
      exp: 1787832060
    });
    expect(verified.payload.jti).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBeLessThanOrEqual(60);
  });

  it("fails closed when the signing key is missing or invalid", async () => {
    const { issueOrchestraSsoAssertion } = await import("@/lib/orchestraSso");
    delete process.env.BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY;
    await expect(issueOrchestraSsoAssertion({ adminId: "cad_1", state: "a".repeat(32) }))
      .rejects.toThrow("not configured");
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY", "not-a-key");
    await expect(issueOrchestraSsoAssertion({ adminId: "cad_1", state: "a".repeat(32) }))
      .rejects.toThrow("invalid");
  });

  it("fails closed without a small configured key ID", async () => {
    const { issueOrchestraSsoAssertion } = await import("@/lib/orchestraSso");
    for (const keyId of [undefined, "", "contains a space", "a".repeat(65)]) {
      if (keyId === undefined) delete process.env.BEHALFID_ORCHESTRA_SSO_KEY_ID;
      else vi.stubEnv("BEHALFID_ORCHESTRA_SSO_KEY_ID", keyId);
      await expect(issueOrchestraSsoAssertion({ adminId: "cad_1", state: "a".repeat(32) }))
        .rejects.toThrow("key ID");
    }
  });

  it("pins production callback and permits only explicit localhost development overrides", async () => {
    const { getOrchestraSsoCallbackUrl } = await import("@/lib/orchestraSso");
    expect(getOrchestraSsoCallbackUrl()).toBe("https://serv1.behalfid.com/auth/callback");
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_CALLBACK_URL", "https://evil.example/auth/callback");
    expect(() => getOrchestraSsoCallbackUrl()).toThrow("development callback");
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_CALLBACK_URL", "http://localhost:8080/auth/callback");
    expect(getOrchestraSsoCallbackUrl()).toBe("http://localhost:8080/auth/callback");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getOrchestraSsoCallbackUrl()).toThrow("callback configuration");
  });

});

describe("console session attribution", () => {
  it("distinguishes admin sessions from shared, missing, invalid, and expired sessions", async () => {
    vi.stubEnv("BEHALFID_SETUP_TOKEN", "test-session-signing-secret");
    vi.stubEnv("BEHALFID_ADMIN_PASSWORD", "test-shared-password");
    const auth = await import("@/lib/adminAuth");
    expect(auth.parseConsoleSession()).toBeNull();
    expect(auth.parseConsoleSession("invalid.session.value")).toBeNull();
    expect(auth.parseConsoleSession(auth.createConsoleSessionValue() ?? undefined)).toEqual({ kind: "shared" });
    const admin = auth.createConsoleAdminSessionValue("cad_attributed");
    expect(auth.parseConsoleSession(admin)).toEqual({ kind: "admin", adminId: "cad_attributed" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1);
    expect(auth.parseConsoleSession(admin)).toBeNull();
  });
});
