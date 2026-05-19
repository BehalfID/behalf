import { beforeEach, describe, expect, it, vi } from "vitest";

const replayMocks = vi.hoisted(() => ({
  requireConsoleApi: vi.fn(),
  getConsoleAccountId: vi.fn(),
  findOneAndUpdate: vi.fn(),
  exists: vi.fn()
}));

vi.mock("@/lib/adminAuth", () => ({
  requireConsoleApi: replayMocks.requireConsoleApi
}));

vi.mock("@/lib/consoleData", () => ({
  getConsoleAccountId: replayMocks.getConsoleAccountId
}));

vi.mock("@/models/WebhookEvent", () => ({
  default: {
    findOneAndUpdate: replayMocks.findOneAndUpdate,
    exists: replayMocks.exists
  }
}));

function queryResult(value: unknown) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => value)
    }))
  };
}

describe("POST /api/console/webhook-events/[eventId]/replay", () => {
  beforeEach(() => {
    replayMocks.requireConsoleApi.mockResolvedValue(null);
    replayMocks.getConsoleAccountId.mockResolvedValue("acct_test");
    replayMocks.findOneAndUpdate.mockReturnValue(queryResult(null));
    replayMocks.exists.mockResolvedValue(null);
  });

  it("requires console authorization", async () => {
    replayMocks.requireConsoleApi.mockResolvedValue(Response.json({ error: "Console authentication required." }, { status: 401 }));
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(new Request("http://localhost/api/console/webhook-events/evt_test/replay") as never, {
      params: Promise.resolve({ eventId: "evt_test" })
    });

    expect(response.status).toBe(401);
    expect(replayMocks.findOneAndUpdate).not.toHaveBeenCalled();
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
    replayMocks.findOneAndUpdate.mockReturnValue(queryResult(replayedEvent));
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(new Request("http://localhost/api/console/webhook-events/evt_dead/replay") as never, {
      params: Promise.resolve({ eventId: "evt_dead" })
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      replayed: true,
      event: {
        ...replayedEvent,
        nextAttemptAt: "2026-05-19T12:00:00.000Z"
      }
    });
    expect(replayMocks.findOneAndUpdate).toHaveBeenCalledWith(
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
          deadLetter: false,
          lastError: null,
          completedAt: null
        }),
        $unset: { processingStartedAt: "" }
      }),
      { returnDocument: "after" }
    );
  });

  it("rejects completed events instead of duplicating them", async () => {
    replayMocks.exists.mockImplementation(async (query: Record<string, unknown>) =>
      query.status === "processing" ? null : { _id: "evt_completed" }
    );
    const { POST } = await import("@/app/api/console/webhook-events/[eventId]/replay/route");

    const response = await POST(new Request("http://localhost/api/console/webhook-events/evt_completed/replay") as never, {
      params: Promise.resolve({ eventId: "evt_completed" })
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: "Only dead-lettered webhook events can be replayed." });
  });
});
