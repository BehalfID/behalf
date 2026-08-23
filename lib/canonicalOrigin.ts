/**
 * Canonical public origin for crawler-facing metadata: the sitemap's absolute
 * URLs, the `Sitemap:` pointer in robots.txt, and Next's `metadataBase`.
 *
 * These three have to agree. When they don't, crawlers are handed a mix of
 * origins and any host that isn't actually serving becomes a dead reference —
 * a robots.txt advertising an unreachable sitemap is the case that bites
 * hardest, because validators (OpenAI's ads crawler among them) fetch it before
 * they fetch the landing page.
 *
 * NEXT_PUBLIC_APP_URL is a required production env var (see lib/env.ts, where it
 * is also validated as an https URL), so in a correctly configured deployment
 * this resolves to the host that genuinely serves the site. Changing the public
 * host is then an env change in Vercel, not a code change.
 *
 * Deliberately NOT the SDK / CLI / GitHub Action base URL. Those ship their own
 * published defaults (`packages/sdk/src/client.ts`, `packages/cli/src/lib/client.ts`,
 * `packages/github-action/action.yml`) and are versioned independently of this app.
 */
export const DEFAULT_CANONICAL_ORIGIN = "https://behalfid.com";

/**
 * Origin only — scheme + host + optional port, no trailing slash and no path,
 * so callers can concatenate paths without doubling or dropping separators.
 * Falls back to the default when the env var is unset (local dev) or is not a
 * parseable absolute URL, so metadata generation can never throw at build time.
 */
export function canonicalOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return DEFAULT_CANONICAL_ORIGIN;
  try {
    return new URL(configured).origin;
  } catch {
    return DEFAULT_CANONICAL_ORIGIN;
  }
}
