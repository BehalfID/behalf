/**
 * Client-safe hrefs that start provider link flows from account settings.
 */
import { githubAuthHref } from "@/lib/githubOAuthClient";

export function providerLinkHref(provider: string): string | null {
  if (provider === "github") return githubAuthHref("link");
  return null;
}
