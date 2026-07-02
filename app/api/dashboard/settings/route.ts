import { type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { noCacheJson } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);

  return noCacheJson({
    email: auth.user.email,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    apiUsage: "API usage details coming soon.",
    dangerZone: "To delete your account, contact support@behalfid.com",
    delegatedPermissions: actor
      ? {
          role: actor.role,
          roleLabel: serializeWorkspaceAuthority(actor).roleLabel,
          authorityLevel: actor.authorityLevel
        }
      : null
  });
}
