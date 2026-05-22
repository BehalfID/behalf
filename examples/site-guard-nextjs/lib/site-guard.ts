/**
 * BehalfID Site Guard helper for Next.js middleware.
 *
 * Server-side only. Never import this file from a Client Component or
 * any module that ends up in the browser bundle.
 *
 * SITE_GUARD_KEY must be kept in an environment secret and must never be
 * sent to the browser or included in any client-visible response.
 */

export type SiteGuardDecision = {
  allowed: boolean;
  reason: string;
  requestId: string;
  matchedRuleId: string | null;
  siteId: string | null;
};

export type SiteGuardInput = {
  /** Absolute path, no query string or fragment. e.g. "/docs/api" */
  path: string;
  /** Value of the User-Agent request header. */
  userAgent: string;
  /**
   * Optional caller-supplied agent identifier forwarded from the agent
   * (e.g. via a "behalfid-agent" request header).
   */
  agentIdentifier?: string;
};

/**
 * Check whether an AI agent or crawler signal may access `input.path`.
 *
 * Fail-closed contract
 * --------------------
 * Any network error, non-2xx response, or missing SITE_GUARD_KEY returns
 * { allowed: false } — the caller must not serve the route.
 *
 * No siteId in the body
 * ---------------------
 * Site keys (bhf_site_…) already encode the site.  Do not pass siteId
 * or domain in the request body — the key's own scope always wins.
 */
export async function checkSiteGuardAccess(
  input: SiteGuardInput,
): Promise<SiteGuardDecision> {
  const baseUrl =
    process.env.BEHALFID_BASE_URL ?? "https://behalfid.com";
  const key = process.env.SITE_GUARD_KEY;

  // Fail closed — cannot verify without a key.
  if (!key) {
    console.error(
      "[site-guard] SITE_GUARD_KEY is not set. Failing closed.",
    );
    return failClosed("SITE_GUARD_KEY is not configured.");
  }

  try {
    const response = await fetch(`${baseUrl}/api/site-guard/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Site key authentication — never expose this header client-side.
        Authorization: `Bearer ${key}`,
      },
      // Note: no siteId — the site key already encodes the site scope.
      body: JSON.stringify({
        path: input.path,
        userAgent: input.userAgent,
        agentIdentifier: input.agentIdentifier,
      }),
    });

    if (!response.ok) {
      // Non-2xx from BehalfID → fail closed.
      console.error(
        `[site-guard] Check returned HTTP ${response.status}. Failing closed.`,
      );
      return failClosed("Site Guard check returned an error.");
    }

    return (await response.json()) as SiteGuardDecision;
  } catch (err) {
    // Network error or JSON parse failure → fail closed.
    console.error("[site-guard] Check failed:", err);
    return failClosed("Site Guard is unavailable.");
  }
}

function failClosed(reason: string): SiteGuardDecision {
  return {
    allowed: false,
    reason,
    requestId: "",
    matchedRuleId: null,
    siteId: null,
  };
}
