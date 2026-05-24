import type { SiteGuardCheckInput, SiteGuardCheckResult } from "./types.js";

type RequestFn = <T>(
  path: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>;

/**
 * Site Guard methods exposed as `behalf.siteGuard.*`.
 *
 * Instantiated internally by the {@link BehalfID} client. Do not construct
 * this class directly — use `new BehalfID({ apiKey })` instead.
 */
export class SiteGuardNamespace {
  private readonly _request: RequestFn;

  /** @internal */
  constructor(request: RequestFn) {
    this._request = request;
  }

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
  check(input: SiteGuardCheckInput): Promise<SiteGuardCheckResult> {
    if (!input?.path || typeof input.path !== "string") {
      throw new Error("BehalfID: siteGuard.check requires a non-empty path string.");
    }

    const body: Record<string, unknown> = { path: input.path };
    if (input.userAgent !== undefined) body["userAgent"] = input.userAgent;
    if (input.agentIdentifier !== undefined) body["agentIdentifier"] = input.agentIdentifier;
    if (input.metadata !== undefined) body["metadata"] = input.metadata;
    // NOTE: siteId is intentionally omitted for the site-key flow.
    // The key itself encodes the site and a body siteId cannot override it.

    return this._request<SiteGuardCheckResult>("/api/site-guard/check", {
      method: "POST",
      body
    });
  }
}
