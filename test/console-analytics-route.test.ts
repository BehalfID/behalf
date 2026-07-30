import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireConsoleApi: vi.fn(),
  getAdminAnalytics: vi.fn()
}));

vi.mock("@/lib/adminAuth", () => ({
  requireConsoleApi: mocks.requireConsoleApi
}));

vi.mock("@/lib/adminAnalytics", () => ({
  getAdminAnalytics: mocks.getAdminAnalytics
}));

function request(path: string) {
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url), { nextUrl: url }) as never;
}

const samplePayload = {
  asOf: "2026-07-30T15:42:00.000Z",
  freshness: { latestVerificationAt: null, lagSeconds: null },
  range: {
    interval: "7d" as const,
    start: "2026-07-24T00:00:00.000Z",
    end: "2026-07-31T00:00:00.000Z",
    granularity: "day" as const,
    timezone: "UTC" as const,
    seriesStart: "2026-07-24T00:00:00.000Z",
    seriesEnd: "2026-07-31T00:00:00.000Z",
    seriesTruncated: false,
    bucketCount: 7
  },
  scope: { accountId: null },
  partial: false,
  partialReasons: [],
  definitions: {},
  summary: {
    users: { total: 0, new: 0 },
    workspaces: { total: 0, new: 0 },
    agents: { total: 0, new: 0, activeConfigured: 0, activeInPeriod: 0 },
    verifications: {
      attempts: 0,
      enforced: 0,
      allowed: 0,
      denied: 0,
      approvalRequired: 0,
      indeterminate: 0,
      shadow: 0,
      highRisk: 0,
      uniqueAgents: 0,
      uniqueWorkspaces: 0,
      rates: {
        allowed: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.enforced", value: null },
        denied: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.enforced", value: null },
        approvalRequired: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.enforced", value: null },
        indeterminate: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.enforced", value: null },
        shadowShare: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.attempts", value: null },
        highRisk: { numerator: 0, denominator: 0, denominatorField: "summary.verifications.enforced", value: null }
      }
    },
    approvals: {
      createdInPeriod: 0,
      approvedInPeriod: 0,
      deniedInPeriod: 0,
      usedInPeriod: 0,
      pendingNow: 0
    }
  },
  timeseries: {
    verifications: [],
    activeAgents: [],
    signups: [],
    workspacesCreated: [],
    agentsCreated: []
  },
  breakdowns: {
    outcomes: [],
    topWorkspaces: [],
    topAgents: [],
    providerAdoption: { sources: [], methods: [], workspaceSso: { googleEnabled: 0, googleEnforced: 0 }, declaredWithoutUsers: [] }
  }
};

describe("GET /api/console/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireConsoleApi.mockResolvedValue(null);
    mocks.getAdminAnalytics.mockResolvedValue({ ok: true, payload: samplePayload });
  });

  it("requires a console session", async () => {
    mocks.requireConsoleApi.mockResolvedValue(
      Response.json({ error: "Console authentication required." }, { status: 401 })
    );

    const { GET } = await import("@/app/api/console/analytics/route");
    const response = await GET(request("/api/console/analytics"));

    expect(response.status).toBe(401);
    expect(mocks.getAdminAnalytics).not.toHaveBeenCalled();
  });

  it("returns analytics with private no-store caching", async () => {
    const { GET } = await import("@/app/api/console/analytics/route");
    const response = await GET(request("/api/console/analytics?interval=7d"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(await response.json()).toEqual(samplePayload);
    expect(mocks.getAdminAnalytics).toHaveBeenCalledWith({
      interval: "7d",
      from: null,
      to: null,
      accountId: null
    });
  });

  it("forwards custom ranges and workspace drill-down", async () => {
    const { GET } = await import("@/app/api/console/analytics/route");
    await GET(
      request(
        "/api/console/analytics?interval=custom&from=2026-07-01&to=2026-07-07&accountId=acct_demo"
      )
    );

    expect(mocks.getAdminAnalytics).toHaveBeenCalledWith({
      interval: "custom",
      from: "2026-07-01",
      to: "2026-07-07",
      accountId: "acct_demo"
    });
  });

  it("maps validation failures to 400", async () => {
    mocks.getAdminAnalytics.mockResolvedValue({
      ok: false,
      code: "range_too_large",
      message: "Custom ranges are limited to 400 days."
    });

    const { GET } = await import("@/app/api/console/analytics/route");
    const response = await GET(request("/api/console/analytics?interval=custom&from=2020-01-01&to=2026-07-30"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("range_too_large");
  });

  it("rejects malformed accountId filters", async () => {
    const { GET } = await import("@/app/api/console/analytics/route");
    const response = await GET(request("/api/console/analytics?accountId=bad%20id"));

    expect(response.status).toBe(400);
    expect(mocks.getAdminAnalytics).not.toHaveBeenCalled();
  });
});
