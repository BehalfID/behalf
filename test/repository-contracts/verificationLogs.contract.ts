import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type VerificationLogContractRow = {
  logId: string;
  requestId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  agentId: string;
  permissionId?: string | null;
  action: string;
  amount?: number | null;
  vendor?: string | null;
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  risk: string;
  metadata?: Record<string, unknown> | null;
  shadow?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type AggregateStatsContract = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

type WriteResult = {
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
};

export type VerificationLogsContractDeps = {
  createLog: (input: Record<string, unknown>) => Promise<VerificationLogContractRow>;
  find: (
    filter?: Record<string, unknown>,
    options?: {
      sort?: Record<string, 1 | -1>;
      limit?: number;
      skip?: number;
      select?: string;
    }
  ) => Promise<VerificationLogContractRow[]>;
  findOne: (
    filter: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; select?: string }
  ) => Promise<VerificationLogContractRow | null>;
  countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  aggregateStats: (
    query: Record<string, unknown>,
    limit?: number
  ) => Promise<AggregateStatsContract | null>;
  aggregate: (
    pipeline: Array<Record<string, unknown>>
  ) => Promise<Array<{ _id: string; total: number; allowed: number; denied: number }>>;
  findAgentNames: (
    agentIds: string[],
    scope: { developerUserId?: string; accountId?: string }
  ) => Promise<Array<{ agentId: string; name: string }>>;
  updateMany: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<WriteResult>;
  deleteMany: (filter: Record<string, unknown>) => Promise<WriteResult>;
  ensurePartitions?: () => Promise<void>;
  seedAgent: (input: {
    accountId: string;
    developerUserId: string;
    agentId: string;
    name?: string;
  }) => Promise<void>;
};

function baseLog(
  overrides: Partial<VerificationLogContractRow> &
    Pick<VerificationLogContractRow, "logId" | "requestId" | "agentId" | "action" | "allowed" | "reason" | "risk">
): Record<string, unknown> {
  return {
    accountId: "acct_logs",
    developerUserId: "dev_logs",
    permissionId: null,
    amount: null,
    vendor: null,
    approvalRequired: false,
    metadata: null,
    shadow: false,
    ...overrides
  };
}

export function makeVerificationLogsRepositoryContract(
  name: string,
  factory: () => VerificationLogsContractDeps | Promise<VerificationLogsContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("creates, retrieves, and normalizes logs while preserving createdAt and metadata", async () => {
      const deps = getDeps();
      await deps.ensurePartitions?.();
      await deps.seedAgent({
        accountId: "acct_logs",
        developerUserId: "dev_logs",
        agentId: "agent_logs"
      });
      const createdAt = new Date("2026-03-15T12:34:56.000Z");
      const created = await deps.createLog(
        baseLog({
          logId: "log_create",
          requestId: "req_create",
          agentId: "agent_logs",
          action: "deploy",
          allowed: true,
          reason: "ok",
          risk: "low",
          amount: 42.5,
          vendor: "vercel",
          metadata: { environment: "staging", nested: { a: 1 } },
          createdAt
        })
      );

      expect(created.logId).toBe("log_create");
      expect(created.amount).toBe(42.5);
      expect(created.metadata).toEqual({ environment: "staging", nested: { a: 1 } });
      expect(created.createdAt?.getTime()).toBe(createdAt.getTime());

      const found = await deps.findOne({ requestId: "req_create" });
      expect(found?.logId).toBe("log_create");
      expect(found?.vendor).toBe("vercel");
      expect(found?.shadow).toBe(false);
    });

    it("filters by account, agent, decision, date range, metadata, and search", async () => {
      const deps = getDeps();
      await deps.ensurePartitions?.();
      await deps.seedAgent({
        accountId: "acct_filter",
        developerUserId: "dev_filter",
        agentId: "agent_filter"
      });
      await deps.seedAgent({
        accountId: "acct_other",
        developerUserId: "dev_other",
        agentId: "agent_other"
      });

      await deps.createLog(
        baseLog({
          logId: "log_filter_a",
          requestId: "req_filter_a",
          accountId: "acct_filter",
          developerUserId: "dev_filter",
          agentId: "agent_filter",
          action: "execute_command",
          allowed: false,
          approvalRequired: true,
          reason: "Permission requires approval before execution.",
          risk: "medium",
          vendor: "cli",
          metadata: { environment: "Production" },
          createdAt: new Date("2026-04-10T10:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_filter_b",
          requestId: "req_filter_b",
          accountId: "acct_filter",
          developerUserId: "dev_filter",
          agentId: "agent_filter",
          action: "read_file",
          allowed: true,
          reason: "ok",
          risk: "low",
          shadow: true,
          createdAt: new Date("2026-04-11T10:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_filter_other",
          requestId: "req_filter_other",
          accountId: "acct_other",
          developerUserId: "dev_other",
          agentId: "agent_other",
          action: "execute_command",
          allowed: false,
          reason: "denied",
          risk: "high",
          createdAt: new Date("2026-04-10T11:00:00.000Z")
        })
      );

      expect(
        await deps.countDocuments({
          accountId: "acct_filter",
          agentId: "agent_filter",
          allowed: false,
          approvalRequired: true
        })
      ).toBe(1);
      expect(
        await deps.countDocuments({
          accountId: "acct_filter",
          createdAt: {
            $gte: new Date("2026-04-10T00:00:00.000Z"),
            $lte: new Date("2026-04-10T23:59:59.999Z")
          }
        })
      ).toBe(1);
      expect(
        (
          await deps.find({
            accountId: "acct_filter",
            "metadata.environment": /^Production$/i
          })
        ).map((row) => row.logId)
      ).toEqual(["log_filter_a"]);
      expect(
        (
          await deps.find({
            accountId: "acct_filter",
            $or: [{ action: /execute/i }, { reason: /execute/i }]
          })
        ).map((row) => row.logId)
      ).toEqual(["log_filter_a"]);
      expect(await deps.find({ accountId: "acct_filter", agentId: "agent_other" })).toEqual([]);
    });

    it("paginates newest-first with skip/limit and preserves createdAt ordering", async () => {
      const deps = getDeps();
      await deps.ensurePartitions?.();
      await deps.seedAgent({
        accountId: "acct_page",
        developerUserId: "dev_page",
        agentId: "agent_page"
      });
      await deps.createLog(
        baseLog({
          logId: "log_page_a",
          requestId: "req_page_a",
          accountId: "acct_page",
          developerUserId: "dev_page",
          agentId: "agent_page",
          action: "a",
          allowed: true,
          reason: "ok",
          risk: "low",
          createdAt: new Date("2026-05-01T00:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_page_b",
          requestId: "req_page_b",
          accountId: "acct_page",
          developerUserId: "dev_page",
          agentId: "agent_page",
          action: "b",
          allowed: true,
          reason: "ok",
          risk: "low",
          createdAt: new Date("2026-05-01T12:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_page_c",
          requestId: "req_page_c",
          accountId: "acct_page",
          developerUserId: "dev_page",
          agentId: "agent_page",
          action: "c",
          allowed: true,
          reason: "ok",
          risk: "low",
          createdAt: new Date("2026-05-02T00:00:00.000Z")
        })
      );

      const page = await deps.find(
        { accountId: "acct_page" },
        { sort: { createdAt: -1 }, skip: 0, limit: 2 }
      );
      expect(page.map((row) => row.logId)).toEqual(["log_page_c", "log_page_b"]);
      const next = await deps.find(
        { accountId: "acct_page" },
        { sort: { createdAt: -1 }, skip: 2, limit: 2 }
      );
      expect(next.map((row) => row.logId)).toEqual(["log_page_a"]);
    });

    it("aggregates stats in the store without fetching the full result set for callers", async () => {
      const deps = getDeps();
      await deps.ensurePartitions?.();
      await deps.seedAgent({
        accountId: "acct_agg",
        developerUserId: "dev_agg",
        agentId: "agent_agg"
      });
      await deps.createLog(
        baseLog({
          logId: "log_agg_1",
          requestId: "req_agg_1",
          accountId: "acct_agg",
          developerUserId: "dev_agg",
          agentId: "agent_agg",
          action: "deploy",
          allowed: false,
          reason: "Action requires approval before execution.",
          risk: "high",
          vendor: "aws",
          createdAt: new Date("2026-06-01T01:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_agg_2",
          requestId: "req_agg_2",
          accountId: "acct_agg",
          developerUserId: "dev_agg",
          agentId: "agent_agg",
          action: "deploy",
          allowed: false,
          reason: "blocked",
          risk: "medium",
          vendor: "aws",
          createdAt: new Date("2026-06-01T02:00:00.000Z")
        })
      );
      await deps.createLog(
        baseLog({
          logId: "log_agg_3",
          requestId: "req_agg_3",
          accountId: "acct_agg",
          developerUserId: "dev_agg",
          agentId: "agent_agg",
          action: "read",
          allowed: true,
          reason: "ok",
          risk: "low",
          vendor: "gcp",
          createdAt: new Date("2026-06-01T03:00:00.000Z")
        })
      );

      const stats = await deps.aggregateStats({ accountId: "acct_agg" }, 1000);
      expect(stats).toEqual({
        total: 3,
        allowed: 1,
        denied: 2,
        highRisk: 1,
        approvalRequired: 1,
        topDeniedAction: "deploy",
        topVendor: "aws"
      });

      const daily = await deps.aggregate([
        { $match: { accountId: "acct_agg" } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: 1 },
            allowed: { $sum: { $cond: ["$allowed", 1, 0] } },
            denied: { $sum: { $cond: ["$allowed", 0, 1] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      expect(daily).toEqual([{ _id: "2026-06-01", total: 3, allowed: 1, denied: 2 }]);
    });

    it("resolves agent names, updates, deletes, and preserves month-boundary createdAt", async () => {
      const deps = getDeps();
      await deps.ensurePartitions?.();
      await deps.seedAgent({
        accountId: "acct_mut",
        developerUserId: "dev_mut",
        agentId: "agent_mut",
        name: "Mutation Agent"
      });
      const boundary = new Date("2026-07-01T00:00:00.000Z");
      await deps.createLog(
        baseLog({
          logId: "log_mut",
          requestId: "req_mut",
          accountId: "acct_mut",
          developerUserId: "dev_mut",
          agentId: "agent_mut",
          action: "write",
          allowed: true,
          reason: "ok",
          risk: "low",
          createdAt: boundary
        })
      );

      expect(await deps.findAgentNames(["agent_mut"], { accountId: "acct_mut" })).toEqual([
        { agentId: "agent_mut", name: "Mutation Agent" }
      ]);
      expect((await deps.findOne({ logId: "log_mut" }))?.createdAt?.getTime()).toBe(
        boundary.getTime()
      );

      expect(
        (await deps.updateMany({ logId: "log_mut" }, { $set: { reason: "updated" } })).modifiedCount
      ).toBe(1);
      expect((await deps.findOne({ logId: "log_mut" }))?.reason).toBe("updated");
      expect((await deps.deleteMany({ accountId: "acct_mut" })).deletedCount).toBe(1);
      expect(await deps.countDocuments({ accountId: "acct_mut" })).toBe(0);
    });
  });
}
