import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionFixture, verificationRequestFixture } from "./fixtures";

const modelMocks = vi.hoisted(() => ({
  permissionFind: vi.fn(),
  permissionUpdateOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  verificationLogCreate: vi.fn(),
  approvalRequestFindOne: vi.fn(),
  approvalRequestFindOneAndUpdate: vi.fn(),
  approvalRequestUpdateOne: vi.fn()
}));

vi.mock("@/models/Permission", () => ({
  default: {
    find: modelMocks.permissionFind,
    updateOne: modelMocks.permissionUpdateOne
  }
}));

vi.mock("@/models/Agent", () => ({
  default: {
    updateOne: modelMocks.agentUpdateOne
  }
}));

vi.mock("@/models/VerificationLog", () => ({
  default: {
    create: modelMocks.verificationLogCreate
  }
}));

vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    findOne: modelMocks.approvalRequestFindOne,
    findOneAndUpdate: modelMocks.approvalRequestFindOneAndUpdate,
    updateOne: modelMocks.approvalRequestUpdateOne
  },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000
}));

function mockPermissions(permissions: unknown[]) {
  modelMocks.permissionFind.mockReturnValue({
    sort: vi.fn().mockResolvedValue(permissions)
  });
}

describe("verifyAction permission decisions", () => {
  beforeEach(() => {
    mockPermissions([permissionFixture()]);
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    // Default: no approved grant exists; pending upsert succeeds
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("allows an active matching permission and writes a verification log", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.risk).toBe("low");
    expect(decision.requestId).toMatch(/^req_/);
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: decision.requestId,
        agentId: "agent_test",
        permissionId: "perm_test",
        allowed: true,
        reason: "Action allowed by active permission."
      })
    );
  });

  it("denies disabled agents", async () => {
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ agentStatus: "disabled" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Agent is disabled.",
      risk: "high"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false })
    );
  });

  it("denies when no active permission matches", async () => {
    mockPermissions([]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("No active permission exists for this action.");
  });

  it("denies revoked and expired permissions", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ status: "revoked" })]);
    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has been revoked." })
    );

    mockPermissions([
      permissionFixture({ constraints: { expiresAt: new Date(Date.now() - 1_000) } })
    ]);
    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has expired." })
    );
  });

  it("does not let revoked or expired newer records shadow an older active permission", async () => {
    mockPermissions([
      permissionFixture({ permissionId: "perm_revoked", status: "revoked" }),
      permissionFixture({ permissionId: "perm_active", status: "active" })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision.allowed).toBe(true);
    expect(decision.permissionId).toBe("perm_active");
  });

  it("enforces blockedActions before allowedActions", async () => {
    mockPermissions([
      permissionFixture({
        action: "email",
        allowedActions: ["send email"],
        blockedActions: ["send email"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Action is blocked by this permission.");
  });

  it("denies when any active permission blocks an action another active permission allows", async () => {
    mockPermissions([
      permissionFixture({
        permissionId: "perm_block",
        action: "email",
        blockedActions: ["send email"]
      }),
      permissionFixture({
        permissionId: "perm_allow",
        action: "send email"
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      permissionId: "perm_block",
      reason: "Action is blocked by this permission."
    }));
  });

  it("denies blocked actions regardless of permission ordering", async () => {
    mockPermissions([
      permissionFixture({
        permissionId: "perm_newer_allow",
        action: "send email",
        createdAt: new Date("2026-02-01T00:00:00.000Z")
      }),
      permissionFixture({
        permissionId: "perm_older_block",
        action: "email",
        blockedActions: ["send email"],
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      permissionId: "perm_older_block",
      reason: "Action is blocked by this permission."
    }));
  });

  it("allows only explicit sub-actions when allowedActions are used", async () => {
    mockPermissions([
      permissionFixture({ action: "email", allowedActions: ["read labels"] })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(verifyAction(verificationRequestFixture({ action: "read labels" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ action: "email", allowedActions: ["read labels"] })]);
    await expect(verifyAction(verificationRequestFixture({ action: "send email" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "No active permission exists for this action."
      })
    );
  });

  it("denies the parent action when allowedActions narrows the permission", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["read email messages"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "access_data" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is not included in allowedActions."
    }));
  });

  it("allows a listed allowedAction when allowedActions narrows the permission", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["read email messages"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "read email messages" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      permissionId: "perm_test"
    }));
  });

  it("keeps blockedActions authoritative over listed allowedActions", async () => {
    mockPermissions([
      permissionFixture({
        action: "access_data",
        allowedActions: ["send email"],
        blockedActions: ["send email"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "send email" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is blocked by this permission."
    }));
  });

  it("denies mismatched action, resource, vendor, and over-limit amount", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([]);
    await expect(verifyAction(verificationRequestFixture({ action: "wire_money" }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "No active permission exists for this action." })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Resource does not match permission resource." })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "amazon.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "evil.example" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: 100 }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: 101 }))).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Amount exceeds maxAmount constraint." })
    );
  });

  it("matches resource constraints against exact and comma-separated vendor values", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "gmail.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "gmail.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "stripe.com" }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });

  it("enforces allowedVendors and missing vendor/resource inputs fail closed", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["gmail.com", "slack.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: "slack.com" }))).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["gmail.com", "slack.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com, slack.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });

  it("denies approval-gated permissions without allowing execution", async () => {
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      risk: "medium"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false, approvalRequired: true })
    );
    // Should have upserted a pending ApprovalRequest scoped to the exact request
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_test",
        permissionId: "perm_test",
        action: "purchase",
        vendor: "amazon.com",
        amount: 25,
        argumentFingerprint: null,
        status: "pending"
      }),
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ approvalId: expect.stringMatching(/^apr_/) }) }),
      { upsert: true, returnDocument: "after" }
    );
  });

  it("allows execution when an approved grant exists for the permission", async () => {
    const now = new Date();
    const grantExpiresAt = new Date(now.getTime() + 25 * 60 * 1_000);
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValueOnce({
      approvalId: "apr_test",
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      argumentFingerprint: null,
      status: "approved",
      grantExpiresAt
    });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      approvalRequired: false,
      reason: "Action allowed by approved permission grant.",
      risk: "low"
    }));
    // Grant should be atomically consumed (status used + usedAt)
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_test",
        permissionId: "perm_test",
        action: "purchase",
        vendor: "amazon.com",
        amount: 25,
        argumentFingerprint: null,
        status: "approved"
      }),
      { $set: { status: "used", usedAt: expect.any(Date) } },
      { returnDocument: "before" }
    );
  });

  it("fails closed when permission lookup throws", async () => {
    modelMocks.permissionFind.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Verification failed closed during permission lookup.",
      risk: "high"
    }));
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: false })
    );
  });

  it("does not let last-used update failures block verification or leak raw keys", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    modelMocks.agentUpdateOne.mockRejectedValue(new Error("failed for bhf_sk_super_secret_value"));
    const { verifyAction } = await import("@/lib/verify");

    await expect(verifyAction(verificationRequestFixture())).resolves.toEqual(
      expect.objectContaining({ allowed: true })
    );
    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: true })
    );
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("bhf_sk_super_secret_value");
    expect(JSON.stringify(consoleSpy.mock.calls)).toContain("bhf_sk_[redacted]");
    consoleSpy.mockRestore();
  });

  it("fails closed when constrained amount or vendor inputs are missing", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([permissionFixture({ constraints: { maxAmount: 100 } })]);
    await expect(verifyAction(verificationRequestFixture({ amount: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "amount is required for permissions with a maxAmount constraint."
      })
    );

    mockPermissions([permissionFixture({ constraints: { allowedVendors: ["amazon.com"] } })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    mockPermissions([permissionFixture({ resource: "gmail.com" })]);
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Resource does not match permission resource."
      })
    );
  });
});

describe("argument-level constraints (path and command)", () => {
  beforeEach(() => {
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
  });

  it("allows write_file when path matches an allowedPaths glob", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**", "tests/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: "src/foo/bar.ts" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("denies write_file when path does not match allowedPaths", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**", "tests/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: "~/.ssh/id_rsa" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });

  it("denies write_file when path matches a deniedPaths glob", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { deniedPaths: ["~/.ssh/**", "**/.env", "**/credentials/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    for (const badPath of ["~/.ssh/id_rsa", ".env", "config/.env", "secrets/credentials/key.json"]) {
      mockPermissions([
        permissionFixture({
          action: "write_file",
          constraints: { deniedPaths: ["~/.ssh/**", "**/.env", "**/credentials/**"] }
        })
      ]);
      await expect(
        verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: badPath } }))
      ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
    }
  });

  it("allows write_file to a safe path when deniedPaths is set", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { deniedPaths: ["~/.ssh/**", "**/.env"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: "src/main.ts" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("extracts file path from metadata.path as fallback", async () => {
    mockPermissions([
      permissionFixture({
        action: "read_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "read_file", metadata: { path: "src/index.ts" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("denies read_file with no metadata when allowedPaths is set", async () => {
    mockPermissions([
      permissionFixture({
        action: "read_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "read_file", metadata: {} }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });

  it("denies execute_command when command contains a deniedCommands substring", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf", "curl", "wget"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "execute_command", metadata: { tool_input: "rm -rf /tmp/foo" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "command_blocked" }));

    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf", "curl", "wget"] }
      })
    ]);
    await expect(
      verifyAction(verificationRequestFixture({ action: "execute_command", metadata: { tool_input: "curl https://evil.example" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "command_blocked" }));
  });

  it("allows execute_command when no deniedCommands substring matches", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf", "curl"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "execute_command", metadata: { tool_input: "ls -la src/" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("extracts command from metadata.command as fallback", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "execute_command", metadata: { command: "rm -rf /" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "command_blocked" }));
  });

  it("skips path checks for non-file actions even when allowedPaths is set", async () => {
    mockPermissions([
      permissionFixture({
        action: "purchase",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "purchase" }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("skips command checks for non-execute actions even when deniedCommands is set", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { deniedCommands: ["rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: "src/foo.ts" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("argument denies are hard constraints — not bypassable by approval", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        requiresApproval: true,
        constraints: { deniedPaths: ["~/.ssh/**"] }
      })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue({
      approvalId: "apr_granted",
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "write_file",
      vendor: null,
      amount: null,
      status: "approved",
      grantExpiresAt: new Date(Date.now() + 20 * 60 * 1_000)
    });
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(verificationRequestFixture({ action: "write_file", metadata: { tool_input: "~/.ssh/id_rsa" } }))
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("evaluates nested metadata.tool_input.file_path", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          metadata: { tool_input: { file_path: "src/index.ts" } }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("evaluates nested camelCase policyContext.toolInput.filePath", async () => {
    mockPermissions([
      permissionFixture({
        action: "read_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "read_file",
          policyContext: {
            source: "claude_code",
            cwd: "/repo",
            toolInput: { filePath: "/repo/src/index.ts" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("evaluates nested metadata.tool_input.command", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "execute_command",
          metadata: { tool_input: { command: "rm -rf /tmp" } }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "command_blocked" }));
  });

  it("matches an absolute file path against a relative allowed glob using cwd", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          policyContext: {
            cwd: "/workspace/project",
            toolInput: { filePath: "/workspace/project/src/index.ts" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("matches Windows path separators against slash-based patterns", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          policyContext: {
            cwd: "C:\\work\\project",
            toolInput: { filePath: "C:\\work\\project\\src\\index.ts" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("normalizes .. so a path cannot escape an allowed directory", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"], deniedPaths: ["**/.env"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          policyContext: {
            cwd: "/workspace/project",
            toolInput: { filePath: "/workspace/project/src/../.env" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });

  it("matches a home-absolute path against a ~/ denied glob", async () => {
    mockPermissions([
      permissionFixture({
        action: "read_file",
        constraints: { deniedPaths: ["~/.ssh/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "read_file",
          policyContext: {
            home: "/Users/alice",
            toolInput: { filePath: "/Users/alice/.ssh/id_rsa" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });

  it("lets deniedPaths win over allowedPaths", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"], deniedPaths: ["src/secrets/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          metadata: { tool_input: "src/secrets/key.pem" }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });

  it("ignores empty deniedCommands entries", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["", "   ", "rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "execute_command",
          metadata: { tool_input: { command: "ls -la" } }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("denies compound commands containing a denied literal substring", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        constraints: { deniedCommands: ["rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "execute_command",
          policyContext: {
            toolInput: { command: "npm test && rm -rf /tmp/build" }
          }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "command_blocked" }));
  });

  it("does not persist policyContext into VerificationLog.metadata", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await verifyAction(
      verificationRequestFixture({
        action: "write_file",
        metadata: { note: "caller-supplied" },
        policyContext: {
          source: "claude_code",
          cwd: "/repo",
          toolInput: { filePath: "/repo/src/a.ts" }
        }
      })
    );

    expect(modelMocks.verificationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { note: "caller-supplied" }
      })
    );
    const created = modelMocks.verificationLogCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created).not.toHaveProperty("policyContext");
    expect(JSON.stringify(created.metadata)).not.toContain("filePath");
  });

  it("does not treat nested tool_input objects as flat path/command strings", async () => {
    mockPermissions([
      permissionFixture({
        action: "write_file",
        constraints: { allowedPaths: ["src/**"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    // Object without a recognizable path field must fail closed — never String(object).
    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "write_file",
          metadata: { tool_input: { unrelated: true } }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "path_not_permitted" }));
  });
});

describe("Stage 5 context constraints (branch/environment/repository)", () => {
  beforeEach(() => {
    mockPermissions([permissionFixture()]);
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("allows when branch matches allowedBranches glob", async () => {
    mockPermissions([
      permissionFixture({
        action: "git.commit",
        requiresApproval: false,
        constraints: { allowedBranches: ["feature/*"], deniedBranches: ["main"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "git.commit",
          metadata: { branch: "feature/login" }
        })
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("denies when branch is blocked by deniedBranches", async () => {
    mockPermissions([
      permissionFixture({
        action: "git.commit",
        requiresApproval: false,
        constraints: { deniedBranches: ["main", "master"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "git.commit",
          metadata: { branch: "main" }
        })
      )
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Branch is blocked by deniedBranches constraint."
      })
    );
  });

  it("denies when environment is outside allowedEnvironments", async () => {
    mockPermissions([
      permissionFixture({
        action: "deploy",
        requiresApproval: false,
        constraints: { allowedEnvironments: ["staging", "preview"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    await expect(
      verifyAction(
        verificationRequestFixture({
          action: "deploy",
          metadata: { environment: "production" }
        })
      )
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Environment is not included in allowedEnvironments constraint."
      })
    );
  });
});

describe("approval grants never bypass hard constraints", () => {
  function matchingGrant(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      approvalId: "apr_granted",
      agentId: "agent_test",
      permissionId: "perm_test",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      status: "approved",
      grantExpiresAt: new Date(Date.now() + 20 * 60 * 1_000),
      ...overrides
    };
  }

  beforeEach(() => {
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    // An approved grant always "exists" in these tests; hard constraints must
    // still deny before the approval gate is ever consulted.
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant());
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("creates a pending approval for an under-maxAmount purchase that requires approval", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, constraints: { maxAmount: 100 } })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ amount: 25 }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "purchase", amount: 25, status: "pending" }),
      expect.anything(),
      { upsert: true, returnDocument: "after" }
    );
  });

  it("still enforces maxAmount when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, constraints: { maxAmount: 100 } })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant({ amount: 250 }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ amount: 250 }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Amount exceeds maxAmount constraint."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
  });

  it("still enforces allowedVendors when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, constraints: { allowedVendors: ["amazon.com"] } })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant({ vendor: "evil.example" }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ vendor: "evil.example" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Vendor is not included in allowedVendors constraint."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
  });

  it("still enforces blockedActions when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, blockedActions: ["purchase"] })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is blocked by this permission."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still denies revoked permissions when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, status: "revoked" })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Permission has been revoked."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still denies expired permissions when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({
        requiresApproval: true,
        constraints: { expiresAt: new Date(Date.now() - 1_000) }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture());

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Permission has expired."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still denies disabled agents when an approved grant exists", async () => {
    mockPermissions([permissionFixture({ requiresApproval: true })]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ agentStatus: "disabled" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Agent is disabled."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still denies actions outside allowedActions when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({
        action: "purchase",
        requiresApproval: true,
        allowedActions: ["purchase books"]
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ action: "purchase" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is not included in allowedActions."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still denies resource mismatches when an approved grant exists", async () => {
    mockPermissions([
      permissionFixture({ requiresApproval: true, resource: "gmail.com" })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant({ vendor: "slack.com" }));
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(verificationRequestFixture({ vendor: "slack.com" }));

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Resource does not match permission resource."
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still fails closed on missing constrained amount/vendor when an approved grant exists", async () => {
    const { verifyAction } = await import("@/lib/verify");

    mockPermissions([
      permissionFixture({ requiresApproval: true, constraints: { maxAmount: 100 } })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant({ amount: null }));
    await expect(verifyAction(verificationRequestFixture({ amount: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "amount is required for permissions with a maxAmount constraint."
      })
    );

    mockPermissions([
      permissionFixture({ requiresApproval: true, constraints: { allowedVendors: ["amazon.com"] } })
    ]);
    modelMocks.approvalRequestFindOne.mockResolvedValue(matchingGrant({ vendor: null }));
    await expect(verifyAction(verificationRequestFixture({ vendor: undefined }))).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint."
      })
    );

    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
