/**
 * Client-safe OAuth error vocabulary.
 *
 * Callback routes redirect with a stable `oauth_error` code rather than prose,
 * so provider response text never reaches the browser and the wording lives in
 * one place. Every message below is deliberately written to be true regardless
 * of whether an account exists for the address involved — nothing here may
 * confirm or deny the existence of a BehalfID account.
 */
export const OAUTH_ERROR_CODES = [
  "provider_unconfigured",
  "redirect_failed",
  "invalid_state",
  "access_denied",
  "email_unverified",
  "identity_linked_elsewhere",
  "requires_explicit_link",
  "already_linked",
  "unlink_last_method",
  "passkey_only_forbidden",
  "session_required",
  "provider_error"
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

const MESSAGES: Record<OAuthErrorCode, string> = {
  provider_unconfigured:
    "This sign-in method is not available right now. Use your email and password, or try again later.",
  redirect_failed:
    "We could not start the sign-in redirect. Check your connection and try again.",
  invalid_state:
    "This sign-in link expired or was already used. Start the sign-in again from this page.",
  access_denied: "Sign-in was cancelled before it completed.",
  email_unverified:
    "Your provider did not share a verified email address. Verify your primary email with the provider, then try again.",
  identity_linked_elsewhere:
    "That provider account is already connected to a different BehalfID account. Disconnect it there first, or sign in with the account that owns it.",
  requires_explicit_link:
    "To use this provider, sign in to BehalfID first and connect it from Settings → Account security.",
  already_linked: "This provider is already connected to your account.",
  unlink_last_method:
    "Set a password or keep another sign-in method before disconnecting this provider.",
  passkey_only_forbidden:
    "Keep a password or connected provider so you can recover if your passkeys are lost.",
  session_required: "Sign in first, then connect this provider from your account settings.",
  provider_error: "Sign-in could not be completed. Try again."
};

export function isOAuthErrorCode(value: unknown): value is OAuthErrorCode {
  return typeof value === "string" && (OAUTH_ERROR_CODES as readonly string[]).includes(value);
}

/** Maps a code to display copy, falling back to the generic safe message. */
export function oauthErrorMessage(code: unknown): string {
  return isOAuthErrorCode(code) ? MESSAGES[code] : MESSAGES.provider_error;
}
