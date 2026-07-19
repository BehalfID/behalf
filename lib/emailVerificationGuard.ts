import type { DeveloperUserDocument } from "@/models/DeveloperUser";

/** API paths unverified users may call while completing email verification. */
export const UNVERIFIED_AUTH_API_PATHS = new Set([
  "/api/auth/resend-verification",
  "/api/auth/verify-email",
  "/api/auth/verification-status",
  "/api/auth/logout",
  "/api/auth/session/ping"
]);

export function isUnverifiedAuthApiPath(pathname: string): boolean {
  return UNVERIFIED_AUTH_API_PATHS.has(pathname);
}

type EmailVerifiedField = Pick<DeveloperUserDocument, "emailVerified"> | { emailVerified?: boolean | null };

/** True when the user must verify email before accessing the app. */
export function requiresEmailVerificationRedirect(user: EmailVerifiedField | null | undefined): boolean {
  return user?.emailVerified === false;
}
