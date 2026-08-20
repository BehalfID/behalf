/**
 * Console session signing: a session must not be forgeable when no signing
 * secret is configured.
 *
 * The v2 admin cookie is `v2.<adminId>.<issuedAt>.<nonce>.<HMAC>`. The signing
 * key previously fell back to a constant literal in lib/adminAuth.ts, and the
 * admin branch — unlike the shared-password branch — had no guard for a missing
 * secret, so a deploy with neither env var set would accept a cookie anyone
 * could mint from this repo's source.
 */
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConsoleAdminSessionValue, isValidConsoleSession } from "@/lib/adminAuth";

const SETUP_TOKEN = "BEHALFID_SETUP_TOKEN";
const ADMIN_PASSWORD = "BEHALFID_ADMIN_PASSWORD";

function forgeSession(secret: string, adminId = "admin_test") {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(12).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`admin.${adminId}.${issuedAt}.${nonce}`)
    .digest("base64url");
  return `v2.${adminId}.${issuedAt}.${nonce}.${signature}`;
}

describe("console admin session signing", () => {
  const original = { setup: process.env[SETUP_TOKEN], admin: process.env[ADMIN_PASSWORD] };

  beforeEach(() => {
    delete process.env[SETUP_TOKEN];
    delete process.env[ADMIN_PASSWORD];
  });

  afterEach(() => {
    if (original.setup === undefined) delete process.env[SETUP_TOKEN];
    else process.env[SETUP_TOKEN] = original.setup;
    if (original.admin === undefined) delete process.env[ADMIN_PASSWORD];
    else process.env[ADMIN_PASSWORD] = original.admin;
  });

  it("rejects a session forged with the former fallback constant", () => {
    expect(isValidConsoleSession(forgeSession("dev-console-session"))).toBe(false);
  });

  it("refuses to mint a session when no signing secret is configured", () => {
    expect(createConsoleAdminSessionValue("admin_test")).toBeNull();
  });

  it("accepts a session it minted when a secret is configured", () => {
    process.env[SETUP_TOKEN] = "a-real-setup-token";
    const session = createConsoleAdminSessionValue("admin_test");
    expect(session).not.toBeNull();
    expect(isValidConsoleSession(session as string)).toBe(true);
  });

  it("rejects a session signed with a different secret", () => {
    process.env[SETUP_TOKEN] = "a-real-setup-token";
    expect(isValidConsoleSession(forgeSession("some-other-secret"))).toBe(false);
  });

  it("rejects a previously valid session once the secret is rotated away", () => {
    process.env[SETUP_TOKEN] = "a-real-setup-token";
    const session = createConsoleAdminSessionValue("admin_test") as string;
    delete process.env[SETUP_TOKEN];
    expect(isValidConsoleSession(session)).toBe(false);
  });
});
