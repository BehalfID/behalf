/**
 * The distinct kinds of principal BehalfID authenticates.
 *
 * These are deliberately separate concepts. Collapsing them is the root of most
 * identity bugs in control planes: an enterprise SSO assertion is not the same
 * trust statement as a personal OAuth login, and a repo installation is not a
 * human at all. Each kind has its own lifecycle, its own revocation story, and
 * its own answer to "who is accountable for this action".
 *
 * See docs/AUTH_PROVIDERS.md for the full architecture note.
 */
export const AUTH_PRINCIPAL_KINDS = [
  /** A person signing in to the control plane (password, GitHub, Google). */
  "human_login",
  /** A workspace-enforced federation policy (Google Workspace SSO today). */
  "enterprise_sso",
  /** A repository/app installation acting on a repo, not on a person's behalf. */
  "repo_installation",
  /** A long-lived programmatic credential scoped to a user + workspace. */
  "api_token",
  /** A registered agent identity verified through the enforcement path. */
  "agent_identity"
] as const;

export type AuthPrincipalKind = (typeof AUTH_PRINCIPAL_KINDS)[number];

/**
 * Whether a principal kind may establish a browser session for a human.
 *
 * Only `human_login` and `enterprise_sso` can. In particular a repo
 * installation must never mint a developer session: an installation proves
 * "this app may act on this repository", not "this person is signed in".
 */
export function canEstablishHumanSession(kind: AuthPrincipalKind): boolean {
  return kind === "human_login" || kind === "enterprise_sso";
}

/**
 * Whether a principal kind is linkable to a DeveloperUser as a login method.
 *
 * Enterprise SSO is excluded on purpose. Workspace SSO is an account-level
 * policy evaluated per workspace (lib/workspaceSso.ts); modelling it as a
 * personal linked identity would let a user "unlink" their way out of an
 * enforced policy.
 */
export function isLinkableLoginPrincipal(kind: AuthPrincipalKind): boolean {
  return kind === "human_login";
}
