import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORITY_LEVELS, type WorkspaceRole } from "@/lib/authority";

const mocks = vi.hoisted(() => ({
  agentFindOne: vi.fn(),
  permissionFindOne: vi.fn(),
  findReplacementByIdempotencyKey: vi.fn(),
  stageReplacementPermission: vi.fn(),
  revokeActivePermissionForReplacement: vi.fn(),
  activateStagedReplacementPermission: vi.fn(),
  abandonStagedReplacementPermission: vi.fn(),
  auditCreate: vi.fn(),
  emitWebhookEvent: vi.fn()
}));

vi.mock("@/lib/ids", () => ({
  createPublicId: (prefix: string) => {
    if (prefix === "perm") return "perm_replacement";
    if (prefix === "prk") return "prk_auto";
    if (prefix === "pra") return "pra_event";
    return `${prefix}_test`;
  }
}));

vi.mock("@/lib/webhooks", () => ({
  createWebhookEvent: (_accountId: string, type: string, data: unknown) => ({ type, data }),
  emitWebhookEvent: mocks.emitWebhookEvent
}));

vi.mock("@/lib/repositories/permissions", () => ({
  findReplacementByIdempotencyKey: mocks.findReplacementByIdempotencyKey,
  stageReplacementPermission: mocks.stageReplacementPermission,
  revokeActivePermissionForReplacement: mocks.revokeActivePermissionForReplacement,
  activateStagedReplacementPermission: mocks.activateStagedReplacementPermission,
  abandonStagedReplacementPermission: mocks.abandonStagedReplacementPermission
}));

vi.mock("@/models/Permission", () => ({
  default: {
    findOne: mocks.permissionFindOne,
    create: vi.fn()
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    findOne: mocks.agentFindOne
  }
}));

vi.mock("@/models/PermissionProfile", () => ({ default: {} }));

vi.mock("@/models/PermissionReplacementAudit", () => ({
  default: {
    create: mocks.auditCreate
  }
}));

function actor(role: WorkspaceRole = "OWNER", accountId = "acct_test") {
  return {
    userId: "user_test",
    accountId,
    role,
    authorityLevel: AUTHORITY_LEVELS[role]
  };
}

function activePermission(overrides: Record<string, unknown> = {}) {
  return {
    permissionId: "perm_old",
    accountId: "acct_test",
    agentId: "agent_test",
    action: "repo.read",
    resource: "github",
    requiresApproval: false,
    constraints: {},
    requiredAuthorityLevel: 40,
    status: "active",
    updatedAt: new Date("2026-07-24T12:00:00.000Z"),
    ...overrides
  };
}

async function replace(
  body: Record<string, unknown> = {},
  options: {
    role?: WorkspaceRole;
    accountId?: string;
    agentId?: string;
    permissionId?: string;
  } = {}
) {
  const { replacePermissionForAgent } = await import("@/lib/permissionMutations");
  return replacePermissionForAgent({
    actor: actor(options.role, options.accountId),
    userId: "user_test",
    agentId: options.agentId ?? "agent_test",
    permissionId: options.permissionId ?? "perm_old",
    body: {
      action: "repo.read",
      resource: "github",
      requiresApproval: true,
      idempotencyKey: "idem_1",
      ...body
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agentFindOne.mockResolvedValue({ agentId: "agent_test", accountId: "acct_test" });
  mocks.permissionFindOne.mockResolvedValue(activePermission());
  mocks.findReplacementByIdempotencyKey.mockResolvedValue(null);
  mocks.stageReplacementPermission.mockResolvedValue({});
  mocks.revokeActivePermissionForReplacement.mockResolvedValue({
    ...activePermission(),
    status: "revoked",
    replacedByPermissionId: "perm_replacement"
  });
  mocks.activateStagedReplacementPermission.mockResolvedValue({
    permissionId: "perm_replacement",
    status: "active",
    requiredAuthorityLevel: 40
  });
  mocks.abandonStagedReplacementPermission.mockResolvedValue({ status: "revoked" });
  mocks.auditCreate.mockResolvedValue({});
  mocks.emitWebhookEvent.mockResolvedValue(undefined);
});

describe("replacePermissionForAgent", () => {
  it("successfully stages, revokes, and activates a linked replacement", async () => {
    const result = await replace();

    expect(result).toMatchObject({
      retiredPermissionId: "perm_old",
      retiredStatus: "revoked",
      permissionId: "perm_replacement",
      status: "active",
      idempotencyKey: "idem_1"
    });
    expect(mocks.stageReplacementPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionId: "perm_replacement",
        status: "inactive",
        replacesPermissionId: "perm_old",
        replacementIdempotencyKey: "idem_1",
        requiresApproval: true
      })
    );
    expect(mocks.revokeActivePermissionForReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionId: "perm_old",
        replacementPermissionId: "perm_replacement",
        updatedBy: "user_test"
      })
    );
    expect(mocks.activateStagedReplacementPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionId: "perm_replacement",
        replacesPermissionId: "perm_old"
      })
    );
    expect(mocks.stageReplacementPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revokeActivePermissionForReplacement.mock.invocationCallOrder[0]
    );
    expect(mocks.revokeActivePermissionForReplacement.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.activateStagedReplacementPermission.mock.invocationCallOrder[0]
    );
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toEqual([
      "attempted",
      "completed"
    ]);
    expect(mocks.auditCreate.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      oldPermissionId: "perm_old",
      replacementPermissionId: "perm_replacement"
    });
  });

  it("allows reduced access replacements when the actor has authority over both policies", async () => {
    const result = await replace({
      action: "repo.read",
      resource: "github",
      requiresApproval: true,
      blockedActions: ["write", "delete"]
    });
    expect(result).toMatchObject({
      permissionId: "perm_replacement",
      impact: expect.objectContaining({ reducesAccess: true })
    });
  });

  it("allows expanded access when the actor has authority for the expanded policy", async () => {
    mocks.permissionFindOne.mockResolvedValueOnce(
      activePermission({
        action: "repo.read",
        requiresApproval: true,
        requiredAuthorityLevel: 40
      })
    );
    const result = await replace({
      action: "repo.read",
      resource: "github",
      requiresApproval: false
    });
    expect(result).toMatchObject({
      permissionId: "perm_replacement",
      impact: expect.objectContaining({ expandsAccess: true })
    });
    expect(mocks.stageReplacementPermission).toHaveBeenCalled();
  });

  it("rejects expanded access without authority over the proposed policy", async () => {
    mocks.permissionFindOne.mockResolvedValueOnce(
      activePermission({
        action: "repo.read",
        resource: "github",
        requiredAuthorityLevel: 40,
        constraints: {}
      })
    );
    const result = await replace(
      {
        action: "deploy.production",
        resource: "production",
        requiresApproval: false,
        constraints: {}
      },
      { role: "ENGINEER" }
    );
    expect("error" in result && result.error?.status).toBe(403);
    expect(mocks.stageReplacementPermission).not.toHaveBeenCalled();
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toEqual([
      "attempted",
      "rejected"
    ]);
  });

  it("denies cross-account mutation by scoping agent and permission lookups", async () => {
    mocks.agentFindOne.mockResolvedValueOnce(null);
    const result = await replace({}, { accountId: "acct_other" });
    expect("error" in result && result.error?.status).toBe(404);
    expect(mocks.agentFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_other", agentId: "agent_test" })
    );
    expect(mocks.stageReplacementPermission).not.toHaveBeenCalled();
  });

  it("denies cross-workspace mutation when the permission belongs to another account", async () => {
    mocks.permissionFindOne.mockResolvedValueOnce(null);
    const result = await replace({}, { accountId: "acct_workspace_b" });
    expect("error" in result && result.error?.status).toBe(404);
    expect(mocks.permissionFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_workspace_b", agentId: "agent_test" })
    );
    expect(mocks.revokeActivePermissionForReplacement).not.toHaveBeenCalled();
  });

  it("returns a concurrent conflict when the active revoke CAS misses", async () => {
    mocks.revokeActivePermissionForReplacement.mockResolvedValueOnce(null);
    const result = await replace({
      expectedUpdatedAt: "2026-07-24T12:00:00.000Z"
    });
    expect("error" in result && result.error?.status).toBe(409);
    const body = "error" in result && result.error ? await result.error.json() : null;
    expect(body).toMatchObject({ code: "PERMISSION_REPLACEMENT_CONFLICT" });
    expect(mocks.abandonStagedReplacementPermission).toHaveBeenCalledWith(
      expect.objectContaining({ permissionId: "perm_replacement" })
    );
    expect(mocks.activateStagedReplacementPermission).not.toHaveBeenCalled();
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toEqual([
      "attempted",
      "rejected"
    ]);
  });

  it("is idempotent when the replacement already completed for the same key", async () => {
    mocks.findReplacementByIdempotencyKey.mockResolvedValueOnce({
      permissionId: "perm_replacement",
      agentId: "agent_test",
      status: "active",
      replacesPermissionId: "perm_old",
      requiredAuthorityLevel: 40,
      replacementIdempotencyKey: "idem_1"
    });
    const result = await replace();
    expect(result).toMatchObject({
      permissionId: "perm_replacement",
      retiredPermissionId: "perm_old",
      status: "active"
    });
    expect(mocks.stageReplacementPermission).not.toHaveBeenCalled();
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toContain("completed");
  });

  it("resumes activation after failure between revoke and activation", async () => {
    mocks.findReplacementByIdempotencyKey.mockResolvedValueOnce({
      permissionId: "perm_replacement",
      agentId: "agent_test",
      status: "inactive",
      replacesPermissionId: "perm_old",
      requiredAuthorityLevel: 40,
      replacementIdempotencyKey: "idem_1"
    });
    const result = await replace();
    expect(result).toMatchObject({
      permissionId: "perm_replacement",
      resumed: true,
      status: "active"
    });
    expect(mocks.activateStagedReplacementPermission).toHaveBeenCalled();
    expect(mocks.stageReplacementPermission).not.toHaveBeenCalled();
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toEqual([
      "attempted",
      "completed"
    ]);
  });

  it("leaves access denied and reports interruption when activation fails after revoke", async () => {
    mocks.activateStagedReplacementPermission.mockResolvedValueOnce(null);
    const result = await replace();
    expect("error" in result && result.error?.status).toBe(409);
    const body = "error" in result && result.error ? await result.error.json() : null;
    expect(body).toMatchObject({
      code: "PERMISSION_REPLACEMENT_INTERRUPTED",
      retiredPermissionId: "perm_old",
      replacementPermissionId: "perm_replacement",
      idempotencyKey: "idem_1"
    });
    expect(mocks.auditCreate.mock.calls.map((call) => call[0].type)).toEqual([
      "attempted",
      "interrupted"
    ]);
  });

  it("never activates a second replacement while an active revoke CAS can only win once", async () => {
    mocks.revokeActivePermissionForReplacement
      .mockResolvedValueOnce({
        ...activePermission(),
        status: "revoked",
        replacedByPermissionId: "perm_replacement"
      })
      .mockResolvedValueOnce(null);

    const first = await replace({ idempotencyKey: "idem_a" });
    expect(first).toMatchObject({ permissionId: "perm_replacement", status: "active" });

    mocks.findReplacementByIdempotencyKey.mockResolvedValueOnce(null);
    mocks.stageReplacementPermission.mockResolvedValueOnce({});
    const second = await replace({ idempotencyKey: "idem_b" });
    expect("error" in second && second.error?.status).toBe(409);
    expect(mocks.activateStagedReplacementPermission).toHaveBeenCalledTimes(1);
    expect(mocks.abandonStagedReplacementPermission).toHaveBeenCalledTimes(1);
  });

  it("links old and replacement ids across audit completed metadata", async () => {
    await replace();
    const completed = mocks.auditCreate.mock.calls.find((call) => call[0].type === "completed")?.[0];
    expect(completed).toMatchObject({
      oldPermissionId: "perm_old",
      replacementPermissionId: "perm_replacement",
      metadata: expect.objectContaining({
        oldPermissionId: "perm_old",
        replacementPermissionId: "perm_replacement"
      })
    });
  });

  it("blocks viewers before reading or mutating permissions", async () => {
    const result = await replace({}, { role: "VIEWER" });
    expect("error" in result && result.error?.status).toBe(403);
    expect(mocks.agentFindOne).not.toHaveBeenCalled();
    expect(mocks.permissionFindOne).not.toHaveBeenCalled();
    expect(mocks.stageReplacementPermission).not.toHaveBeenCalled();
  });
});
