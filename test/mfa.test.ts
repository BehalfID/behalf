import { describe, expect, it } from "vitest";
import {
  consumeBackupCode,
  createMfaChallengeToken,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBackupCodes,
  generateTotpSecret,
  verifyMfaChallengeToken,
  verifyTotpCode
} from "@/lib/mfa";
import { Secret, TOTP } from "otpauth";

describe("mfa", () => {
  it("round-trips encrypted TOTP secrets", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP");
    expect(decryptMfaSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("verifies a current TOTP code", () => {
    const { secretBase32 } = generateTotpSecret();
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32)
    });
    expect(verifyTotpCode(secretBase32, totp.generate())).toBe(true);
    expect(verifyTotpCode(secretBase32, "000000")).toBe(false);
  });

  it("consumes backup codes once", () => {
    const { codes, hashes } = generateBackupCodes();
    const first = consumeBackupCode(hashes, codes[0]);
    expect(first.ok).toBe(true);
    const second = consumeBackupCode(first.remainingHashes, codes[0]);
    expect(second.ok).toBe(false);
  });

  it("issues and verifies MFA challenge tokens", async () => {
    const token = await createMfaChallengeToken("user_123");
    expect(verifyMfaChallengeToken(token)?.userId).toBe("user_123");
    expect(verifyMfaChallengeToken("bad.token")).toBeNull();
  });
});
