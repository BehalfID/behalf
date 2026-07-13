/**
 * Mongo integration: the Antigravity PreToolUse gate driving the REAL
 * BehalfID verification, approval-intent, and atomic grant-consumption code.
 *
 * Unlike test/cli-antigravity-hook.test.ts (which mocks verification
 * responses), these tests wire runAntigravityHook's verify dependency to the
 * real verifyAction against the shared integration MongoMemoryServer, so the
 * approval integrity properties are exercised end-to-end:
 *
 *   hook payload → tool/argument normalization → policyContext →
 *   verifyAction → approval intent fingerprint → ApprovalRequest →
 *   atomic single-use grant consumption → VerificationLog
 *
 * The HTTP wrappers (route auth, body validation) are covered separately by
 * test/api-verify-route.test.ts and test/dashboard-approvals-route.test.ts;
 * the self-approval rule is the real canApproveRequest used by the approve
 * route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApprovalIntent } from "@/lib/approvalIntent";
import { canApproveRequest } from "@/lib/delegatedAuth";
import { AUTHORITY_LEVELS } from "@/lib/authority";
import { verifyAction, type PolicyContext } from "@/lib/verify";
import ApprovalRequest, { APPROVAL_GRANT_TTL_MS } from "@/models/ApprovalRequest";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { runAntigravityHook, type AntigravityHookDeps } from "../../packages/cli/src/commands/hook";
import { permissionFixture } from "../fixtures";

type GateVerify = NonNullable<AntigravityHookDeps["verify"]>;

vi.mock("@/lib/auth", () => ({
  recordAgentKeyUse: vi.fn()
}));

function collector() {
  let text = "";
  return {
    sink: { write: (chunk: string | Uint8Array) => { text += String(chunk); return true; } },
    get text() { return text; },
  };
}

/** Bridge the gate to the real server-side verification (auth resolved as the route would). */
function realVerify(lastBody?: { current?: Record<string, unknown> }): GateVerify {
  return async (body: Record<string, unknown>) => {
    if (lastBody) lastBody.current = body;
    return verifyAction({
      agentId: body.agentId as string,
      accountId: "acct_test",
      developerUserId: "dev_test",
      agentStatus: "active",
      action: body.action as string,
      vendor: body.vendor as string | undefined,
      policyContext: body.policyContext as PolicyContext | undefined
    });
  };
}

async function runGate(payload: Record<string, unknown>, verify: GateVerify) {
  const out = collector();
  const err = collector();
  const code = await runAntigravityHook({
    stdin: async () => JSON.stringify(payload),
    stdout: out.sink,
    stderr: err.sink,
    verify,
    enforcement: "required",
  });
  return { code, out, err };
}

const DEPLOY_PAYLOAD = {
  tool_name: "run_command",
  tool_input: { command: "npm run deploy" },
};

beforeEach(async () => {
  vi.stubEnv("BEHALFID_AGENT_ID", "agent_test");
  vi.stubEnv("BEHALFID_API_KEY", "bhf_sk_integration_test");
  await Permission.create(
    permissionFixture({
      action: "execute_command",
      requiresApproval: true
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Antigravity gate against real approval integrity (mongo)", () => {
  it("creates a pending approval bound to the exact normalized command", async () => {
    const verify = realVerify();
    const { code, out, err } = await runGate(DEPLOY_PAYLOAD, verify);

    expect(code).toBe(2);
    expect(JSON.parse(out.text).decision).toBe("deny");
    expect(err.text).toMatch(/approval required/i);

    const pending = await ApprovalRequest.findOne({ status: "pending" }).lean();
    expect(pending).toBeTruthy();
    expect(pending?.action).toBe("execute_command");
    expect(pending?.argumentKind).toBe("command");
    expect(pending?.argumentPreview).toBe("npm run deploy");
    const expected = buildApprovalIntent({ action: "execute_command", command: "npm run deploy" })!;
    expect(pending?.argumentFingerprint).toBe(expected.fingerprint);
    expect(typeof pending?.requiredAuthorityLevel).toBe("number");

    const logs = await VerificationLog.find({}).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].allowed).toBe(false);
    expect(logs[0].approvalRequired).toBe(true);
  });

  it("binds file-write approvals to the canonicalized path fingerprint", async () => {
    await Permission.create(
      permissionFixture({
        permissionId: "perm_write",
        action: "write_file",
        requiresApproval: true
      })
    );
    const lastBody: { current?: Record<string, unknown> } = {};
    const verify = realVerify(lastBody);

    const { code } = await runGate(
      { tool_name: "write_to_file", tool_input: { file_path: "src/a.ts", content: "X" }, cwd: "/repo" },
      verify
    );
    expect(code).toBe(2);

    const pending = await ApprovalRequest.findOne({ status: "pending", action: "write_file" }).lean();
    expect(pending?.argumentKind).toBe("file_path");
    // Fingerprint must match the real canonicalization of exactly what the
    // gate forwarded (relative path + cwd/home context).
    const ctx = lastBody.current?.policyContext as { cwd?: string; home?: string; toolInput?: { filePath?: string } };
    const expected = buildApprovalIntent({
      action: "write_file",
      filePath: ctx.toolInput?.filePath,
      cwd: ctx.cwd,
      home: ctx.home
    })!;
    expect(pending?.argumentFingerprint).toBe(expected.fingerprint);
    expect(pending?.argumentPreview).toBe("/repo/src/a.ts");
  });

  it("blocks self-approval by the requesting user via the real approve rule", async () => {
    await runGate(DEPLOY_PAYLOAD, realVerify());
    const pending = await ApprovalRequest.findOne({ status: "pending" }).lean();
    expect(pending).toBeTruthy();

    const requester = {
      userId: "dev_test",
      accountId: "acct_test",
      role: "OWNER" as const,
      authorityLevel: AUTHORITY_LEVELS.OWNER
    };
    const otherApprover = { ...requester, userId: "dev_approver" };

    // The requester cannot approve their own request, even as OWNER.
    expect(canApproveRequest(requester, pending!)).toBe(false);
    expect(canApproveRequest(otherApprover, pending!)).toBe(true);
  });

  it("allows exactly one identical retry after approval, then requires approval again", async () => {
    const verify = realVerify();

    // 1. First attempt: blocked, pending approval created.
    expect((await runGate(DEPLOY_PAYLOAD, verify)).code).toBe(2);
    const pending = await ApprovalRequest.findOne({ status: "pending" }).lean();

    // 2. A different user approves — same guarded transition the approve
    //    route performs (pending → approved with a grant expiry).
    const updated = await ApprovalRequest.updateOne(
      { approvalId: pending!.approvalId, status: "pending" },
      {
        $set: {
          status: "approved",
          resolvedBy: "dev_approver",
          resolvedAt: new Date(),
          grantExpiresAt: new Date(Date.now() + APPROVAL_GRANT_TTL_MS)
        }
      }
    );
    expect(updated.matchedCount).toBe(1);

    // 3. Identical retry consumes the single-use grant and is allowed.
    const retry = await runGate(DEPLOY_PAYLOAD, verify);
    expect(retry.code).toBe(0);
    expect(JSON.parse(retry.out.text)).toEqual({});

    const consumed = await ApprovalRequest.findOne({ approvalId: pending!.approvalId }).lean();
    expect(consumed?.status).toBe("used");
    expect(consumed?.usedAt).toBeInstanceOf(Date);

    // 4. A second identical retry finds no grant: blocked, new pending request.
    const second = await runGate(DEPLOY_PAYLOAD, verify);
    expect(second.code).toBe(2);
    expect(second.err.text).toMatch(/approval required/i);
    const newPending = await ApprovalRequest.findOne({ status: "pending" }).lean();
    expect(newPending?.approvalId).not.toBe(pending!.approvalId);
    expect(newPending?.argumentFingerprint).toBe(pending!.argumentFingerprint);
  });

  it("rejects a retry with a different command: intent mismatch, grant not consumed", async () => {
    const verify = realVerify();

    expect((await runGate(DEPLOY_PAYLOAD, verify)).code).toBe(2);
    const pending = await ApprovalRequest.findOne({ status: "pending" }).lean();
    await ApprovalRequest.updateOne(
      { approvalId: pending!.approvalId, status: "pending" },
      {
        $set: {
          status: "approved",
          resolvedBy: "dev_approver",
          resolvedAt: new Date(),
          grantExpiresAt: new Date(Date.now() + APPROVAL_GRANT_TTL_MS)
        }
      }
    );

    // Different command → different fingerprint → the approved grant must not match.
    const different = await runGate(
      { tool_name: "run_command", tool_input: { command: "npm run deploy --force" } },
      verify
    );
    expect(different.code).toBe(2);
    expect(different.err.text).toMatch(/approval required/i);

    const grant = await ApprovalRequest.findOne({ approvalId: pending!.approvalId }).lean();
    expect(grant?.status).toBe("approved"); // untouched
    const mismatchPending = await ApprovalRequest.findOne({ status: "pending" }).lean();
    expect(mismatchPending?.argumentFingerprint).not.toBe(pending!.argumentFingerprint);
  });

  it("fails closed when approval resolution errors server-side", async () => {
    const spy = vi.spyOn(ApprovalRequest, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("simulated approval store failure");
    });

    const { code, err } = await runGate(DEPLOY_PAYLOAD, realVerify());
    expect(code).toBe(2);
    expect(err.text).toMatch(/approval required/i);
    expect(await ApprovalRequest.countDocuments({ status: "used" })).toBe(0);

    spy.mockRestore();
  });
});
