import type { NextRequest } from "next/server";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import type { NormalizedLoginIdentity } from "@/lib/authProviders/providers/types";
import { normalizeEmail } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import DeveloperUser from "@/models/DeveloperUser";
import ExternalIdentity, {
  type ExternalIdentityProvider
} from "@/models/ExternalIdentity";

export type LinkedIdentitySummary = {
  provider: ExternalIdentityProvider;
  providerUsername: string | null;
  providerEmail: string | null;
  linkedAt: string | null;
  lastLoginAt: string | null;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function findIdentity(
  provider: ExternalIdentityProvider,
  providerAccountId: string
) {
  return ExternalIdentity.findOne({ provider, providerAccountId }).lean();
}

export async function listIdentitiesForUser(
  userId: string
): Promise<LinkedIdentitySummary[]> {
  const identities = await ExternalIdentity.find({ userId })
    .select("-_id provider providerUsername providerEmail linkedAt lastLoginAt")
    .lean();

  return identities.map((identity) => ({
    provider: identity.provider as ExternalIdentityProvider,
    providerUsername: identity.providerUsername ?? null,
    providerEmail: identity.providerEmail ?? null,
    linkedAt: identity.linkedAt ? new Date(identity.linkedAt).toISOString() : null,
    lastLoginAt: identity.lastLoginAt ? new Date(identity.lastLoginAt).toISOString() : null
  }));
}

export type LinkIdentityResult =
  | { ok: true; identityId: string }
  | { ok: false; code: "identity_linked_elsewhere" | "already_linked" };

/**
 * Attaches a provider identity to an already-authenticated account.
 *
 * This is the only path that creates a link for an existing account. There is
 * deliberately no "same email, so it must be the same person" shortcut: a
 * provider asserting an address proves control of that address today, not that
 * the BehalfID account was created by whoever controls it now. Silent merging
 * on email is how OAuth account-takeover chains usually start.
 */
export async function linkIdentity(options: {
  userId: string;
  identity: NormalizedLoginIdentity;
  request?: NextRequest;
  context?: string;
}): Promise<LinkIdentityResult> {
  const { userId, identity } = options;

  const existing = await ExternalIdentity.findOne({
    provider: identity.provider,
    providerAccountId: identity.providerAccountId
  })
    .select("userId")
    .lean();

  if (existing) {
    if (existing.userId === userId) {
      return { ok: false, code: "already_linked" };
    }
    await recordIdentityAudit({
      userId,
      action: "identity_link_rejected",
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      providerUsername: identity.username,
      request: options.request,
      context: options.context ?? "link"
    });
    return { ok: false, code: "identity_linked_elsewhere" };
  }

  const identityId = createPublicId("extid");
  try {
    await ExternalIdentity.create({
      identityId,
      userId,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      providerUsername: identity.username,
      providerEmail: identity.email ? normalizeEmail(identity.email) : null,
      providerEmailVerified: identity.emailVerified,
      linkedAt: new Date()
    });
  } catch (error) {
    // The unique indexes are the real arbiter under concurrency: two callbacks
    // racing to claim the same provider account both pass the read above.
    if (isDuplicateKeyError(error)) {
      const winner = await ExternalIdentity.findOne({
        provider: identity.provider,
        providerAccountId: identity.providerAccountId
      })
        .select("userId")
        .lean();
      return {
        ok: false,
        code: winner?.userId === userId ? "already_linked" : "identity_linked_elsewhere"
      };
    }
    throw error;
  }

  await addAuthProvider(userId, identity.provider);
  await recordIdentityAudit({
    userId,
    action: "identity_linked",
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
    providerUsername: identity.username,
    request: options.request,
    context: options.context ?? "settings"
  });

  return { ok: true, identityId };
}

export type UnlinkIdentityResult =
  | { ok: true }
  | { ok: false; code: "not_linked" | "unlink_last_method" };

/**
 * Detaches a provider identity, refusing when it is the account's only way in.
 *
 * The check counts a password and every *other* linked identity. Removing the
 * last one would lock the user out with no self-service recovery, since a
 * passwordless account cannot use the password-reset flow either.
 */
export async function unlinkIdentity(options: {
  userId: string;
  provider: ExternalIdentityProvider;
  request?: NextRequest;
  context?: string;
}): Promise<UnlinkIdentityResult> {
  const { userId, provider } = options;

  const identity = await ExternalIdentity.findOne({ userId, provider })
    .select("identityId providerAccountId providerUsername")
    .lean();
  if (!identity) {
    return { ok: false, code: "not_linked" };
  }

  const user = await DeveloperUser.findOne({ userId }).select("+passwordHash userId").lean();
  const otherIdentityCount = await ExternalIdentity.countDocuments({
    userId,
    provider: { $ne: provider }
  });

  if (!user?.passwordHash && otherIdentityCount === 0) {
    return { ok: false, code: "unlink_last_method" };
  }

  await ExternalIdentity.deleteOne({ userId, provider });
  await removeAuthProvider(userId, provider);
  await recordIdentityAudit({
    userId,
    action: "identity_unlinked",
    provider,
    providerAccountId: identity.providerAccountId,
    providerUsername: identity.providerUsername ?? null,
    request: options.request,
    context: options.context ?? "settings"
  });

  return { ok: true };
}

export async function touchIdentityLogin(options: {
  provider: ExternalIdentityProvider;
  providerAccountId: string;
  identity: NormalizedLoginIdentity;
}) {
  await ExternalIdentity.updateOne(
    { provider: options.provider, providerAccountId: options.providerAccountId },
    {
      $set: {
        lastLoginAt: new Date(),
        // Display metadata is refreshed on every sign-in so a renamed GitHub
        // account does not show a stale handle in account settings.
        providerUsername: options.identity.username,
        providerEmail: options.identity.email ? normalizeEmail(options.identity.email) : null,
        providerEmailVerified: options.identity.emailVerified
      }
    }
  );
}

/**
 * Keeps DeveloperUser.authProviders in step with the link table.
 *
 * The array remains the fast path for "can this account use a password?"
 * checks scattered through login and deletion; external_identities is the
 * authoritative record of which provider account is attached.
 */
async function addAuthProvider(userId: string, provider: ExternalIdentityProvider) {
  const user = await DeveloperUser.findOne({ userId })
    .select("+passwordHash authProviders userId")
    .lean();
  if (!user) return;

  const providers = new Set<string>(
    user.authProviders?.length ? user.authProviders : user.passwordHash ? ["password"] : []
  );
  providers.add(provider);
  await DeveloperUser.updateOne(
    { userId },
    { $set: { authProviders: Array.from(providers) } }
  );
}

async function removeAuthProvider(userId: string, provider: ExternalIdentityProvider) {
  const user = await DeveloperUser.findOne({ userId })
    .select("+passwordHash authProviders userId")
    .lean();
  if (!user) return;

  const providers = new Set<string>(
    user.authProviders?.length ? user.authProviders : user.passwordHash ? ["password"] : []
  );
  providers.delete(provider);
  if (user.passwordHash) providers.add("password");
  await DeveloperUser.updateOne(
    { userId },
    { $set: { authProviders: Array.from(providers) } }
  );
}

export type LoginResolution =
  | { kind: "existing_identity"; userId: string }
  | { kind: "requires_explicit_link" }
  | { kind: "new_account"; email: string }
  | { kind: "email_unverified" };

/**
 * Decides what an unauthenticated provider callback means, without side effects.
 *
 * The three-way split is the heart of the account-merging policy:
 *   - a known identity signs its owner in;
 *   - an unknown identity whose verified email already belongs to an account is
 *     refused and told to link from settings — never merged;
 *   - an unknown identity with an unclaimed verified email registers.
 *
 * The middle branch is technically distinguishable from the third by anyone who
 * reaches it, but reaching it requires the provider to have verified that email
 * for the requester, i.e. they already control the address. Someone who controls
 * the address can learn the same fact from password reset, so this is not a new
 * disclosure — and the user-facing copy still never confirms an account exists.
 */
export async function resolveProviderLogin(
  identity: NormalizedLoginIdentity
): Promise<LoginResolution> {
  const linked = await ExternalIdentity.findOne({
    provider: identity.provider,
    providerAccountId: identity.providerAccountId
  })
    .select("userId")
    .lean();

  if (linked) {
    return { kind: "existing_identity", userId: linked.userId };
  }

  if (!identity.email || !identity.emailVerified) {
    return { kind: "email_unverified" };
  }

  const email = normalizeEmail(identity.email);
  const existingAccount = await DeveloperUser.exists({ email });
  if (existingAccount) {
    return { kind: "requires_explicit_link" };
  }

  return { kind: "new_account", email };
}
