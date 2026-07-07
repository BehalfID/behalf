export const SUPPORT_EMAIL = "support@behalfid.com"; // pragma: allowlist secret

export function accountDeletionSupportMessage(): string {
  return `To delete your account, contact ${SUPPORT_EMAIL}`;
}
