import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWebAuthnConfig,
  webAuthnAllowedOrigins,
  webAuthnRpId
} from "@/lib/authProviders/webauthnConfig";

describe("webauthnConfig", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  beforeEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.WEBAUTHN_RP_NAME;
  });

  it("derives RP ID and origins from APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://behalfid.com/";
    expect(webAuthnRpId()).toBe("behalfid.com");
    expect(webAuthnAllowedOrigins()).toEqual(
      expect.arrayContaining(["https://behalfid.com", "https://www.behalfid.com"])
    );
    expect(getWebAuthnConfig()?.rpName).toBe("BehalfID");
  });

  it("strips www from RP ID", () => {
    process.env.APP_BASE_URL = "https://www.behalfid.com";
    expect(webAuthnRpId()).toBe("behalfid.com");
  });

  it("allows localhost http for local development", () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(getWebAuthnConfig()?.rpID).toBe("localhost");
    expect(getWebAuthnConfig()?.origin).toBe("http://localhost:3000");
  });

  it("rejects non-localhost http", () => {
    process.env.APP_BASE_URL = "http://preview.example.com";
    expect(getWebAuthnConfig()).toBeNull();
  });

  it("returns null when unconfigured", () => {
    expect(getWebAuthnConfig()).toBeNull();
  });
});
