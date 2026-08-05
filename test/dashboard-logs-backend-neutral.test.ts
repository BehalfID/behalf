/**
 * Regression for the production decision-history 500:
 *   TypeError: findLogs(...).lean is not a function
 *
 * The route consumed the repository result with a Mongo-only query method.
 * The Mongo adapter returns a thenable query that has `.lean()`; the Postgres
 * adapter returns a plain Promise of an array, which does not. These tests pin
 * that the route awaits the result directly and that BOTH real adapter
 * contracts satisfy that consumption pattern.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { thenableQuery } from "@/lib/repositories/mongoModelAdapter";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

const ROUTE = "app/api/dashboard/logs/route.ts";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  findLogs: vi.fn(),
  countLogs: vi.fn(),
  getVerificationLogSummaryAgg: vi.fn(),
  withAgentNames: vi.fn(),
  withApprovalLinks: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: vi.fn()
}));
vi.mock("@/lib/delegatedAuth", () => ({ getWorkspaceActor: mocks.getWorkspaceActor }));
vi.mock("@/lib/verificationLogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verificationLogs")>();
  return {
    ...actual,
    getVerificationLogSummaryAgg: mocks.getVerificationLogSummaryAgg,
    withAgentNames: mocks.withAgentNames,
    withApprovalLinks: mocks.withApprovalLinks
  };
});
vi.mock("@/lib/repositories/verificationLogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/verificationLogs")>();
  return { ...actual, findLogs: mocks.findLogs, countLogs: mocks.countLogs };
});

describe("route consumes the repository backend-neutrally", () => {
  it("does not call .lean() (or any Mongo query method) on the result", () => {
    // Strip comments so the explanatory note about `.lean()` is not matched.
    const code = source(ROUTE)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.lean\s*[<(]/);
    expect(code).not.toMatch(/\.select\s*\(/);
    expect(code).not.toMatch(/\.sort\s*\(/);
    expect(code).not.toMatch(/\.limit\s*\(/);
    expect(code).not.toMatch(/\.skip\s*\(/);
  });

  it("keeps sort/limit/skip/select inside the options argument", () => {
    const code = source(ROUTE);
    expect(code).toContain("sort: { createdAt: -1 }");
    expect(code).toContain("limit: limit");
    expect(code).toContain("skip: skip");
    expect(code).toContain("select:");
    // The projection the UI/CSV depend on must survive.
    for (const field of [
      "requestId",
      "agentId",
      "permissionId",
      "action",
      "allowed",
      "approvalRequired",
      "reason",
      "risk",
      "shadow",
      "metadata",
      "createdAt"
    ]) {
      expect(code).toContain(field);
    }
  });

  it("does not duplicate filtering logic in the route", () => {
    const code = source(ROUTE);
    expect(code).toContain("buildVerificationLogQuery");
  });
});

describe("adapter contracts support direct await", () => {
  it("Mongo: a thenable query resolves to the lean rows when awaited", async () => {
    // Built from the real helper the Mongo adapter uses, not a hand-made stub.
    const rows = [{ requestId: "req_1", agentId: "agent_1" }];
    const chainable = {
      lean: () => Promise.resolve(rows),
      select: vi.fn(),
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn()
    } as never;

    const query = thenableQuery<typeof rows>(chainable);
    // The production bug was assuming `.lean()` exists; both must agree.
    expect(typeof query.lean).toBe("function");
    await expect(Promise.resolve(query)).resolves.toEqual(rows);
    await expect(query.lean()).resolves.toEqual(rows);
    expect(await query).toEqual(await query.lean());
  });

  it("Postgres: findLogs is declared async, so it returns a Promise of rows", () => {
    const adapter = source("lib/repositories/postgres/verificationLogs.ts");
    expect(adapter).toMatch(/export async function findLogs\s*\(/);
    // It must honour the same options the route passes.
    expect(adapter).toContain("options.sort ?? { createdAt: -1 }");
    expect(adapter).toContain("options.skip");
    expect(adapter).toContain("options.limit");
    expect(adapter).toContain("options.select");
    // And it must not expose a Mongo-style query object.
    expect(adapter).not.toMatch(/return\s+thenableQuery/);
  });

  it("Mongo adapter forwards the same options", () => {
    const adapter = source("lib/repositories/mongo/verificationLogs.ts");
    expect(adapter).toMatch(/export function findLogs\s*\(/);
    expect(adapter).toContain("sort: options.sort ?? { createdAt: -1 }");
  });
});

describe("GET /api/dashboard/logs behaviour", () => {
  const ACTOR = { userId: "user_1", accountId: "acct_1", role: "OWNER", authorityLevel: 3 };
  const ROW = {
    requestId: "req_1",
    agentId: "agent_1",
    action: "deploy",
    allowed: false,
    approvalRequired: true,
    reason: "production requires approval",
    risk: "high",
    shadow: false,
    metadata: { environment: "production" },
    createdAt: new Date("2026-01-01T00:00:00Z")
  };

  function req(url = "https://app.behalfid.com/api/dashboard/logs") {
    return { nextUrl: new URL(url) } as never;
  }

  async function load() {
    vi.clearAllMocks();
    mocks.requireDeveloperApi.mockResolvedValue({
      error: null,
      user: { userId: "user_1" },
      activeAccountId: "acct_1",
      account: { plan: "pro" }
    });
    mocks.getWorkspaceActor.mockResolvedValue(ACTOR);
    mocks.getVerificationLogSummaryAgg.mockResolvedValue(null);
    mocks.withAgentNames.mockImplementation(async (rows: unknown) => rows);
    mocks.withApprovalLinks.mockImplementation(async (rows: unknown) => rows);
    return (await import("@/app/api/dashboard/logs/route")).GET;
  }

  it("returns 200 with empty logs (Postgres-style Promise of [])", async () => {
    const GET = await load();
    mocks.findLogs.mockResolvedValue([]);
    mocks.countLogs.mockResolvedValue(0);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).logs).toEqual([]);
  });

  it("returns 200 with pagination for populated logs (Postgres-style)", async () => {
    const GET = await load();
    mocks.findLogs.mockResolvedValue([ROW]);
    mocks.countLogs.mockResolvedValue(1);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.pagination).toMatchObject({ page: 1, total: 1, hasMore: false });
  });

  it("works when the adapter returns a Mongo thenable query", async () => {
    const GET = await load();
    mocks.findLogs.mockImplementation(() =>
      thenableQuery<Array<typeof ROW>>({ lean: () => Promise.resolve([ROW]) } as never)
    );
    mocks.countLogs.mockResolvedValue(1);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).logs).toHaveLength(1);
  });

  it("forwards sort, limit, skip and select to the repository", async () => {
    const GET = await load();
    mocks.findLogs.mockResolvedValue([]);
    mocks.countLogs.mockResolvedValue(0);
    await GET(req("https://app.behalfid.com/api/dashboard/logs?limit=25&page=3"));
    const [, options] = mocks.findLogs.mock.calls[0];
    expect(options.sort).toEqual({ createdAt: -1 });
    expect(options.limit).toBe(25);
    expect(options.skip).toBe(50);
    expect(typeof options.select).toBe("string");
    expect(options.select).toContain("requestId");
  });

  it("still runs enrichment", async () => {
    const GET = await load();
    mocks.findLogs.mockResolvedValue([ROW]);
    mocks.countLogs.mockResolvedValue(1);
    await GET(req());
    expect(mocks.withAgentNames).toHaveBeenCalled();
    expect(mocks.withApprovalLinks).toHaveBeenCalled();
  });

  it("still exports CSV", async () => {
    const GET = await load();
    mocks.findLogs.mockResolvedValue([ROW]);
    mocks.countLogs.mockResolvedValue(1);
    const res = await GET(req("https://app.behalfid.com/api/dashboard/logs?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(await res.text()).toContain("req_1");
  });

  it("keeps the structured safe 500 from PR #175 on repository failure", async () => {
    const GET = await load();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findLogs.mockRejectedValue(
      Object.assign(new TypeError("findLogs(...).lean is not a function"), { code: "42P01" })
    );
    mocks.countLogs.mockResolvedValue(0);

    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
    expect(body.error).not.toContain("lean is not a function");
    expect(JSON.stringify(spy.mock.calls[0])).toContain("dashboard.logs.list");
    spy.mockRestore();
  });
});
