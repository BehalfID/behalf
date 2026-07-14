import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backfillLegacyAgentsForActor: vi.fn(),
  agentFindOne: vi.fn(),
  permissionFind: vi.fn(),
  permissionCountDocuments: vi.fn(),
  permissionUpdateMany: vi.fn(),
  verificationCountDocuments: vi.fn(),
  verificationUpdateMany: vi.fn()
}));

vi.mock("@/lib/accountAgents", () => ({
  backfillLegacyAgentsForActor: mocks.backfillLegacyAgentsForActor
}));
vi.mock("@/models/Agent", () => ({ default: { findOne: mocks.agentFindOne } }));
vi.mock("@/models/Permission", () => ({
  default: {
    find: mocks.permissionFind,
    countDocuments: mocks.permissionCountDocuments,
    updateMany: mocks.permissionUpdateMany
  }
}));
vi.mock("@/models/VerificationLog", () => ({
  default: {
    countDocuments: mocks.verificationCountDocuments,
    updateMany: mocks.verificationUpdateMany
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backfillLegacyAgentsForActor.mockResolvedValue(undefined);
  mocks.agentFindOne.mockResolvedValue({
    agentId: "agent_test",
    name: "Test Agent",
    status: "active",
    agentType: "native",
    provider: "custom",
    connectionStatus: "manual"
  });
  mocks.permissionUpdateMany.mockResolvedValue({});
  mocks.verificationUpdateMany.mockResolvedValue({});
  const chain = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([
      {
        permissionId: "perm_shell",
        action: "execute_command",
        resource: "shell",
        status: "active",
        constraints: { deniedCommands: ["rm -rf"] }
      }
    ])
  };
  mocks.permissionFind.mockReturnValue(chain);
  mocks.permissionCountDocuments
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(3);
  mocks.verificationCountDocuments.mockResolvedValue(4);
});

describe("getAccountAgentDetail", () => {
  it("returns policy and exact posture counts without embedding a log feed", async () => {
    const { getAccountAgentDetail } = await import("@/lib/accountDashboardData");
    const detail = await getAccountAgentDetail({
      userId: "user_test",
      accountId: "acct_test",
      role: "OWNER",
      authorityLevel: 100
    }, "agent_test");

    expect(detail).toMatchObject({
      agent: { agentId: "agent_test" },
      permissions: [{ permissionId: "perm_shell", constraints: { deniedCommands: ["rm -rf"] } }],
      securityPosture: {
        activePermissions: 2,
        approvalGatedPermissions: 1,
        revokedPermissions: 3,
        recentDeniedActions: 4
      }
    });
    expect(detail).not.toHaveProperty("logs");
    expect(mocks.verificationCountDocuments).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "acct_test",
      agentId: "agent_test",
      allowed: false
    }));
  });
});
