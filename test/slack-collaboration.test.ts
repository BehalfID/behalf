import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifySlackSignature } from "@/lib/integrations/collaboration/slack/signature";
import {
  buildApprovalRequestedBlocks,
  buildApprovalResolvedBlocks,
  resolvedStatusLabel
} from "@/lib/integrations/collaboration/slack/blocks";
import type { ApprovalLifecycleData } from "@/lib/approvals/emitLifecycle";

function sign(secret: string, timestamp: string, rawBody: string) {
  const base = `v0:${timestamp}:${rawBody}`;
  return `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
}

describe("verifySlackSignature", () => {
  const secret = "slack_signing_secret_test";
  const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid Slack signature", () => {
    const signature = sign(secret, timestamp, rawBody);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody,
        nowSeconds: Number(timestamp)
      })
    ).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, and skewed timestamps", () => {
    const signature = sign(secret, timestamp, rawBody);

    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody: `${rawBody}&x=1`,
        nowSeconds: Number(timestamp)
      })
    ).toBe(false);

    expect(
      verifySlackSignature({
        signingSecret: "wrong",
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody,
        nowSeconds: Number(timestamp)
      })
    ).toBe(false);

    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody,
        nowSeconds: Number(timestamp) + 10_000
      })
    ).toBe(false);
  });
});

describe("Slack Block Kit builders", () => {
  const base: ApprovalLifecycleData = {
    approvalId: "apr_1",
    kind: "agent_action",
    status: "pending",
    action: "write_file",
    agentId: "agent_1",
    vendor: "repo",
    argumentPreview: "src/app.ts",
    requiredAuthorityLevel: 50,
    dashboardUrl: "https://app.example.com/dashboard/approvals?approvalId=apr_1"
  };

  it("includes approve/deny actions for pending approvals", () => {
    const blocks = buildApprovalRequestedBlocks(base);
    const actions = blocks.find((block) => block.type === "actions") as {
      elements: Array<{ action_id: string; value?: string }>;
    };
    expect(actions.elements.map((el) => el.action_id)).toEqual([
      "approval_approve",
      "approval_deny",
      "approval_open_dashboard"
    ]);
    expect(actions.elements[0].value).toBe("apr_1");
  });

  it("renders resolved cards without action buttons", () => {
    const approved = { ...base, status: "approved" as const, resolvedBy: "dev_1" };
    const blocks = buildApprovalResolvedBlocks(approved, resolvedStatusLabel(approved));
    expect(blocks.some((block) => block.type === "actions")).toBe(false);
    expect(resolvedStatusLabel(approved)).toContain("dev_1");
  });
});

const interactionMocks = vi.hoisted(() => ({
  findSlackBindingByTeamWithSecrets: vi.fn(),
  getWorkspaceActor: vi.fn(),
  resolveApprovalDecision: vi.fn()
}));

vi.mock("@/lib/repositories/integrationBindings", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/repositories/integrationBindings")
  >("@/lib/repositories/integrationBindings");
  return {
    ...actual,
    findSlackBindingByTeamWithSecrets: interactionMocks.findSlackBindingByTeamWithSecrets
  };
});

vi.mock("@/lib/delegatedAuth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/delegatedAuth")>(
    "@/lib/delegatedAuth"
  );
  return {
    ...actual,
    getWorkspaceActor: interactionMocks.getWorkspaceActor
  };
});

vi.mock("@/lib/approvals/resolveApproval", () => ({
  resolveApprovalDecision: interactionMocks.resolveApprovalDecision
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined)
}));

describe("Slack interactions route", () => {
  beforeEach(() => {
    interactionMocks.findSlackBindingByTeamWithSecrets.mockReset();
    interactionMocks.getWorkspaceActor.mockReset();
    interactionMocks.resolveApprovalDecision.mockReset();
  });

  it("rejects invalid signatures", async () => {
    interactionMocks.findSlackBindingByTeamWithSecrets.mockResolvedValue([
      {
        bindingId: "ibind_1",
        accountId: "acct_1",
        identityMap: [{ externalUserId: "U1", userId: "dev_1" }],
        signingSecret: "secret"
      }
    ]);

    const { POST } = await import("@/app/api/integrations/slack/interactions/route");
    const payload = JSON.stringify({
      type: "block_actions",
      team: { id: "T1" },
      user: { id: "U1" },
      actions: [{ action_id: "approval_approve", value: "apr_1" }]
    });
    const body = `payload=${encodeURIComponent(payload)}`;
    const request = new Request("http://localhost/api/integrations/slack/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-signature": "v0=deadbeef",
        "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000))
      },
      body
    });

    const response = await POST(request as never);
    expect(response.status).toBe(401);
    expect(interactionMocks.resolveApprovalDecision).not.toHaveBeenCalled();
  });

  it("maps Slack identity and routes approve through shared resolver", async () => {
    const secret = "slack_secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({
      type: "block_actions",
      team: { id: "T1" },
      user: { id: "U1" },
      actions: [{ action_id: "approval_approve", value: "apr_1" }]
    });
    const body = `payload=${encodeURIComponent(payload)}`;
    const signature = sign(secret, timestamp, body);

    interactionMocks.findSlackBindingByTeamWithSecrets.mockResolvedValue([
      {
        bindingId: "ibind_1",
        accountId: "acct_1",
        identityMap: [{ externalUserId: "U1", userId: "dev_1" }],
        signingSecret: secret
      }
    ]);
    interactionMocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_1",
      accountId: "acct_1",
      role: "OWNER",
      authorityLevel: 100
    });
    interactionMocks.resolveApprovalDecision.mockResolvedValue({
      ok: true,
      decision: "approve",
      approvalId: "apr_1",
      grantExpiresAt: "2030-01-01T00:00:00.000Z"
    });

    const { POST } = await import("@/app/api/integrations/slack/interactions/route");
    const request = new Request("http://localhost/api/integrations/slack/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-signature": signature,
        "x-slack-request-timestamp": timestamp
      },
      body
    });

    const response = await POST(request as never);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.text).toMatch(/Approved apr_1/);
    expect(interactionMocks.resolveApprovalDecision).toHaveBeenCalledWith({
      actor: expect.objectContaining({ userId: "dev_1", accountId: "acct_1" }),
      approvalId: "apr_1",
      decision: "approve"
    });
  });
});
