import type { NextRequest } from "next/server";
import { listIdentitiesForUser } from "@/lib/authProviders/externalIdentityService";
import { listLoginProviders } from "@/lib/authProviders/providers/registry";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import DeveloperUser from "@/models/DeveloperUser";

/**
 * Linked login identities for the signed-in account, plus what the account
 * would have left if each were removed. The client needs that second part to
 * explain why a disconnect button is disabled without a failed round trip.
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  await connectToDatabase();

  const [identities, user] = await Promise.all([
    listIdentitiesForUser(auth.user.userId),
    DeveloperUser.findOne({ userId: auth.user.userId })
      .select("+passwordHash userId")
      .lean()
  ]);

  const hasPassword = Boolean(user?.passwordHash);

  return noCacheJson({
    hasPassword,
    providers: listLoginProviders().map((provider) => {
      const linked = identities.find((identity) => identity.provider === provider.id) ?? null;
      return {
        provider: provider.id,
        displayName: provider.displayName,
        available: provider.isConfigured().configured,
        linked: Boolean(linked),
        username: linked?.providerUsername ?? null,
        linkedAt: linked?.linkedAt ?? null,
        lastLoginAt: linked?.lastLoginAt ?? null,
        canUnlink: Boolean(linked) && (hasPassword || identities.length > 1)
      };
    })
  });
}
