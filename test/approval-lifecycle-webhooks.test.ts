import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookMocks = vi.hoisted(() => ({
  createWebhookEvent: vi.fn(),
  emitWebhookEvent: vi.fn()
}));

vi.mock("@/lib/webhooks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/webhooks")>("@/lib/webhooks");
  return {
    ...actual,
    createWebhookEvent: webhookMocks.createWebhookEvent,
    emitWebhookEvent: webhookMocks.emitWebhookEvent
  };
});

vi.mock("@/lib/integrations/collaboration/dispatcher", () => ({
  dispatchCollaborationEvent: vi.fn().mockResolvedValue(undefined)
}));

describe("approval lifecycle webhook emitters", () => {
  beforeEach(() => {
    webhookMocks.createWebhookEvent.mockReset();
    webhookMocks.emitWebhookEvent.mockReset();
    webhookMocks.createWebhookEvent.mockImplementation((accountId, type, data, developerUserId) => ({
      eventId: "evt_test",
      type,
      createdAt: new Date().toISOString(),
      accountId: accountId ?? developerUserId,
      developerUserId,
      data
    }));
    webhookMocks.emitWebhookEvent.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  it("emits approval.requested with dashboard deep link", async () => {
    const { emitApprovalRequested } = await import("@/lib/approvals/emitLifecycle");

    await emitApprovalRequested({
      accountId: "acct_1",
      developerUserId: "dev_1",
      approvalId: "apr_1",
      kind: "agent_action",
      agentId: "agent_1",
      permissionId: "perm_1",
      action: "write_file",
      vendor: "repo",
      argumentPreview: "src/app.ts",
      requiredAuthorityLevel: 50,
      requestId: "req_1"
    });

    expect(webhookMocks.createWebhookEvent).toHaveBeenCalledWith(
      "acct_1",
      "approval.requested",
      expect.objectContaining({
        approvalId: "apr_1",
        status: "pending",
        action: "write_file",
        dashboardUrl: "https://app.example.com/dashboard/approvals?approvalId=apr_1"
      }),
      "dev_1"
    );
    expect(webhookMocks.emitWebhookEvent).toHaveBeenCalled();
  });

  it("emits approved, denied, and used lifecycle events", async () => {
    const {
      emitApprovalApproved,
      emitApprovalDenied,
      emitApprovalUsed
    } = await import("@/lib/approvals/emitLifecycle");

    await emitApprovalApproved({
      accountId: "acct_1",
      approvalId: "apr_1",
      action: "purchase",
      resolvedBy: "dev_approver",
      grantExpiresAt: new Date("2030-01-01T00:00:00.000Z")
    });
    await emitApprovalDenied({
      accountId: "acct_1",
      approvalId: "apr_2",
      action: "purchase",
      resolvedBy: "dev_denier"
    });
    await emitApprovalUsed({
      accountId: "acct_1",
      approvalId: "apr_1",
      action: "purchase"
    });

    expect(webhookMocks.createWebhookEvent.mock.calls.map((call) => call[1])).toEqual([
      "approval.approved",
      "approval.denied",
      "approval.used"
    ]);
  });

  it("includes new approval.* types in WEBHOOK_EVENT_TYPES", async () => {
    const { WEBHOOK_EVENT_TYPES, isWebhookEventType } = await import("@/lib/webhooks");

    for (const type of [
      "approval.requested",
      "approval.approved",
      "approval.denied",
      "approval.used"
    ] as const) {
      expect(WEBHOOK_EVENT_TYPES).toContain(type);
      expect(isWebhookEventType(type)).toBe(true);
    }
  });
});
