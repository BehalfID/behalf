/**
 * Approval intent binding: fingerprints, pending identity, grant matching,
 * preview redaction, and missing-target denial.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVAL_PREVIEW_MAX_LENGTH,
  APPROVAL_TARGET_REQUIRED_REASON,
  buildApprovalIntent,
  canonicalizeFilePathForApproval,
  fingerprintApprovalIntent
} from "@/lib/approvalIntent";
import { redactSecrets } from "@/lib/secretRedaction";
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
  default: { updateOne: modelMocks.agentUpdateOne }
}));

vi.mock("@/models/VerificationLog", () => ({
  default: { create: modelMocks.verificationLogCreate }
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

function pendingCall() {
  return modelMocks.approvalRequestFindOneAndUpdate.mock.calls.find(
    (call) => call[0]?.status === "pending"
  );
}

function consumeCall() {
  return modelMocks.approvalRequestFindOneAndUpdate.mock.calls.find(
    (call) => call[0]?.status === "approved"
  );
}

function commandRequest(command: string, overrides: Record<string, unknown> = {}) {
  return verificationRequestFixture({
    action: "execute_command",
    vendor: undefined,
    amount: undefined,
    policyContext: { toolInput: { command } },
    ...overrides
  });
}

function fileRequest(filePath: string, overrides: Record<string, unknown> = {}) {
  return verificationRequestFixture({
    action: "write_file",
    vendor: undefined,
    amount: undefined,
    policyContext: {
      cwd: "/workspace/project",
      toolInput: { filePath },
      ...(typeof overrides.policyContext === "object" && overrides.policyContext
        ? (overrides.policyContext as object)
        : {})
    },
    ...overrides,
    policyContext: {
      cwd: "/workspace/project",
      toolInput: { filePath },
      ...((overrides.policyContext as object | undefined) ?? {})
    }
  });
}

describe("approval intent fingerprints", () => {
  it("same command produces the same fingerprint", () => {
    const a = buildApprovalIntent({ action: "execute_command", command: "npm test" });
    const b = buildApprovalIntent({ action: "execute_command", command: "npm test" });
    expect(a?.fingerprint).toBe(b?.fingerprint);
    expect(a?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different commands produce different fingerprints", () => {
    const a = buildApprovalIntent({ action: "execute_command", command: "npm test" });
    const b = buildApprovalIntent({ action: "execute_command", command: "rm -rf /tmp/project" });
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });

  it("exact command whitespace changes produce different fingerprints", () => {
    const a = buildApprovalIntent({ action: "execute_command", command: "npm test" });
    const b = buildApprovalIntent({ action: "execute_command", command: " npm test" });
    const c = buildApprovalIntent({ action: "execute_command", command: "npm test && npm run deploy" });
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
    expect(a?.fingerprint).not.toBe(c?.fingerprint);
  });

  it("relative and equivalent absolute paths produce the same fingerprint when cwd is supplied", () => {
    const relative = buildApprovalIntent({
      action: "read_file",
      filePath: "src/index.ts",
      cwd: "/workspace/project"
    });
    const absolute = buildApprovalIntent({
      action: "read_file",
      filePath: "/workspace/project/src/index.ts",
      cwd: "/workspace/project"
    });
    expect(relative?.canonicalValue).toBe("/workspace/project/src/index.ts");
    expect(relative?.fingerprint).toBe(absolute?.fingerprint);
  });

  it("different normalized file paths produce different fingerprints", () => {
    const a = buildApprovalIntent({
      action: "write_file",
      filePath: "/workspace/project/src/index.ts"
    });
    const b = buildApprovalIntent({
      action: "write_file",
      filePath: "/workspace/project/src/admin.ts"
    });
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });

  it(".. normalization cannot disguise a different target", () => {
    const disguised = canonicalizeFilePathForApproval(
      "/workspace/project/src/../admin.ts",
      "/workspace/project"
    );
    const index = canonicalizeFilePathForApproval("src/index.ts", "/workspace/project");
    expect(disguised).toBe("/workspace/project/admin.ts");
    expect(disguised).not.toBe(index);
    expect(fingerprintApprovalIntent("file_path", disguised!)).not.toBe(
      fingerprintApprovalIntent("file_path", index!)
    );
  });

  it("fingerprint uses stable versioned JSON + sha256 hex", () => {
    const expected = createHash("sha256")
      .update(JSON.stringify({ version: 1, kind: "command", value: "npm test" }), "utf8")
      .digest("hex");
    expect(fingerprintApprovalIntent("command", "npm test")).toBe(expected);
  });
});

describe("approval intent preview security", () => {
  it("redacts bearer tokens and BehalfID key formats", () => {
    expect(redactSecrets("Authorization: Bearer abc.def_ghi=")).toContain("Bearer [redacted]");
    expect(redactSecrets("key=bhf_sk_abcdefghijklmnopqrstuvwxyz")).toContain("bhf_sk_[redacted]");
    expect(redactSecrets("tok=bhf_dev_abcdefghijklmnopqrstuvwxyz")).toContain("bhf_dev_[redacted]");
    expect(redactSecrets("pass=bhf_pass_abcdefghijklmnopqrstuvwxyz")).toContain("bhf_pass_[redacted]");
    expect(redactSecrets("secret=whsec_abcdefghijklmnopqrstuvwxyz")).toContain("whsec_[redacted]");
  });

  it("truncates long previews but fingerprints the complete value", () => {
    const long = `echo ${"x".repeat(APPROVAL_PREVIEW_MAX_LENGTH + 50)}`;
    const intent = buildApprovalIntent({ action: "execute_command", command: long });
    expect(intent?.previewTruncated).toBe(true);
    expect(intent?.preview.length).toBe(APPROVAL_PREVIEW_MAX_LENGTH);
    expect(intent?.fingerprint).toBe(fingerprintApprovalIntent("command", long));
    expect(intent?.canonicalValue).toBe(long);
  });
});

describe("bound approval gate", () => {
  beforeEach(() => {
    mockPermissions([
      permissionFixture({ action: "execute_command", requiresApproval: true })
    ]);
    modelMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.permissionUpdateOne.mockResolvedValue({ matchedCount: 1 });
    modelMocks.verificationLogCreate.mockResolvedValue({});
    modelMocks.approvalRequestFindOne.mockResolvedValue(null);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    modelMocks.approvalRequestUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("reuses the same pending approval for an exact repeated command", async () => {
    const intent = buildApprovalIntent({ action: "execute_command", command: "npm test" })!;
    modelMocks.approvalRequestFindOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ approvalId: "apr_cmd", argumentFingerprint: intent.fingerprint });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(commandRequest("npm test"));
    expect(decision.approvalRequired).toBe(true);
    expect(pendingCall()?.[0]).toEqual(expect.objectContaining({
      action: "execute_command",
      argumentFingerprint: intent.fingerprint,
      status: "pending"
    }));
    expect(pendingCall()?.[1].$setOnInsert).toEqual(expect.objectContaining({
      argumentKind: "command",
      argumentFingerprint: intent.fingerprint,
      argumentPreview: "npm test",
      argumentPreviewTruncated: false
    }));
    expect(JSON.stringify(pendingCall())).not.toContain("policyContext");
  });

  it("creates a separate pending approval for a different command", async () => {
    const { verifyAction } = await import("@/lib/verify");
    await verifyAction(commandRequest("npm test"));
    await verifyAction(commandRequest("rm -rf /tmp/project"));

    const pendingFilters = modelMocks.approvalRequestFindOneAndUpdate.mock.calls
      .filter((call) => call[0]?.status === "pending")
      .map((call) => call[0].argumentFingerprint);
    expect(new Set(pendingFilters).size).toBe(2);
  });

  it("creates a separate pending approval for a different file path", async () => {
    mockPermissions([permissionFixture({ action: "write_file", requiresApproval: true })]);
    const { verifyAction } = await import("@/lib/verify");
    await verifyAction(fileRequest("src/index.ts"));
    await verifyAction(fileRequest("src/admin.ts"));

    const pendingFilters = modelMocks.approvalRequestFindOneAndUpdate.mock.calls
      .filter((call) => call[0]?.status === "pending")
      .map((call) => call[0].argumentFingerprint);
    expect(new Set(pendingFilters).size).toBe(2);
  });

  it("denies missing command/path without creating an approval", async () => {
    const { verifyAction } = await import("@/lib/verify");
    const decision = await verifyAction(
      verificationRequestFixture({
        action: "execute_command",
        vendor: undefined,
        amount: undefined,
        policyContext: {}
      })
    );

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: APPROVAL_TARGET_REQUIRED_REASON,
      risk: "high"
    }));
    expect(decision.approvalRequired).toBeFalsy();
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("approved npm test grant allows only npm test", async () => {
    const intent = buildApprovalIntent({ action: "execute_command", command: "npm test" })!;
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValueOnce({
      approvalId: "apr_npm",
      action: "execute_command",
      argumentFingerprint: intent.fingerprint,
      status: "approved",
      grantExpiresAt: new Date(Date.now() + 60_000)
    });
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(commandRequest("npm test"));
    expect(decision.allowed).toBe(true);
    expect(consumeCall()?.[0].argumentFingerprint).toBe(intent.fingerprint);
    expect(consumeCall()?.[1]).toEqual({ $set: { status: "used", usedAt: expect.any(Date) } });
  });

  it("approved npm test grant does not allow rm -rf", async () => {
    // Consume query uses rm fingerprint — mock returns null (no matching grant)
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(commandRequest("rm -rf /tmp/project"));
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    const npmFp = buildApprovalIntent({ action: "execute_command", command: "npm test" })!.fingerprint;
    expect(pendingCall()?.[0].argumentFingerprint).not.toBe(npmFp);
  });

  it("approved path A does not allow path B", async () => {
    mockPermissions([permissionFixture({ action: "write_file", requiresApproval: true })]);
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(fileRequest("src/admin.ts"));
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
  });

  it("legacy unbound grant does not satisfy a bound request", async () => {
    // Query requires argumentFingerprint — unbound grant cannot match
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValue(null);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(commandRequest("npm test"));
    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(consumeCall()?.[0]).toEqual(expect.objectContaining({
      argumentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: "approved"
    }));
  });

  it("hard constraints are still evaluated before the approval grant", async () => {
    mockPermissions([
      permissionFixture({
        action: "execute_command",
        requiresApproval: true,
        constraints: { deniedCommands: ["rm -rf"] }
      })
    ]);
    const { verifyAction } = await import("@/lib/verify");

    const decision = await verifyAction(commandRequest("rm -rf /tmp/project"));
    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      reason: "command_blocked"
    }));
    expect(modelMocks.approvalRequestFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("consumption uses one conditional atomic database operation", async () => {
    const intent = buildApprovalIntent({ action: "execute_command", command: "npm test" })!;
    modelMocks.approvalRequestFindOneAndUpdate.mockResolvedValueOnce({
      approvalId: "apr_npm",
      argumentFingerprint: intent.fingerprint,
      status: "approved"
    });
    const { verifyAction } = await import("@/lib/verify");
    await verifyAction(commandRequest("npm test"));

    expect(modelMocks.approvalRequestFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(modelMocks.approvalRequestUpdateOne).not.toHaveBeenCalled();
    expect(modelMocks.approvalRequestFindOne).not.toHaveBeenCalled();
    expect(consumeCall()?.[2]).toEqual({ returnDocument: "before" });
  });

  it("a second retry does not consume the same grant", async () => {
    const intent = buildApprovalIntent({ action: "execute_command", command: "npm test" })!;
    modelMocks.approvalRequestFindOneAndUpdate
      .mockResolvedValueOnce({
        approvalId: "apr_npm",
        argumentFingerprint: intent.fingerprint,
        status: "approved"
      })
      .mockResolvedValueOnce(null) // second consume misses
      .mockResolvedValueOnce({ approvalId: "apr_new" }); // pending upsert

    const { verifyAction } = await import("@/lib/verify");
    const first = await verifyAction(commandRequest("npm test"));
    const second = await verifyAction(commandRequest("npm test"));

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.approvalRequired).toBe(true);
  });
});
