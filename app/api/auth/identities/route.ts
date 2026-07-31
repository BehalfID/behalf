import type { NextRequest } from "next/server";
import { listIdentitiesForUser } from "@/lib/authProviders/externalIdentityService";
import { getUsableLoginMethods } from "@/lib/authProviders/loginMethodSafety";
import { loginMethodDisplayName } from "@/lib/authProviders/loginMethods";
import { listPasskeysForUser } from "@/lib/authProviders/passkeyService";
import { listLoginProviders } from "@/lib/authProviders/providers/registry";
import { isWebAuthnConfigured } from "@/lib/authProviders/webauthnConfig";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import DeveloperUser from "@/models/DeveloperUser";
import type { LoginMethod } from "@/lib/authProviders/loginMethods";

/**
 * Authentication methods for the signed-in account: password, OAuth providers,
 * passkeys, last-sign-in metadata, and whether each factor can be removed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  await connectToDatabase();

  const [identities, user, passkeys, snapshot] = await Promise.all([
    listIdentitiesForUser(auth.user.userId),
    DeveloperUser.findOne({ userId: auth.user.userId })
      .select(
        "+passwordHash userId passwordLastUsedAt lastSignInAt lastSignInMethod lastSignInUserAgent"
      )
      .lean(),
    listPasskeysForUser(auth.user.userId),
    getUsableLoginMethods(auth.user.userId)
  ]);

  const hasPassword = Boolean(user?.passwordHash);
  const lastSignInMethod = (user?.lastSignInMethod as LoginMethod | null | undefined) ?? null;

  return noCacheJson({
    hasPassword,
    passwordLastUsedAt: user?.passwordLastUsedAt
      ? new Date(user.passwordLastUsedAt).toISOString()
      : null,
    lastSignIn: {
      at: user?.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
      method: lastSignInMethod,
      methodDisplayName: lastSignInMethod ? loginMethodDisplayName(lastSignInMethod) : null,
      userAgent: user?.lastSignInUserAgent ?? null
    },
    providers: listLoginProviders().map((provider) => {
      const linked = identities.find((identity) => identity.provider === provider.id) ?? null;
      const remainingNonPasskeyAfterUnlink =
        (snapshot.hasPassword ? 1 : 0) + Math.max(0, snapshot.oauthProviderCount - (linked ? 1 : 0));
      const canUnlink = Boolean(linked) && remainingNonPasskeyAfterUnlink >= 1;
      return {
        provider: provider.id,
        displayName: provider.displayName,
        available: provider.isConfigured().configured,
        linked: Boolean(linked),
        username: linked?.providerUsername ?? null,
        linkedAt: linked?.linkedAt ?? null,
        lastLoginAt: linked?.lastLoginAt ?? null,
        canUnlink,
        mostRecentlyUsed: lastSignInMethod === provider.id
      };
    }),
    passkeys: {
      available: isWebAuthnConfigured(),
      canAdd: snapshot.nonPasskeyFactorCount >= 1 && isWebAuthnConfigured(),
      credentials: passkeys.map((passkey) => ({
        ...passkey,
        mostRecentlyUsed:
          lastSignInMethod === "passkey" &&
          user?.lastSignInAt &&
          passkey.lastUsedAt &&
          Math.abs(new Date(passkey.lastUsedAt).getTime() - new Date(user.lastSignInAt).getTime()) <
            5000,
        canRemove:
          snapshot.totalFactors > 1 ||
          (snapshot.passkeyCount > 1 && snapshot.nonPasskeyFactorCount >= 1)
      }))
    },
    password: {
      present: hasPassword,
      lastUsedAt: user?.passwordLastUsedAt
        ? new Date(user.passwordLastUsedAt).toISOString()
        : null,
      mostRecentlyUsed: lastSignInMethod === "password"
    }
  });
}
