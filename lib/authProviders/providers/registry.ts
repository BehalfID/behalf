import { githubLoginProvider } from "@/lib/authProviders/providers/github";
import type {
  ExternalIdentityProvider,
  LoginIdentityProvider
} from "@/lib/authProviders/providers/types";

/**
 * Human login providers wired into the OAuth authorization-code service.
 *
 * Google is intentionally absent. Its OIDC route predates this abstraction and
 * also carries the workspace-SSO enforcement path (lib/workspaceSso.ts), which
 * is an account-level policy rather than a personal login identity. Migrating
 * it is sequenced in docs/AUTH_PROVIDERS.md; doing it in the same change as
 * GitHub would put SSO enforcement at risk for no user-visible gain.
 */
const LOGIN_PROVIDERS: Record<string, LoginIdentityProvider> = {
  [githubLoginProvider.id]: githubLoginProvider
};

export function getLoginProvider(id: string): LoginIdentityProvider | null {
  return LOGIN_PROVIDERS[id] ?? null;
}

export function listLoginProviders(): LoginIdentityProvider[] {
  return Object.values(LOGIN_PROVIDERS);
}

/** Providers that are both registered and fully configured in this environment. */
export function listEnabledLoginProviders(): LoginIdentityProvider[] {
  return listLoginProviders().filter((provider) => provider.isConfigured().configured);
}

export function isLoginProviderEnabled(id: ExternalIdentityProvider): boolean {
  return getLoginProvider(id)?.isConfigured().configured ?? false;
}
