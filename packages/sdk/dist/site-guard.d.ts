import type { SiteGuardCheckInput, SiteGuardCheckResult } from "./types.js";
type RequestFn = <T>(path: string, options?: {
    method?: string;
    body?: unknown;
}) => Promise<T>;
/**
 * Site Guard methods exposed as `behalf.siteGuard.*`.
 *
 * Instantiated internally by the {@link BehalfID} client. Do not construct
 * this class directly — use `new BehalfID({ apiKey })` instead.
 */
export declare class SiteGuardNamespace {
    private readonly _request;
    /** @internal */
    constructor(request: RequestFn);
    /**
     * Check whether a path may be served to the current request.
     *
     * Uses `Authorization: Bearer <apiKey>` — pass a `bhf_site_...` key to
     * avoid sending `siteId` in the body (the key already encodes the site).
     *
     * **Always fail closed**: if this call throws or returns
     * `{ allowed: false }`, do **not** serve the route.
     *
     * @example
     * ```ts
     * const decision = await behalf.siteGuard.check({
     *   path: "/docs/getting-started",
     *   userAgent: req.headers.get("user-agent") ?? undefined,
     *   agentIdentifier: "crawler_alpha",
     * });
     *
     * if (!decision.allowed) {
     *   return new Response("Blocked", { status: 403 });
     * }
     * ```
     */
    check(input: SiteGuardCheckInput): Promise<SiteGuardCheckResult>;
}
export {};
