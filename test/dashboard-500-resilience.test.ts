/**
 * Regression coverage for the production dashboard 500s.
 *
 * "Agents could not be loaded" / "Decision history could not be loaded" with
 * "Request failed with 500" means the client fell back to its generic message
 * because the response carried no `error` field — i.e. the route threw and Next
 * returned an unhandled, bodiless 500. These tests pin that a repository fault
 * becomes a structured, logged 500 instead, and that the controlled
 * no-workspace / empty-account paths never 500.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  listAccountAgents: vi.fn(),
  findLogs: vi.fn(),
  countLogs: vi.fn(),
  aggregateStats: vi.fn(),
  findAgentNames: vi.fn(),
  getVerificationLogSummaryAgg: vi.fn(),
  withAgentNames: vi.fn(),
  withApprovalLinks: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: vi.fn()
}));

vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: mocks.getWorkspaceActor
}));

vi.mock("@/lib/accountAgents", () => ({
  listAccountAgents: mocks.listAccountAgents
}));

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

import { GET as agentsGet } from "@/app/api/dashboard/agents/route";
import { GET as logsGet } from "@/app/api/dashboard/logs/route";

const ACTOR = { userId: "user_1", accountId: "acct_1", role: "OWNER", authorityLevel: 3 };

function makeRequest(url = "https://app.behalfid.com/api/dashboard/logs") {
  return { nextUrl: new URL(url) } as never;
}

function authed() {
  return { error: null, user: { userId: "user_1" }, activeAccountId: "acct_1", account: { plan: "pro" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDeveloperApi.mockResolvedValue(authed());
  mocks.getWorkspaceActor.mockResolvedValue(ACTOR);
  mocks.getVerificationLogSummaryAgg.mockResolvedValue(null);
  mocks.withAgentNames.mockImplementation(async (rows: unknown) => rows);
  mocks.withApprovalLinks.mockImplementation(async (rows: unknown) => rows);
});

describe("GET /api/dashboard/agents", () => {
  it("returns agents for an authenticated valid workspace", async () => {
    mocks.listAccountAgents.mockResolvedValue([]);
    const res = await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ agents: [] });
  });

  it("returns an empty collection for an empty account, not an error", async () => {
    mocks.listAccountAgents.mockResolvedValue([]);
    const res = await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    expect(res.status).toBe(200);
    expect((await res.json()).agents).toEqual([]);
  });

  it("returns a controlled 403 when there is no workspace membership", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const res = await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Workspace account required.");
    expect(mocks.listAccountAgents).not.toHaveBeenCalled();
  });

  it("returns a controlled 403 for a stale/invalid workspace selection", async () => {
    // A stale selected-workspace id resolves to no actor.
    mocks.requireDeveloperApi.mockResolvedValue({ ...authed(), activeAccountId: "acct_stale" });
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const res = await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    expect(res.status).toBe(403);
    expect(res.status).not.toBe(500);
  });

  it("turns a repository fault into a structured, logged 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = Object.assign(new Error('relation "agents" does not exist'), { code: "42P01" });
    mocks.listAccountAgents.mockRejectedValue(boom);

    const res = await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
    expect(typeof body.error).toBe("string");
    // The safe message must not leak the driver detail.
    expect(body.error).not.toContain("does not exist");
    expect(body.error).not.toContain("42P01");

    // Server-side context is captured, including SQLSTATE.
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("dashboard.agents.list");
    expect(logged).toContain("42P01");
    expect(logged).toContain("acct_1");
    spy.mockRestore();
  });
});

describe("GET /api/dashboard/logs", () => {
  function okLogs() {
    mocks.findLogs.mockResolvedValue([]);
    mocks.countLogs.mockResolvedValue(0);
  }

  it("returns decision history for an authenticated valid workspace", async () => {
    okLogs();
    const res = await logsGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toEqual([]);
    expect(body.pagination).toBeTruthy();
  });

  it("returns an empty collection when there is no workspace membership", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const res = await logsGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(mocks.findLogs).not.toHaveBeenCalled();
  });

  it("returns a controlled response for a stale/invalid workspace selection", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({ ...authed(), activeAccountId: "acct_stale" });
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const res = await logsGet(makeRequest());
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);
  });

  it("turns a repository fault into a structured, logged 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = Object.assign(new Error("Connection terminated unexpectedly"), { code: "57P01" });
    mocks.findLogs.mockImplementation(() => {
      throw boom;
    });

    const res = await logsGet(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
    expect(body.error).not.toContain("Connection terminated");

    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("dashboard.logs.list");
    expect(logged).toContain("57P01");
    spy.mockRestore();
  });

  it("does not 500 on out-of-range pagination input", async () => {
    okLogs();
    const res = await logsGet(
      makeRequest("https://app.behalfid.com/api/dashboard/logs?limit=-5&page=abc")
    );
    expect(res.status).toBe(200);
  });
});

describe("shared workspace resolver contract", () => {
  it("both endpoints resolve the actor from the same auth + workspace pair", async () => {
    mocks.listAccountAgents.mockResolvedValue([]);
    mocks.findLogs.mockResolvedValue([]);
    mocks.countLogs.mockResolvedValue(0);

    await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    await logsGet(makeRequest());

    expect(mocks.getWorkspaceActor).toHaveBeenCalledTimes(2);
    for (const call of mocks.getWorkspaceActor.mock.calls) {
      expect(call).toEqual(["user_1", "acct_1"]);
    }
  });

  it("neither endpoint touches the repository before the actor is resolved", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    await agentsGet(makeRequest("https://app.behalfid.com/api/dashboard/agents"));
    await logsGet(makeRequest());
    expect(mocks.listAccountAgents).not.toHaveBeenCalled();
    expect(mocks.findLogs).not.toHaveBeenCalled();
  });
});
