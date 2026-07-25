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
  connectToDatabase: vi.fn(),
  componentFind: vi.fn(),
  incidentFind: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: statusMocks.connectToDatabase }));
vi.mock("@/models/StatusComponent", () => ({
  default: { find: statusMocks.componentFind }
}));
vi.mock("@/models/StatusIncident", () => ({
  default: { find: statusMocks.incidentFind }
}));

function cacheControlFor(
  rules: Awaited<ReturnType<NonNullable<typeof config.headers>>>,
  source: string
) {
  return rules
    .find((rule) => rule.source === source)
    ?.headers.find((header) => header.key === "Cache-Control")?.value;
}

describe("cache policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusMocks.connectToDatabase.mockResolvedValue(undefined);
    statusMocks.componentFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      })
    });
    statusMocks.incidentFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
        })
      })
    });
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

  it("keeps health private while caching only successful public status reads", async () => {
    const { GET: getHealth } = await import("@/app/api/health/route");
    const health = await getHealth();
    expect(health.headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);

    const { GET: getStatus } = await import("@/app/api/status/route");
    const status = await getStatus();
    expect(status.headers.get("Cache-Control")).toBe(PUBLIC_STATUS_CACHE);

    statusMocks.connectToDatabase.mockRejectedValueOnce(new Error("database unavailable"));
    const fallback = await getStatus();
    expect(fallback.headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
  });
});
