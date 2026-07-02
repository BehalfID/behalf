import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORITY_LEVELS } from "@/lib/authority";
import type { WorkspaceActor } from "@/lib/delegatedAuth";

const mocks = vi.hoisted(() => ({
  agentUpdateMany: vi.fn(),
  agentFind: vi.fn(),
  agentFindOne: vi.fn()
}));

vi.mock("@/models/Agent", () => ({
  default: {
    updateMany: mocks.agentUpdateMany,
    find: mocks.agentFind,
    findOne: mocks.agentFindOne
  }
}));

const actor: WorkspaceActor = {
  userId: "user_owner",
  accountId: "acct_primary",
  role: "OWNER",
  authorityLevel: AUTHORITY_LEVELS.OWNER
};

function mockAgentFindChain(agents: unknown[]) {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(agents)
  };
  mocks.agentFind.mockReturnValue(chain);
  return chain;
}

describe("backfillLegacyAgentsForActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("backfills only the actor's legacy agents with the actor accountId", async () => {
    const { backfillLegacyAgentsForActor } = await import("@/lib/accountAgents");
    await backfillLegacyAgentsForActor(actor);

    expect(mocks.agentUpdateMany).toHaveBeenCalledWith(
      {
        developerUserId: "user_owner",
        $or: [{ accountId: { $exists: false } }, { accountId: null }]
      },
      { $set: { accountId: "acct_primary" } }
    );
  });
});

describe("listAccountAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it("returns legacy agents for the actor after backfill", async () => {
    mockAgentFindChain([
      { agentId: "agent_legacy", name: "Legacy Agent", status: "active", agentType: "native", provider: "custom" }
    ]);
    const { listAccountAgents } = await import("@/lib/accountAgents");
    const agents = await listAccountAgents(actor);

    expect(mocks.agentUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.agentFind).toHaveBeenCalledWith({ accountId: "acct_primary" });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ agentId: "agent_legacy" });
  });
});

describe("findAccountAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("finds a legacy agent scoped to the actor account after backfill", async () => {
    mocks.agentFindOne.mockResolvedValue({
      agentId: "agent_legacy",
      developerUserId: "user_owner",
      accountId: "acct_primary"
    });
    const { findAccountAgent } = await import("@/lib/accountAgents");
    const agent = await findAccountAgent(actor, "agent_legacy");

    expect(mocks.agentUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.agentFindOne).toHaveBeenCalledWith({
      accountId: "acct_primary",
      agentId: "agent_legacy"
    });
    expect(agent).toMatchObject({ agentId: "agent_legacy" });
  });

  it("does not return agents from another account", async () => {
    mocks.agentFindOne.mockResolvedValue(null);
    const { findAccountAgent } = await import("@/lib/accountAgents");
    const agent = await findAccountAgent(actor, "agent_other_account");

    expect(agent).toBeNull();
    expect(mocks.agentFindOne).toHaveBeenCalledWith({
      accountId: "acct_primary",
      agentId: "agent_other_account"
    });
  });

  it("scopes backfill to the actor userId so other users' legacy agents are untouched", async () => {
    const { backfillLegacyAgentsForActor } = await import("@/lib/accountAgents");
    await backfillLegacyAgentsForActor(actor);

    const filter = mocks.agentUpdateMany.mock.calls[0]?.[0];
    expect(filter).toEqual({
      developerUserId: "user_owner",
      $or: [{ accountId: { $exists: false } }, { accountId: null }]
    });
    expect(filter).not.toHaveProperty("agentId");
  });
});
