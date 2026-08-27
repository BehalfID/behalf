import { beforeEach, describe, expect, it, vi } from "vitest";
import config from "../next.config";
import {
  PRIVATE_NO_STORE,
  PUBLIC_BRAND_ASSET_CACHE,
  PUBLIC_BRAND_ASSET_PATHS,
  PUBLIC_INSTALLER_CACHE,
  PUBLIC_METADATA_CACHE,
  PUBLIC_STATUS_CACHE
} from "@/lib/cachePolicy";
import { jsonError, noCacheJson } from "@/lib/responses";

const statusMocks = vi.hoisted(() => ({
  listComponents: vi.fn(async () => []),
  listIncidents: vi.fn(async () => [])
}));

vi.mock("@/lib/repositories/status", () => ({
  listComponents: statusMocks.listComponents,
  listIncidents: statusMocks.listIncidents
}));

function cacheControlFor(
  rules: Awaited<ReturnType<NonNullable<typeof config.headers>>>,
  source: string
) {
  return rules
    .find((rule) => rule.source === source)
    ?.headers.find((header) => header.key === "Cache-Control")?.value;
}

function matchingHeaderValue(
  rules: Awaited<ReturnType<NonNullable<typeof config.headers>>>,
  sources: string[],
  key: string
) {
  return rules
    .filter((rule) => sources.includes(rule.source))
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key === key)
    .at(-1)?.value;
}

describe("cache policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusMocks.listComponents.mockResolvedValue([]);
    statusMocks.listIncidents.mockResolvedValue([]);
  });

  it("sets no-store on private JSON and every JSON error", () => {
    expect(noCacheJson({ ok: true }).headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
    expect(jsonError("Nope", 403).headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
  });

  it("configures bounded caching only for tenant-neutral public files", async () => {
    const rules = await config.headers!();

    expect(cacheControlFor(rules, "/robots.txt")).toBe(PUBLIC_METADATA_CACHE);
    expect(cacheControlFor(rules, "/sitemap.xml")).toBe(PUBLIC_METADATA_CACHE);
    expect(cacheControlFor(rules, "/llms.txt")).toBe(PUBLIC_METADATA_CACHE);
    expect(cacheControlFor(rules, "/.well-known/atproto-did")).toBe(PUBLIC_METADATA_CACHE);
    expect(cacheControlFor(rules, "/install.sh")).toBe(PUBLIC_INSTALLER_CACHE);
    for (const source of PUBLIC_BRAND_ASSET_PATHS) {
      expect(cacheControlFor(rules, source)).toBe(PUBLIC_BRAND_ASSET_CACHE);
    }
  });

  it("configures authenticated HTML as private and never shared", async () => {
    const rules = await config.headers!();

    for (const source of [
      "/dashboard",
      "/dashboard/:path*",
      "/console",
      "/console/:path*",
      "/workspace/:workspaceSlug/dashboard/:path*",
      "/:workspaceSlug/dashboard/:path*"
    ]) {
      expect(cacheControlFor(rules, source)).toBe(PRIVATE_NO_STORE);
    }
    expect(PUBLIC_STATUS_CACHE).toBe("public, max-age=0, s-maxage=15");
  });

  it("overrides referrer policy only for the Orchestra authorization handoff", async () => {
    const rules = await config.headers!();

    expect(matchingHeaderValue(rules, ["/(.*)"], "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(
      matchingHeaderValue(
        rules,
        ["/(.*)", "/console/orchestra/authorize"],
        "Referrer-Policy"
      )
    ).toBe("no-referrer");
  });

  it("keeps health private while caching only successful public status reads", async () => {
    const { GET: getHealth } = await import("@/app/api/health/route");
    const health = await getHealth();
    expect(health.headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);

    const { GET: getStatus } = await import("@/app/api/status/route");
    const status = await getStatus();
    expect(status.headers.get("Cache-Control")).toBe(PUBLIC_STATUS_CACHE);

    statusMocks.listComponents.mockRejectedValueOnce(new Error("database unavailable"));
    const fallback = await getStatus();
    expect(fallback.headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
  });
});
