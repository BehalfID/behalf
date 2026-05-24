/**
 * Snippet builders for the Site Guard integration panel.
 *
 * All snippets use site-key authentication (Authorization: Bearer).
 * None of them include siteId — the key already encodes the site scope.
 *
 * rawKey should only be passed when a key was just created and has not yet
 * been dismissed from local state.  Otherwise snippets use the env-var
 * placeholder so users fill in their own value.
 *
 * All returned strings are server-side code only.  Never expose SITE_GUARD_KEY
 * in browser code or client-visible responses.
 */

export const SITE_GUARD_KEY_PLACEHOLDER = "bhf_site_REPLACE_ME";
export const SITE_GUARD_API_URL = "https://www.behalfid.com/api/site-guard/check";

/**
 * Returns the .env snippet for SITE_GUARD_KEY.
 * Uses the rawKey if it was just created and is still in local state,
 * otherwise falls back to the placeholder.
 */
export function buildSiteGuardEnvSnippet(rawKey?: string): string {
  const value = rawKey ?? SITE_GUARD_KEY_PLACEHOLDER;
  return `SITE_GUARD_KEY=${value}`;
}

/**
 * Returns a curl snippet for testing Site Guard.
 * Uses the $SITE_GUARD_KEY shell variable so the snippet works
 * directly in a terminal once the env var is set.
 * siteId is intentionally omitted — the site key already encodes the site.
 */
export function buildSiteGuardCurlSnippet(): string {
  return `curl -i ${SITE_GUARD_API_URL} \\
  -H "Authorization: Bearer $SITE_GUARD_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "/docs/getting-started",
    "userAgent": "ExampleBot/1.0",
    "agentIdentifier": "crawler_alpha"
  }'`;
}

/**
 * Returns a Next.js middleware.ts snippet.
 * - Server-side only — reads process.env.SITE_GUARD_KEY, never the browser.
 * - Fails closed (403) on network error or non-2xx response.
 * - Does not include siteId in the body.
 */
export function buildSiteGuardNextjsSnippet(): string {
  return `// middleware.ts — place at the project root, not inside app/
// Server-side only. Never import from a Client Component.
import { NextResponse, type NextRequest } from "next/server";

const GUARDED_PREFIXES = ["/docs", "/admin"];
const STATIC_RE = /\\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|mjs|map|woff|woff2|ttf|eot)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always bypass Next.js internals and static assets.
  if (pathname.startsWith("/_next/") || STATIC_RE.test(pathname)) {
    return NextResponse.next();
  }

  // Only check the configured protected prefixes.
  if (!GUARDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let decision: { allowed: boolean; reason?: string };
  try {
    const r = await fetch(
      \`\${process.env.BEHALFID_BASE_URL ?? "https://www.behalfid.com"}/api/site-guard/check\`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Server-side only — never expose SITE_GUARD_KEY to the browser.
          Authorization: \`Bearer \${process.env.SITE_GUARD_KEY}\`,
        },
        body: JSON.stringify({
          path: pathname,
          userAgent: request.headers.get("user-agent") ?? "unknown",
          agentIdentifier: request.headers.get("behalfid-agent") ?? undefined,
          // no siteId — the site key already encodes the site scope
        }),
      },
    );
    // Fail closed on non-2xx.
    if (!r.ok) return new NextResponse("Site Guard unavailable.", { status: 403 });
    decision = await r.json() as { allowed: boolean; reason?: string };
  } catch {
    // Fail closed on network error.
    return new NextResponse("Site Guard unavailable.", { status: 403 });
  }

  if (!decision.allowed) {
    return new NextResponse(decision.reason ?? "Denied by Site Guard.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/docs/:path*", "/admin/:path*"],
};`;
}

/**
 * Returns an Express middleware factory snippet.
 * - Server-side only — reads process.env.SITE_GUARD_KEY.
 * - Fails closed (403) on network error or non-2xx response.
 * - Does not include siteId in the body.
 */
export function buildSiteGuardExpressSnippet(): string {
  return `// src/siteGuard.ts — server-side only
import type { Request, Response, NextFunction } from "express";

export function siteGuard() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = process.env.SITE_GUARD_KEY;
    // Fail closed — cannot verify without a key.
    if (!key) {
      res.status(403).send("SITE_GUARD_KEY not configured."); return;
    }

    let decision: { allowed: boolean; reason?: string };
    try {
      const r = await fetch(
        \`\${process.env.BEHALFID_BASE_URL ?? "https://www.behalfid.com"}/api/site-guard/check\`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: \`Bearer \${key}\`,
          },
          body: JSON.stringify({
            path: req.path,
            userAgent: req.headers["user-agent"] ?? "unknown",
            agentIdentifier: req.headers["behalfid-agent"] as string | undefined,
            // no siteId — the site key already encodes the site scope
          }),
        },
      );
      if (!r.ok) { res.status(403).send("Site Guard error."); return; }
      decision = await r.json() as { allowed: boolean; reason?: string };
    } catch {
      res.status(403).send("Site Guard unavailable."); return;
    }

    if (!decision.allowed) {
      res.status(403).send(decision.reason ?? "Denied by Site Guard."); return;
    }
    next(); // allowed — route handler runs
  };
}

// Usage:
// app.use("/docs", siteGuard(), docsHandler);
// app.use("/admin", siteGuard(), adminHandler);`;
}
