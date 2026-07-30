import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  verificationAggregate: vi.fn(),
  verificationFindOne: vi.fn(),
  developerUserAggregate: vi.fn(),
  developerUserCount: vi.fn(),
  accountCount: vi.fn(),
  accountFind: vi.fn(),
  agentCount: vi.fn(),
  agentFind: vi.fn(),
  approvalCount: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: mocks.connectToDatabase
}));

function findOneChain<T>(value: T | null) {
  return {
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value)
  };
}

function findChain<T>(rows: T[]) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows)
  };
}

vi.mock("@/models/VerificationLog", () => ({
  default: {
    aggregate: mocks.verificationAggregate,
    findOne: mocks.verificationFindOne
  }
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: {
    aggregate: mocks.developerUserAggregate,
    countDocuments: mocks.developerUserCount
  },
  AUTH_PROVIDERS: ["password", "google"]
}));

vi.mock("@/models/Account", () => ({
  default: {
    countDocuments: mocks.accountCount,
    find: mocks.accountFind
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    countDocuments: mocks.agentCount,
    find: mocks.agentFind
  }
}));

vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    countDocuments: mocks.approvalCount
  }
}));

vi.mock("@/models/ExternalIdentity", () => ({
  default: { collection: { name: "externalidentities" } },
  EXTERNAL_IDENTITY_PROVIDERS: ["github", "google"]
}));

const FIXED_NOW = new Date("2026-07-30T15:42:00.000Z");

function emptyFacet() {
  return {
    outcomes: [{}],
    uniqueAgents: [{ value: 0 }],
    uniqueWorkspaces: [{ value: 0 }],
    topWorkspaces: [],
    topAgents: []
  };
}

function outcomeFacet(overrides: Record<string, number>) {
  return {
    outcomes: [
      {
        attempts: 0,
        enforced: 0,
        allowed: 0,
        denied: 0,
        approvalRequired: 0,
        indeterminate: 0,
        shadow: 0,
        highRisk: 0,
        ...overrides
      }
    ],
    uniqueAgents: [{ value: overrides.uniqueAgents ?? 0 }],
    uniqueWorkspaces: [{ value: overrides.uniqueWorkspaces ?? 0 }],
    topWorkspaces: [],
    topAgents: []
  };
}

describe("admin analytics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.verificationFindOne.mockReturnValue(findOneChain(null));
    mocks.developerUserCount.mockResolvedValue(0);
    mocks.accountCount.mockResolvedValue(0);
    mocks.agentCount.mockResolvedValue(0);
    mocks.approvalCount.mockResolvedValue(0);
    mocks.accountFind.mockReturnValue(findChain([]));
    mocks.agentFind.mockReturnValue(findChain([]));
    mocks.developerUserAggregate.mockResolvedValue([]);
    mocks.verificationAggregate.mockImplementation(async (pipeline: unknown[]) => {
      const facetStage = pipeline.find(
        (stage) => typeof stage === "object" && stage !== null && "$facet" in stage
      ) as { $facet?: Record<string, unknown[]> } | undefined;
      if (facetStage?.$facet) {
        return [emptyFacet()];
      }
      return [];
    });
  });

  it("computes rates over enforced attempts and nulls when the denominator is zero", async () => {
    mocks.verificationAggregate.mockImplementation(async (pipeline: unknown[]) => {
      const facetStage = pipeline.find(
        (stage) => typeof stage === "object" && stage !== null && "$facet" in stage
      ) as { $facet?: Record<string, unknown[]> } | undefined;
      if (facetStage?.$facet) {
        return [
          outcomeFacet({
            attempts: 12,
            enforced: 10,
            allowed: 7,
            denied: 1,
            approvalRequired: 2,
            indeterminate: 0,
            shadow: 2,
            highRisk: 1
          })
        ];
      }
      return [];
    });

    const { getAdminAnalytics } = await import("@/lib/adminAnalytics");
    const result = await getAdminAnalytics({ interval: "7d", now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { verifications } = result.payload.summary;
    expect(verifications.allowed + verifications.denied + verifications.approvalRequired + verifications.indeterminate).toBe(
      verifications.enforced
    );
    expect(verifications.enforced + verifications.shadow).toBe(verifications.attempts);
    expect(verifications.rates.allowed).toEqual({
      numerator: 7,
      denominator: 10,
      denominatorField: "summary.verifications.enforced",
      value: 0.7
    });
    expect(verifications.rates.denied.value).toBe(0.1);
    expect(verifications.rates.approvalRequired.value).toBe(0.2);
    expect(verifications.rates.shadowShare).toEqual({
      numerator: 2,
      denominator: 12,
      denominatorField: "summary.verifications.attempts",
      value: expect.closeTo(2 / 12, 6)
    });
  });

  it("flags partial data when the newest bucket is still filling", async () => {
    const { getAdminAnalytics } = await import("@/lib/adminAnalytics");
    const result = await getAdminAnalytics({ interval: "7d", now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.partial).toBe(true);
    expect(result.payload.partialReasons).toContain("newest_bucket_incomplete");
    expect(result.payload.asOf).toBe(FIXED_NOW.toISOString());
  });

  it("returns validation errors for unsupported intervals", async () => {
    const { getAdminAnalytics } = await import("@/lib/adminAnalytics");
    const result = await getAdminAnalytics({ interval: "weekly" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_interval");
  });
});

describe("verification outcome rollups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes aggregate rows through getVerificationOutcomeTotals", async () => {
    mocks.verificationAggregate.mockResolvedValue([
      {
        attempts: 5,
        enforced: 4,
        allowed: 2,
        denied: 1,
        approvalRequired: 1,
        indeterminate: 0,
        shadow: 1,
        highRisk: 0
      }
    ]);

    const { getVerificationOutcomeTotals } = await import("@/lib/adminAnalytics");
    const totals = await getVerificationOutcomeTotals({
      start: new Date("2026-07-30T00:00:00.000Z"),
      end: new Date("2026-07-31T00:00:00.000Z")
    });

    expect(totals).toEqual({
      attempts: 5,
      enforced: 4,
      allowed: 2,
      denied: 1,
      approvalRequired: 1,
      indeterminate: 0,
      shadow: 1,
      highRisk: 0
    });
  });

  it("returns null when aggregation fails", async () => {
    mocks.verificationAggregate.mockRejectedValue(new Error("db unavailable"));

    const { getVerificationOutcomeTotals } = await import("@/lib/adminAnalytics");
    const totals = await getVerificationOutcomeTotals({
      start: new Date("2026-07-30T00:00:00.000Z"),
      end: new Date("2026-07-31T00:00:00.000Z")
    });

    expect(totals).toBeNull();
  });
});
