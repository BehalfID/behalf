import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORITY_LEVELS, type WorkspaceRole } from "@/lib/authority";

const mocks = vi.hoisted(() => ({
  permissionFindOne: vi.fn(),
  permissionFind: vi.fn(),
  permissionFindOneAndUpdate: vi.fn(),
  permissionCreate: vi.fn(),
  permissionUpdateOne: vi.fn(),
  emitWebhookEvent: vi.fn()
}));

vi.mock("@/lib/ids", () => ({ createPublicId: () => "perm_replacement" }));
vi.mock("@/lib/webhooks", () => ({
  createWebhookEvent: (_accountId: string, type: string, data: unknown) => ({ type, data }),
  emitWebhookEvent: mocks.emitWebhookEvent
}));
vi.mock("@/models/Permission", () => ({
  default: {
    findOne: mocks.permissionFindOne,
    find: mocks.permissionFind,
    findOneAndUpdate: mocks.permissionFindOneAndUpdate,
    create: mocks.permissionCreate,
    updateOne: mocks.permissionUpdateOne
  }
}));
vi.mock("@/models/Agent", () => ({ default: {} }));
vi.mock("@/models/PermissionProfile", () => ({ default: {} }));

function actor(role: WorkspaceRole = "OWNER") {
  return {
    userId: "user_test",
    accountId: "acct_test",
    role,
    authorityLevel: AUTHORITY_LEVELS[role]
  };
}

function activePermission(overrides: Record<string, unknown> = {}) {
  return {
    permissionId: "perm_old",
    accountId: "acct_test",
    agentId: "agent_test",
    action: "execute_command",
    resource: "shell",
    requiresApproval: false,
    constraints: { deniedCommands: ["rm -rf", "curl"] },
    requiredAuthorityLevel: 80,
    status: "active",
    ...overrides
  };
}

function mockOverlapCandidates(items: unknown[] = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(items)
  };
  mocks.permissionFind.mockReturnValue(chain);
}

async function replace(body: Record<string, unknown> = {}) {
  const { replacePermissionForAgent } = await import("@/lib/permissionMutations");
  return replacePermissionForAgent({
    actor: actor(),
    userId: "user_test",
    agentId: "agent_test",
    permissionId: "perm_old",
    body: {
      action: "execute_command",
      resource: "shell",
      requiresApproval: true,
      constraints: { deniedCommands: ["rm -rf", "curl"] },
      ...body
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissionFindOne.mockResolvedValue(activePermission());
  mockOverlapCandidates();
  mocks.permissionFindOneAndUpdate.mockResolvedValue({ ...activePermission(), status: "revoked" });
  mocks.permissionCreate.mockResolvedValue({});
  mocks.permissionUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mocks.emitWebhookEvent.mockResolvedValue(undefined);
});

describe("replacePermissionForAgent", () => {
  it("retires the old permission, preserves constraints, and returns a new active ID", async () => {
    const result = await replace();

    expect(result).toMatchObject({
      retiredPermissionId: "perm_old",
      retiredStatus: "revoked",
      permissionId: "perm_replacement",
      status: "active",
      requiredAuthorityLevel: 80
    });
    expect(mocks.permissionFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ permissionId: "perm_old", status: "active" }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "revoked", replacedByPermissionId: "perm_replacement" })
      }),
      { returnDocument: "after" }
    );
    expect(mocks.permissionCreate).toHaveBeenCalledWith(expect.objectContaining({
      permissionId: "perm_replacement",
      replacesPermissionId: "perm_old",
      status: "active",
      requiresApproval: true,
      constraints: expect.objectContaining({ deniedCommands: ["rm -rf", "curl"] })
    }));
    expect(mocks.permissionFindOneAndUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.permissionCreate.mock.invocationCallOrder[0]);
  });

  it("compensates a failed create by restoring the original active permission", async () => {
    mocks.permissionCreate.mockRejectedValueOnce(new Error("insert failed"));

    const result = await replace();
    expect("error" in result && result.error?.status).toBe(500);
    expect(mocks.permissionUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionId: "perm_old",
        status: "revoked",
        replacedByPermissionId: "perm_replacement"
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "active" }),
        $unset: expect.objectContaining({ replacedByPermissionId: "" })
      })
    );
    expect(mocks.permissionCreate).toHaveBeenCalledTimes(1);
  });

  it("preserves overlapping active permissions and reports them as warnings", async () => {
    mockOverlapCandidates([
      { permissionId: "perm_overlap", resource: "shell" },
      { permissionId: "perm_other_resource", resource: "filesystem" }
    ]);

    const result = await replace();
    expect(result).toMatchObject({ overlapPermissionIds: ["perm_overlap"] });
    expect(mocks.permissionFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.permissionFindOneAndUpdate.mock.calls[0][0]).toMatchObject({ permissionId: "perm_old" });
  });

  it("keeps authority checks enforced for both old and replacement policy", async () => {
    const { replacePermissionForAgent } = await import("@/lib/permissionMutations");
    const result = await replacePermissionForAgent({
      actor: actor("ENGINEER"),
      userId: "engineer_test",
      agentId: "agent_test",
      permissionId: "perm_old",
      body: { action: "execute_command", resource: "shell", requiresApproval: true }
    });

    expect("error" in result && result.error?.status).toBe(403);
    expect(mocks.permissionFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.permissionCreate).not.toHaveBeenCalled();
  });

  it("rejects replacement of revoked permissions", async () => {
    mocks.permissionFindOne.mockResolvedValueOnce(activePermission({ status: "revoked" }));
    const result = await replace();
    expect("error" in result && result.error?.status).toBe(409);
    expect(mocks.permissionFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.permissionCreate).not.toHaveBeenCalled();
  });

  it("blocks viewers before reading or mutating permissions", async () => {
    const { replacePermissionForAgent } = await import("@/lib/permissionMutations");
    const result = await replacePermissionForAgent({
      actor: actor("VIEWER"),
      userId: "viewer_test",
      agentId: "agent_test",
      permissionId: "perm_old",
      body: { action: "repo.read" }
    });
    expect("error" in result && result.error?.status).toBe(403);
    expect(mocks.permissionFindOne).not.toHaveBeenCalled();
  });
});
