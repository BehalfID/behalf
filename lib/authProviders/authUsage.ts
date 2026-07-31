import type { NextRequest } from "next/server";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import type { LoginMethod } from "@/lib/authProviders/loginMethods";
import type { IdentityAuditProvider } from "@/models/IdentityAuditLog";
import DeveloperUser from "@/models/DeveloperUser";

/**
 * Updates account-level last-sign-in metadata after a successful first factor.
 *
 * Called when credentials are verified, including when MFA is still required —
 * the method was used successfully. Failed attempts must not call this.
 */
export async function updateAccountLastSignIn(options: {
  userId: string;
  method: LoginMethod;
  request?: NextRequest;
}): Promise<void> {
  const now = new Date();
  const userAgent = options.request?.headers.get("user-agent")?.slice(0, 300) ?? null;

  const $set: Record<string, unknown> = {
    lastSignInAt: now,
    lastSignInMethod: options.method,
    lastSignInUserAgent: userAgent
  };

  if (options.method === "password") {
    $set.passwordLastUsedAt = now;
  }

  await DeveloperUser.updateOne({ userId: options.userId }, { $set });

  if (options.method === "passkey") {
    await DeveloperUser.updateOne(
      { userId: options.userId },
      { $addToSet: { authProviders: "passkey" } }
    );
  }
}

/**
 * Account metadata + durable audit for a completed authentication event.
 */
export async function recordSuccessfulLogin(options: {
  userId: string;
  method: LoginMethod;
  request?: NextRequest;
  credentialId?: string;
  providerUsername?: string | null;
  context?: string;
  /** When false, only updates account metadata (caller already wrote audit). */
  writeAudit?: boolean;
}): Promise<void> {
  await updateAccountLastSignIn(options);

  if (options.writeAudit === false) return;

  const auditProvider = options.method as IdentityAuditProvider;
  const action =
    options.method === "password"
      ? "password_login"
      : options.method === "passkey"
        ? "identity_login"
        : "identity_login";

  await recordIdentityAudit({
    userId: options.userId,
    action: options.method === "password" ? "password_login" : action,
    provider: auditProvider,
    providerAccountId: options.credentialId ?? options.method,
    providerUsername: options.providerUsername ?? null,
    request: options.request,
    context: options.context ?? "login"
  });
}
