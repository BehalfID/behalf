import { NextResponse, type NextRequest } from "next/server";
import { requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { findAccountById } from "@/lib/repositories/accounts";
import { listByUserId as listExternalIdentities } from "@/lib/repositories/externalIdentities";
import { listIdentityAuditLogs } from "@/lib/repositories/identityAudit";
import { findMembershipsByUserId } from "@/lib/repositories/memberships";
import { listPasskeysByUserId } from "@/lib/repositories/passkeys";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";

/**
 * Self-service data export (GDPR Art. 15/20 access + portability). Scoped to
 * the account/profile data the user provided directly — not bulk operational
 * telemetry (verification logs, webhook deliveries), which is already
 * viewable and deletable from the dashboard logs page per the privacy policy.
 */
export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const user = auth.user;

  const [memberships, externalIdentities, passkeys, identityAuditHistory] = await Promise.all([
    findMembershipsByUserId(user.userId),
    listExternalIdentities(user.userId),
    listPasskeysByUserId(user.userId),
    listIdentityAuditLogs(user.userId, 500)
  ]);

  const workspaces = await Promise.all(
    memberships.map(async (membership) => {
      const account = await findAccountById(membership.accountId);
      return {
        accountId: membership.accountId,
        role: membership.role,
        joinedAt: membership.createdAt ?? null,
        workspaceName: account?.name ?? null,
        workspaceSlug: account?.slug ?? null,
        companyName: account?.companyName ?? null,
        website: account?.website ?? null
      };
    })
  );

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    account: {
      userId: user.userId,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      jobTitle: user.jobTitle ?? null,
      phone: user.phone ?? null,
      onboardingUseCase: user.onboardingUseCase ?? null,
      emailVerified: Boolean(user.emailVerified),
      mfaEnabled: Boolean(user.mfaEnabledAt),
      lastSignInAt: user.lastSignInAt ?? null,
      lastSignInMethod: user.lastSignInMethod ?? null,
      createdAt: user.createdAt ?? null
    },
    linkedIdentities: externalIdentities.map((identity) => ({
      provider: identity.provider,
      providerUsername: identity.providerUsername,
      providerEmail: identity.providerEmail,
      linkedAt: identity.linkedAt,
      lastLoginAt: identity.lastLoginAt
    })),
    passkeys: passkeys.map((passkey) => ({
      nickname: passkey.nickname,
      deviceType: passkey.deviceType,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt
    })),
    workspaces,
    identityAuditHistory: identityAuditHistory.map((entry) => ({
      action: entry.action,
      provider: entry.provider,
      providerUsername: entry.providerUsername,
      context: entry.context,
      createdAt: entry.createdAt
    })),
    note:
      "Verification logs and webhook delivery history are not included in this export — " +
      "view or delete them directly from the dashboard logs page."
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="behalfid-account-export-${user.userId}.json"`
    }
  });
}
