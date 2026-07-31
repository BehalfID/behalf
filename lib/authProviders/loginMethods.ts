/**
 * Canonical human authentication methods that can create a developer session.
 *
 * Enterprise Google Workspace SSO still authenticates through Google OIDC and
 * is recorded as `google` at the account level; the workspace policy layer is
 * separate (see lib/workspaceSso.ts and docs/AUTH_PROVIDERS.md).
 */
export const LOGIN_METHODS = ["password", "github", "google", "passkey"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export function isLoginMethod(value: unknown): value is LoginMethod {
  return typeof value === "string" && (LOGIN_METHODS as readonly string[]).includes(value);
}

export function loginMethodDisplayName(method: LoginMethod): string {
  switch (method) {
    case "password":
      return "Password";
    case "github":
      return "GitHub";
    case "google":
      return "Google";
    case "passkey":
      return "Passkey";
  }
}
