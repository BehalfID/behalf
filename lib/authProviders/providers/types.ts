import type { AuthPrincipalKind } from "@/lib/authProviders/principals";
import type { ExternalIdentityProvider } from "@/models/ExternalIdentity";
import type { OAuthFlowMode } from "@/models/OAuthAuthorizationState";

export type { ExternalIdentityProvider, OAuthFlowMode };

/**
 * A normalized identity assertion from a login provider.
 *
 * Every provider adapter reduces its own response shape to this. Downstream
 * code (linking policy, registration, session creation) never sees provider
 * payloads, so adding a provider cannot change linking semantics.
 */
export type NormalizedLoginIdentity = {
  provider: ExternalIdentityProvider;
  /** Provider's immutable account key. Never a username or email. */
  providerAccountId: string;
  /** Display handle. Informational only — mutable at the provider. */
  username: string | null;
  /** Verified primary email, or null when the provider has none to assert. */
  email: string | null;
  /** True only when the provider states the email above is verified. */
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
};

export type ProviderConfigStatus =
  | { configured: true }
  | { configured: false; reason: string };

export type AuthorizeRequest = {
  requestOrigin: string;
  mode: OAuthFlowMode;
  /** PKCE challenge derived from a server-held verifier. Ignored by providers without PKCE. */
  codeChallenge: string;
  /** Opaque single-use state secret. */
  state: string;
};

export type ExchangeRequest = {
  requestOrigin: string;
  code: string;
  codeVerifier: string;
};

/**
 * Error codes an adapter may return. Codes rather than prose so the UI owns the
 * wording and no provider response text reaches the user verbatim.
 */
export type LoginProviderErrorCode =
  | "provider_not_configured"
  | "exchange_failed"
  | "identity_unavailable";

/**
 * A human login provider using the OAuth 2.0 authorization code flow.
 *
 * Adapters are stateless and free of side effects apart from provider HTTP
 * calls: state persistence, identity linking, and session creation all live in
 * the provider-neutral service layer.
 */
export type LoginIdentityProvider = {
  id: ExternalIdentityProvider;
  displayName: string;
  principalKind: Extract<AuthPrincipalKind, "human_login">;
  /** Scopes requested. Kept minimal and asserted by tests. */
  scopes: readonly string[];
  supportsPkce: boolean;
  isConfigured(): ProviderConfigStatus;
  buildAuthorizeUrl(request: AuthorizeRequest): string;
  /**
   * Exchanges the authorization code server-side and returns a normalized
   * identity. Access tokens must not escape this call.
   */
  exchangeCodeForIdentity(
    request: ExchangeRequest
  ): Promise<{ identity: NormalizedLoginIdentity } | { error: LoginProviderErrorCode }>;
};
