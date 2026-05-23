import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireConsoleApi: vi.fn(),
  getConsoleAccountId: vi.fn(),
  logFind: vi.fn(),
  logCountDocuments: vi.fn(),
  agentFind: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi
}));
vi.mock("@/lib/adminAuth", () => ({
  requireConsoleApi: routeMocks.requireConsoleApi
}));
vi.mock("@/lib/consoleData", () => ({
  getConsoleAccountId: routeMocks.getConsoleAccountId
}));
vi.mock("@/models/VerificationLog", () => ({
  default: {
    find: routeMocks.logFind,
    countDocuments: routeMocks.logCountDocuments,
    // Aggregation pipeline used by getVerificationLogSummaryAgg in the dashboard logs route.
    aggregate: vi.fn().mockResolvedValue([{
      stats: [{ total: 2, allowed: 0, denied: 2, highRisk: 1, approvalRequired: 1 }],
      deniedActions: [{ _id: "purchase", count: 1 }],
      topVendors: [{ _id: "stripe.com", count: 2 }]
    }])
  }
}));
vi.mock("@/models/Agent", () => ({
  default: {
    find: routeMocks.agentFind
  }
}));

function findChain<T>(rows: T[]) {
  const chain = {
    sort: vi.fn(() => chain),
    skip: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    select: vi.fn(() => chain),
    lean: vi.fn(async () => rows)
  };
  return chain;
}

function request(path: string) {
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url), { nextUrl: url }) as never;
}

const logs = [
  {
    requestId: "req_denied",
    accountId: "acct_test",
    developerUserId: "dev_test",
    agentId: "agent_test",
    permissionId: null,
    action: "purchase",
    amount: 900,
    vendor: "stripe.com",
    allowed: false,
    reason: "Amount exceeds maxAmount constraint.",
    risk: "high" as const,
    createdAt: new Date("2026-05-18T00:00:00.000Z")
  },
  {
    requestId: "req_approval",
    accountId: "acct_test",
    developerUserId: "dev_test",
    agentId: "agent_test",
    permissionId: "perm_test",
    action: "renew_subscription",
    vendor: "stripe.com",
    allowed: false,
    reason: "Permission requires approval before execution.",
    risk: "medium" as const,
    createdAt: new Date("2026-05-18T01:00:00.000Z")
  }
];

describe("verification log helpers", () => {
  it("builds scoped filters and clamps pagination", async () => {
    const {
      buildVerificationLogQuery,
      parseLogListParams
    } = await import("@/lib/verificationLogs");
    const params = new URLSearchParams("agentId=agent_test&allowed=false&action=purchase&risk=high&resource=stripe.com&requestId=req_denied&from=2026-05-01&to=2026-05-31&limit=999&page=2");

    const query = buildVerificationLogQuery(params, { developerUserId: "dev_test" }, { retentionStart: new Date("2026-05-10T00:00:00.000Z") });
    const pagination = parseLogListParams(params);

    expect(query).toMatchObject({
      developerUserId: "dev_test",
      agentId: "agent_test",
      allowed: false,
      action: "purchase",
      risk: "high",
      vendor: "stripe.com",
      requestId: "req_denied"
    });
    expect(query.createdAt).toEqual({
      $gte: new Date("2026-05-10T00:00:00.000Z"),
      $lte: new Date("2026-05-31T00:00:00.000Z")
    });
    expect(pagination).toEqual({ limit: 500, page: 2, skip: 500, format: "json" });
  });

  it("does not let query agent filters override a fixed route scope", async () => {
    const { buildVerificationLogQuery } = await import("@/lib/verificationLogs");

    const query = buildVerificationLogQuery(
      new URLSearchParams("agentId=agent_other&agent=agent_other"),
      { agentId: "agent_authenticated" }
    );

    expect(query.agentId).toBe("agent_authenticated");
  });

  it("calculates summary stats and redacts exports", async () => {
    const {
      calculateVerificationLogSummary,
      logsToCsv,
      sanitizeVerificationLog
    } = await import("@/lib/verificationLogs");
    const unsafe = sanitizeVerificationLog({
      ...logs[0],
      reason: "Bearer bhf_sk_super_secret_value was denied",
      vendor: "whsec_super_secret_value"
    });
    const summary = calculateVerificationLogSummary(logs);
    const csv = logsToCsv([unsafe]);

    expect(summary).toMatchObject({
      total: 2,
      allowed: 0,
      denied: 2,
      highRisk: 1,
      approvalRequired: 1,
      topDeniedAction: "purchase",
      topVendor: "stripe.com"
    });
    expect(csv).not.toContain("bhf_sk_super_secret_value");
    expect(csv).not.toContain("whsec_super_secret_value");
    expect(csv).toContain("Bearer [redacted]");
  });
});

describe("dashboard verification log route", () => {
  beforeEach(() => {
    vi.resetModules();
    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test" },
      account: { plan: "pro" },
      error: null
    });
    routeMocks.requireConsoleApi.mockResolvedValue(null);
    routeMocks.getConsoleAccountId.mockResolvedValue("acct_test");
    routeMocks.logCountDocuments.mockResolvedValue(2);
    routeMocks.agentFind.mockReturnValue(findChain([{ agentId: "agent_test", name: "Checkout Agent" }]));
  });

  it("filters denied dashboard logs without crossing developer scope", async () => {
    // Only one logFind call — the summary now uses VerificationLog.aggregate.
    routeMocks.logFind.mockReturnValueOnce(findChain([logs[0]]));
    const { GET } = await import("@/app/api/dashboard/logs/route");

    const response = await GET(request("/api/dashboard/logs?allowed=false&agentId=agent_test&action=purchase&risk=high&from=2026-05-01&to=2026-05-31&limit=1&page=2"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.logFind).toHaveBeenCalledWith(expect.objectContaining({
      developerUserId: "dev_test",
      agentId: "agent_test",
      allowed: false,
      action: "purchase",
      risk: "high"
    }));
    expect(routeMocks.logFind.mock.calls[0][0]).not.toHaveProperty("accountId");
    expect(json.logs[0]).toMatchObject({
      agentName: "Checkout Agent",
      allowed: false,
      action: "purchase"
    });
    expect(json.pagination).toEqual({ limit: 1, page: 2, total: 2, hasMore: false });
  });

  it("exports CSV without raw secrets", async () => {
    // Only one logFind call — the summary now uses VerificationLog.aggregate.
    routeMocks.logFind.mockReturnValueOnce(findChain([{ ...logs[0], reason: "Bearer bhf_sk_super_secret_value" }]));
    const { GET } = await import("@/app/api/dashboard/logs/route");

    const response = await GET(request("/api/dashboard/logs?format=csv"));
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(text).not.toContain("bhf_sk_super_secret_value");
    expect(text).toContain("Bearer [redacted]");
  });
});

describe("console verification log route", () => {
  beforeEach(() => {
    vi.resetModules();
    routeMocks.requireConsoleApi.mockResolvedValue(null);
    routeMocks.getConsoleAccountId.mockResolvedValue("acct_console");
    routeMocks.logCountDocuments.mockResolvedValue(1);
    routeMocks.agentFind.mockReturnValue(findChain([{ agentId: "agent_admin", name: "Admin Agent" }]));
  });

  it("uses account-scoped admin filters including request id and pagination", async () => {
    routeMocks.logFind
      .mockReturnValueOnce(findChain([{ ...logs[0], agentId: "agent_admin", accountId: "acct_console" }]))
      .mockReturnValueOnce(findChain(logs));
    const { GET } = await import("@/app/api/console/logs/route");

    const response = await GET(request("/api/console/logs?agent=agent_admin&requestId=req_denied&limit=25&page=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.logFind).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "acct_console",
      agentId: "agent_admin",
      requestId: "req_denied"
    }));
    expect(json.logs[0]).toMatchObject({ accountId: "acct_console", agentName: "Admin Agent" });
    expect(json.summary.denied).toBe(2);
  });
});
