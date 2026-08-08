/**
 * Dashboard Overview — metric semantics.
 *
 * The loader owns every definition the page renders, so these assert the
 * definitions rather than the markup: what counts as denied, what "today"
 * means, which decisions are excluded, and that the buckets reconcile.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();

const mocks = vi.hoisted(() => ({
  countApprovals: vi.fn(),
  findApprovals: vi.fn(),
  countLogs: vi.fn(),
  findLogs: vi.fn(),
  findAgentNames: vi.fn(),
  aggregateDailyDecisions: vi.fn(),
  countAgents: vi.fn()
}));

vi.mock("@/lib/repositories/approvals", () => ({
  countApprovals: mocks.countApprovals,
  findApprovals: mocks.findApprovals
}));
vi.mock("@/lib/repositories/verificationLogs", () => ({
  countLogs: mocks.countLogs,
  findLogs: mocks.findLogs,
  findAgentNames: mocks.findAgentNames,
  aggregateDailyDecisions: mocks.aggregateDailyDecisions
}));
vi.mock("@/lib/repositories/agents", () => ({ countAgents: mocks.countAgents }));

const NOW = new Date("2026-08-06T15:30:00.000Z");

function setup(overrides: Partial<Record<keyof typeof mocks, unknown>> = {}) {
  mocks.countApprovals.mockResolvedValue(overrides.countApprovals ?? 0);
  mocks.countLogs.mockResolvedValue(0);
  mocks.countAgents.mockResolvedValue(overrides.countAgents ?? 0);
  mocks.aggregateDailyDecisions.mockResolvedValue(overrides.aggregateDailyDecisions ?? []);
  mocks.findApprovals.mockResolvedValue(overrides.findApprovals ?? []);
  mocks.findLogs.mockResolvedValue(overrides.findLogs ?? []);
  mocks.findAgentNames.mockResolvedValue(overrides.findAgentNames ?? []);
}

async function load(input: Record<string, unknown> = {}) {
  const { loadDashboardOverview } = await import("@/lib/dashboardOverview");
  return loadDashboardOverview({
    accountId: "acct_1",
    account: { plan: "business" },
    role: "OWNER",
    now: NOW,
    ...input
  } as Parameters<typeof loadDashboardOverview>[0]);
}

describe("metric definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("counts today from 00:00 UTC, not local midnight", async () => {
    await load();
    const todayCall = mocks.countLogs.mock.calls[0]![0] as Record<string, { $gte: Date }>;
    // UTC keeps the card consistent with the UTC-based verification period.
    expect(todayCall.createdAt.$gte.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("counts only active agents", async () => {
    await load();
    expect(mocks.countAgents).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("scopes every query to the workspace", async () => {
    await load();
    for (const call of [...mocks.countLogs.mock.calls, ...mocks.countApprovals.mock.calls]) {
      expect(JSON.stringify(call[0])).toContain("acct_1");
    }
    expect(mocks.aggregateDailyDecisions).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_1" })
    );
  });

  it("excludes shadow decisions, which were never enforced", async () => {
    await load();
    const call = mocks.countLogs.mock.calls[0]![0] as Record<string, unknown>;
    expect(JSON.stringify(call.$or)).toContain("shadow");
  });

  it("counts denied without double-counting approval gates", async () => {
    await load();
    // The "denied or blocked" card is the 4th positional count.
    const deniedCall = mocks.countLogs.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).allowed === false
    )![0] as Record<string, unknown>;
    expect(deniedCall.approvalRequired).toBe(false);
  });

  it("never looks further back than the plan retains", async () => {
    // Free retains 7 days, so a 14-day window must be clamped.
    await load({ account: { plan: "free" } });
    const call = mocks.aggregateDailyDecisions.mock.calls[0]![0] as { since: Date };
    const days = (NOW.getTime() - call.since.getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(7.01);
  });

  it("honours a complimentary grant when clamping the window", async () => {
    // Billing free, granted pro → 90-day retention, so the full window survives.
    await load({ account: { plan: "free", complimentaryPlan: "pro" } });
    const call = mocks.aggregateDailyDecisions.mock.calls[0]![0] as { since: Date };
    const days = (NOW.getTime() - call.since.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(14, 1);
  });
});

describe("outcome reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums the daily buckets into a total that accounts for every decision", async () => {
    setup({
      aggregateDailyDecisions: [
        { day: "2026-08-05", allowed: 10, denied: 2, approvalRequired: 1 },
        { day: "2026-08-06", allowed: 5, denied: 0, approvalRequired: 2 }
      ]
    });
    const data = await load();

    expect(data.outcome).toEqual({ allowed: 15, denied: 2, approvalRequired: 3, total: 20 });
    // Exhaustive by construction, so percentages cannot drift from 100%.
    expect(data.outcome.allowed + data.outcome.denied + data.outcome.approvalRequired).toBe(
      data.outcome.total
    );
  });

  it("reports an empty workspace rather than dividing by zero", async () => {
    setup();
    const data = await load();

    expect(data.outcome.total).toBe(0);
    expect(data.isEmpty).toBe(true);
  });

  it("is not empty once anything exists", async () => {
    setup({ countAgents: 1 });
    expect((await load()).isEmpty).toBe(false);
  });
});

describe("authority and payload safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("withholds review and mutation from a viewer", async () => {
    const data = await load({ role: "VIEWER" });
    expect(data.canReview).toBe(false);
    expect(data.canMutate).toBe(false);
  });

  it.each(["OWNER", "ENGINEERING_LEAD", "SENIOR_ENGINEER", "ENGINEER"])(
    "allows review for %s",
    async (role) => {
      expect((await load({ role })).canReview).toBe(true);
    }
  );

  it("requests only non-sensitive log fields", async () => {
    await load();
    const options = mocks.findLogs.mock.calls[0]![1] as { select: string };
    // Reason text, metadata and arguments can carry sensitive payloads.
    expect(options.select).not.toMatch(/\breason\b/);
    expect(options.select).not.toMatch(/\bmetadata\b/);
    expect(options.select).not.toMatch(/argument/);
    expect(options.select).toContain("action");
  });

  it("caps the lists so the page cannot fetch unbounded rows", async () => {
    await load();
    expect((mocks.findLogs.mock.calls[0]![1] as { limit: number }).limit).toBeLessThanOrEqual(10);
    expect((mocks.findApprovals.mock.calls[0]![1] as { limit: number }).limit).toBeLessThanOrEqual(10);
  });

  it("resolves agent display names instead of leaking raw ids", async () => {
    vi.clearAllMocks();
    setup({
      findLogs: [
        {
          logId: "log_1",
          action: "deploy_service",
          agentId: "agent_1",
          allowed: true,
          approvalRequired: false,
          createdAt: NOW
        }
      ],
      findAgentNames: [{ agentId: "agent_1", name: "Cursor Production" }]
    });
    const data = await load();
    expect(data.decisions[0]!.agentName).toBe("Cursor Production");
  });
});

describe("the page renders only what the loader produced", () => {
  // Comments explain what was deliberately *not* rendered, so assert on code.
  const view = readFileSync(join(ROOT, "components/dashboard/overview/OverviewView.tsx"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("carries no illustrative or fabricated values", () => {
    // The reference shows "+4.1% vs previous period"; production has no
    // comparable-period aggregate, so no trend is rendered at all.
    expect(view).not.toMatch(/ILLUSTRATIVE/i);
    expect(view).not.toMatch(/vs previous period/);
    expect(view).not.toMatch(/\d+\.\d+%/);
  });

  it("does not restate the large billing panel", () => {
    // Plan usage lives in the sidebar and on /billing.
    expect(view).not.toMatch(/PLAN AND USAGE/i);
    expect(view).not.toContain("Manage billing");
  });

  it("keeps outcome legible without relying on colour", () => {
    // Each decision carries a text label, so outcome never depends on hue.
    expect(view).toContain("OUTCOME_LABEL[decision.outcome]");
    expect(view).toMatch(/allowed: "Allowed"/);
    expect(view).toMatch(/denied: "Denied"/);
  });

  it("declares no second main landmark", () => {
    expect(view).not.toContain("<main");
  });

  it("gates the review action on authority", () => {
    expect(view).toMatch(/data\.canReview \?/);
    expect(view).toMatch(/data\.canMutate \?/);
  });
});
