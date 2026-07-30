/**
 * User-facing hints when password login is not available for an account.
 * Wording is generic enough not to enumerate which providers are configured.
 */
export function oauthOnlyLoginMessage(authProviders: string[] | undefined): string {
  const external = (authProviders ?? []).filter((provider) => provider !== "password");
  if (external.length === 0) {
    return "This account does not use password sign-in.";
  }

  const labels = external.map((provider) => {
    if (provider === "github") return "GitHub";
    if (provider === "google") return "Google";
    return provider;
  });

  if (labels.length === 1) {
    return `This account uses ${labels[0]} sign-in. Use Continue with ${labels[0]}.`;
  }

  const last = labels.pop();
  return `This account uses external sign-in. Use Continue with ${labels.join(", ")} or ${last}.`;
}
