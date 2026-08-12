import { beforeEach, describe, expect, it, vi } from "vitest";

const replayMocks = vi.hoisted(() => ({
  requireConsoleApi: vi.fn(),
  getConsoleSessionActorId: vi.fn(),
  getConsoleAccountId: vi.fn(),
  findOneAndUpdateEvent: vi.fn(),
  webhookEventExists: vi.fn(),
  recordAdminAudit: vi.fn()
}));

vi.mock("@/lib/adminAuth", () => ({
  requireConsoleApi: replayMocks.requireConsoleApi,
  getConsoleSessionActorId: replayMocks.getConsoleSessionActorId
}));

vi.mock("@/lib/consoleData", () => ({
  getConsoleAccountId: replayMocks.getConsoleAccountId
}));

vi.mock("@/lib/consoleAdmins", () => ({
  recordAdminAudit: replayMocks.recordAdminAudit
}));

vi.mock("@/lib/repositories/webhooks", () => ({
  findOneAndUpdateEvent: replayMocks.findOneAndUpdateEvent,
  webhookEventExists: replayMocks.webhookEventExists
}));

describe("POST /api/console/webhook-events/[eventId]/replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replayMocks.requireConsoleApi.mockResolvedValue(null);
    replayMocks.getConsoleSessionActorId.mockReturnValue("cad_test");
    replayMocks.getConsoleAccountId.mockResolvedValue("acct_test");
    replayMocks.findOneAndUpdateEvent.mockResolvedValue(null);
    replayMocks.webhookEventExists.mockResolvedValue(null);
    replayMocks.recordAdminAudit.mockResolvedValue(undefined);
  });

  it("requires console authorization", async () => {
    replayMocks.requireConsoleApi.mockResolvedValue(
      Response.json({ error: "Console authentication required." }, { status: 401 })
    );
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(
      new Request("http://localhost/api/console/webhook-events/evt_test/replay") as never,
      { params: Promise.resolve({ eventId: "evt_test" }) }
    );

    expect(response.status).toBe(401);
    expect(replayMocks.findOneAndUpdateEvent).not.toHaveBeenCalled();
  });

  it("replays a dead-lettered event by resetting it to pending", async () => {
    const replayedEvent = {
      eventId: "evt_dead",
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date("2026-05-19T12:00:00.000Z"),
      deadLetter: false,
      lastError: null,
      completedAt: null
    };
    replayMocks.findOneAndUpdateEvent.mockResolvedValue(replayedEvent);
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(
      new Request("http://localhost/api/console/webhook-events/evt_dead/replay") as never,
      { params: Promise.resolve({ eventId: "evt_dead" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      replayed: true,
      event: {
        ...replayedEvent,
        nextAttemptAt: "2026-05-19T12:00:00.000Z"
      }
    });
    expect(replayMocks.findOneAndUpdateEvent).toHaveBeenCalledWith(
      {
        accountId: "acct_test",
        eventId: "evt_dead",
        status: "failed",
        deadLetter: true
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "pending",
          attempts: 0,
          deadLetter: false
        })
      }),
      { returnDocument: "after" }
    );
    expect(replayMocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: "cad_test", action: "webhook_event.replayed", target: "evt_dead" })
    );
  });

  it("rejects completed events instead of duplicating them", async () => {
    replayMocks.findOneAndUpdateEvent.mockResolvedValue(null);
    replayMocks.webhookEventExists.mockImplementation(async (filter: { status?: string }) => {
      if (filter.status === "processing") return null;
      return { eventId: "evt_done" };
    });
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(
      new Request("http://localhost/api/console/webhook-events/evt_done/replay") as never,
      { params: Promise.resolve({ eventId: "evt_done" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: "Only dead-lettered webhook events can be replayed." });
  });
});
