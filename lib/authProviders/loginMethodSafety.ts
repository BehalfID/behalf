import ExternalIdentity from "@/models/ExternalIdentity";
import PasskeyCredential from "@/models/PasskeyCredential";
import DeveloperUser from "@/models/DeveloperUser";
import type { LoginMethod } from "@/lib/authProviders/loginMethods";

export type UsableLoginMethod =
  | { method: "password" }
  | { method: "github" | "google"; providerAccountId: string }
  | { method: "passkey"; credentialRecordId: string; count: number };

export type UsableLoginMethodsSnapshot = {
  methods: UsableLoginMethod[];
  /** Distinct method kinds that can currently authenticate this user. */
  kinds: LoginMethod[];
  /** Total credential-level usable factors (passkeys counted individually). */
  totalFactors: number;
  hasPassword: boolean;
  oauthProviderCount: number;
  passkeyCount: number;
  /**
   * Non-passkey recovery methods (password or OAuth). Passkey-only accounts
   * are blocked for recovery reasons — see canRemoveMethod.
   */
  nonPasskeyFactorCount: number;
};

/**
 * Authoritative inventory of ways this user can sign in right now.
 *
 * Disabled/unconfigured providers still count once linked: the identity exists
 * and would work again when configuration returns. Enterprise SSO enforcement
 * is not a personal linkable method and is not counted here.
 */
export async function getUsableLoginMethods(userId: string): Promise<UsableLoginMethodsSnapshot> {
  const [user, identities, passkeyCount] = await Promise.all([
    DeveloperUser.findOne({ userId }).select("+passwordHash userId").lean(),
    ExternalIdentity.find({ userId }).select("provider providerAccountId").lean(),
    PasskeyCredential.countDocuments({ userId })
  ]);

  const methods: UsableLoginMethod[] = [];
  const kinds = new Set<LoginMethod>();

  const hasPassword = Boolean(user?.passwordHash);
  if (hasPassword) {
    methods.push({ method: "password" });
    kinds.add("password");
  }

  for (const identity of identities) {
    const provider = identity.provider as "github" | "google";
    methods.push({ method: provider, providerAccountId: identity.providerAccountId });
    kinds.add(provider);
  }

  if (passkeyCount > 0) {
    methods.push({
      method: "passkey",
      credentialRecordId: "*",
      count: passkeyCount
    });
    kinds.add("passkey");
  }

  const oauthProviderCount = identities.length;
  const nonPasskeyFactorCount = (hasPassword ? 1 : 0) + oauthProviderCount;

  return {
    methods,
    kinds: Array.from(kinds),
    totalFactors: (hasPassword ? 1 : 0) + oauthProviderCount + passkeyCount,
    hasPassword,
    oauthProviderCount,
    passkeyCount,
    nonPasskeyFactorCount
  };
}

export type MethodRemovalKind = "password" | "github" | "google" | "passkey";

/**
 * Whether removing one factor would leave the account without a safe way back in.
 *
 * Recovery policy (Workstream H): passkey-only accounts are not allowed.
 * After any removal the user must retain at least one non-passkey method
 * (password or linked OAuth), except when removing a passkey while other
 * passkeys/password/OAuth remain and at least one non-passkey stays.
 */
export async function canRemoveLoginMethod(
  userId: string,
  removal: { kind: MethodRemovalKind; passkeyCredentialRecordId?: string }
): Promise<{ allowed: boolean; reason?: "unlink_last_method" | "passkey_only_forbidden" | "not_found" }> {
  const snapshot = await getUsableLoginMethods(userId);

  if (removal.kind === "password") {
    if (!snapshot.hasPassword) return { allowed: false, reason: "not_found" };
    const remainingNonPasskey = snapshot.oauthProviderCount;
    if (remainingNonPasskey < 1) {
      // Would leave OAuth-less: either nothing, or passkeys only.
      if (snapshot.passkeyCount > 0) {
        return { allowed: false, reason: "passkey_only_forbidden" };
      }
      return { allowed: false, reason: "unlink_last_method" };
    }
    return { allowed: true };
  }

  if (removal.kind === "github" || removal.kind === "google") {
    const hasProvider = snapshot.methods.some((m) => m.method === removal.kind);
    if (!hasProvider) return { allowed: false, reason: "not_found" };
    const remainingOAuth = snapshot.oauthProviderCount - 1;
    const remainingNonPasskey = (snapshot.hasPassword ? 1 : 0) + remainingOAuth;
    if (remainingNonPasskey < 1) {
      if (snapshot.passkeyCount > 0) {
        return { allowed: false, reason: "passkey_only_forbidden" };
      }
      return { allowed: false, reason: "unlink_last_method" };
    }
    return { allowed: true };
  }

  // passkey
  if (snapshot.passkeyCount < 1) return { allowed: false, reason: "not_found" };
  if (removal.passkeyCredentialRecordId) {
    const exists = await PasskeyCredential.exists({
      userId,
      credentialRecordId: removal.passkeyCredentialRecordId
    });
    if (!exists) return { allowed: false, reason: "not_found" };
  }
  const remainingPasskeys = snapshot.passkeyCount - 1;
  const remainingTotal =
    (snapshot.hasPassword ? 1 : 0) + snapshot.oauthProviderCount + remainingPasskeys;
  if (remainingTotal < 1) {
    return { allowed: false, reason: "unlink_last_method" };
  }
  return { allowed: true };
}

/** Passkeys may only be added when a non-passkey recovery method already exists. */
export async function canAddPasskey(userId: string): Promise<boolean> {
  const snapshot = await getUsableLoginMethods(userId);
  return snapshot.nonPasskeyFactorCount >= 1;
}
