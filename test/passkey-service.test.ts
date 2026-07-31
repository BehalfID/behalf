import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWebAuthnConfig: vi.fn(),
  canAddPasskey: vi.fn(),
  canRemoveLoginMethod: vi.fn(),
  challengeCreate: vi.fn(),
  challengeFindOneAndUpdate: vi.fn(),
  passkeyFind: vi.fn(),
  passkeyCreate: vi.fn(),
  passkeyFindOne: vi.fn(),
  passkeyUpdateOne: vi.fn(),
  passkeyFindOneAndUpdate: vi.fn(),
  passkeyFindOneAndDelete: vi.fn(),
  passkeyCount: vi.fn(),
  passkeyExists: vi.fn(),
  userUpdateOne: vi.fn(),
  recordIdentityAudit: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn()
}));

vi.mock("@/lib/authProviders/webauthnConfig", () => ({
  getWebAuthnConfig: mocks.getWebAuthnConfig
}));
vi.mock("@/lib/authProviders/loginMethodSafety", () => ({
  canAddPasskey: mocks.canAddPasskey,
  canRemoveLoginMethod: mocks.canRemoveLoginMethod
}));
vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));
vi.mock("@/lib/authProviders/authUsage", () => ({
  recordSuccessfulLogin: mocks.recordSuccessfulLogin
}));
vi.mock("@/models/WebAuthnChallenge", () => ({
  default: {
    create: mocks.challengeCreate,
    findOneAndUpdate: mocks.challengeFindOneAndUpdate
  }
}));
vi.mock("@/models/PasskeyCredential", () => ({
  default: {
    find: mocks.passkeyFind,
    create: mocks.passkeyCreate,
    findOne: mocks.passkeyFindOne,
    updateOne: mocks.passkeyUpdateOne,
    findOneAndUpdate: mocks.passkeyFindOneAndUpdate,
    findOneAndDelete: mocks.passkeyFindOneAndDelete,
    countDocuments: mocks.passkeyCount,
    exists: mocks.passkeyExists
  }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { updateOne: mocks.userUpdateOne }
}));
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse
}));

import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  removePasskey
} from "@/lib/authProviders/passkeyService";

const config = {
  rpID: "behalfid.com",
  rpName: "BehalfID",
  origin: "https://behalfid.com",
  expectedOrigins: ["https://behalfid.com", "https://www.behalfid.com"]
};

function leanChain(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("passkeyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebAuthnConfig.mockReturnValue(config);
    mocks.canAddPasskey.mockResolvedValue(true);
    mocks.challengeCreate.mockResolvedValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
    mocks.recordSuccessfulLogin.mockResolvedValue(undefined);
    mocks.userUpdateOne.mockResolvedValue({});
    mocks.passkeyFind.mockReturnValue({
      select: vi.fn().mockReturnValue(leanChain([]))
    });
  });

  it("rejects registration when WebAuthn is unconfigured", async () => {
    mocks.getWebAuthnConfig.mockReturnValue(null);
    await expect(
      beginPasskeyRegistration({ userId: "u1", email: "a@b.com" })
    ).resolves.toEqual({ ok: false, code: "webauthn_unconfigured" });
  });

  it("rejects registration without a recovery method", async () => {
    mocks.canAddPasskey.mockResolvedValue(false);
    await expect(
      beginPasskeyRegistration({ userId: "u1", email: "a@b.com" })
    ).resolves.toEqual({ ok: false, code: "passkey_requires_recovery" });
  });

  it("begins registration with a stored challenge", async () => {
    mocks.generateRegistrationOptions.mockResolvedValue({
      challenge: "challenge-reg",
      rp: { id: "behalfid.com", name: "BehalfID" }
    });
    const result = await beginPasskeyRegistration({ userId: "u1", email: "a@b.com" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.challenge).toBe("challenge-reg");
      expect(mocks.challengeCreate).toHaveBeenCalled();
    }
  });

  it("rejects finish registration on invalid/expired challenge", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(leanChain(null));
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "missing", origin: "https://behalfid.com", type: "webauthn.create" })
    ).toString("base64url");
    await expect(
      finishPasskeyRegistration({
        userId: "u1",
        response: {
          id: "cred",
          rawId: "cred",
          type: "public-key",
          clientExtensionResults: {},
          response: {
            clientDataJSON: clientData,
            attestationObject: "attestation"
          }
        }
      })
    ).resolves.toEqual({ ok: false, code: "invalid_challenge" });
  });

  it("registers on valid verification", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(
      leanChain({ challengeId: "wach_1", userId: "u1" })
    );
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ["internal"]
        },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        aaguid: "00000000-0000-0000-0000-000000000000"
      }
    });
    mocks.passkeyCreate.mockResolvedValue({});
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "challenge-reg", origin: "https://behalfid.com", type: "webauthn.create" })
    ).toString("base64url");
    const result = await finishPasskeyRegistration({
      userId: "u1",
      nickname: "MacBook Pro",
      response: {
        id: "cred-1",
        rawId: "cred-1",
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData,
          attestationObject: "attestation",
          transports: ["internal"]
        }
      }
    });
    expect(result.ok).toBe(true);
    expect(mocks.passkeyCreate).toHaveBeenCalled();
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "passkey_registered" })
    );
  });

  it("rejects duplicate credential registration", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(
      leanChain({ challengeId: "wach_1", userId: "u1" })
    );
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false
      }
    });
    mocks.passkeyCreate.mockRejectedValue({ code: 11000 });
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "challenge-reg", origin: "https://behalfid.com", type: "webauthn.create" })
    ).toString("base64url");
    await expect(
      finishPasskeyRegistration({
        userId: "u1",
        response: {
          id: "cred-1",
          rawId: "cred-1",
          type: "public-key",
          clientExtensionResults: {},
          response: { clientDataJSON: clientData, attestationObject: "attestation" }
        }
      })
    ).resolves.toEqual({ ok: false, code: "duplicate_credential" });
  });

  it("begins usernameless authentication", async () => {
    mocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: "challenge-auth",
      rpId: "behalfid.com"
    });
    const result = await beginPasskeyAuthentication();
    expect(result.ok).toBe(true);
    expect(mocks.challengeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "authentication", userId: null })
    );
  });

  it("rejects authentication for unknown credential without leaking", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(
      leanChain({ challengeId: "wach_2", userId: null })
    );
    mocks.passkeyFindOne.mockReturnValue(leanChain(null));
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "challenge-auth", origin: "https://behalfid.com", type: "webauthn.get" })
    ).toString("base64url");
    await expect(
      finishPasskeyAuthentication({
        response: {
          id: "unknown",
          rawId: "unknown",
          type: "public-key",
          clientExtensionResults: {},
          response: {
            clientDataJSON: clientData,
            authenticatorData: "ad",
            signature: "sig",
            userHandle: null
          }
        }
      })
    ).resolves.toEqual({ ok: false, code: "unknown_credential" });
  });

  it("updates counter and lastUsedAt on valid assertion", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(
      leanChain({ challengeId: "wach_2", userId: null })
    );
    mocks.passkeyFindOne.mockReturnValue(
      leanChain({
        credentialRecordId: "pkcred_1",
        userId: "u1",
        credentialId: "cred-1",
        publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
        signCount: 1,
        nickname: "YubiKey",
        transports: ["usb"]
      })
    );
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 }
    });
    mocks.passkeyUpdateOne.mockResolvedValue({});
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "challenge-auth", origin: "https://behalfid.com", type: "webauthn.get" })
    ).toString("base64url");
    const result = await finishPasskeyAuthentication({
      response: {
        id: "cred-1",
        rawId: "cred-1",
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData,
          authenticatorData: "ad",
          signature: "sig",
          userHandle: null
        }
      }
    });
    expect(result).toEqual({
      ok: true,
      userId: "u1",
      credentialRecordId: "pkcred_1"
    });
    expect(mocks.passkeyUpdateOne).toHaveBeenCalledWith(
      { credentialRecordId: "pkcred_1" },
      expect.objectContaining({ $set: expect.objectContaining({ signCount: 2 }) })
    );
    expect(mocks.recordSuccessfulLogin).toHaveBeenCalledWith(
      expect.objectContaining({ method: "passkey", userId: "u1" })
    );
  });

  it("rejects counter rollback as anomaly", async () => {
    mocks.challengeFindOneAndUpdate.mockReturnValue(
      leanChain({ challengeId: "wach_2", userId: null })
    );
    mocks.passkeyFindOne.mockReturnValue(
      leanChain({
        credentialRecordId: "pkcred_1",
        userId: "u1",
        credentialId: "cred-1",
        publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
        signCount: 5,
        nickname: "YubiKey"
      })
    );
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 3 }
    });
    const clientData = Buffer.from(
      JSON.stringify({ challenge: "challenge-auth", origin: "https://behalfid.com", type: "webauthn.get" })
    ).toString("base64url");
    await expect(
      finishPasskeyAuthentication({
        response: {
          id: "cred-1",
          rawId: "cred-1",
          type: "public-key",
          clientExtensionResults: {},
          response: {
            clientDataJSON: clientData,
            authenticatorData: "ad",
            signature: "sig",
            userHandle: null
          }
        }
      })
    ).resolves.toEqual({ ok: false, code: "counter_anomaly" });
    expect(mocks.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("refuses removing the last usable method", async () => {
    mocks.canRemoveLoginMethod.mockResolvedValue({
      allowed: false,
      reason: "unlink_last_method"
    });
    await expect(
      removePasskey({ userId: "u1", credentialRecordId: "pkcred_1" })
    ).resolves.toEqual({ ok: false, code: "unlink_last_method" });
  });
});
