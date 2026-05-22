/**
 * BehalfID Site Guard middleware for Express.
 *
 * Server-side only. SITE_GUARD_KEY must be kept in an environment secret
 * and must never be sent to the browser or included in any client response.
 */
import type { Request, Response, NextFunction } from "express";
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
export declare function checkSiteGuardAccess(input: SiteGuardInput): Promise<SiteGuardDecision>;
/**
 * Express middleware factory that enforces Site Guard before the route handler.
 *
 * Usage:
 *   router.use("/docs", siteGuard(), docsHandler);
 *   router.use("/admin", siteGuard(), adminHandler);
 *
 * On allow  → calls next() so the route handler runs.
 * On deny   → responds 403 and does NOT call next().
 * On error  → responds 403 (fail closed) and does NOT call next().
 */
export declare function siteGuard(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
