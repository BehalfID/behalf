import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

type Endpoint = {
  webhookId: string;
  accountId: string;
  developerUserId?: string | null;
  url: string;
  secretHash: string;
  secretPreview: string;
  events: string[];
  status: string;
  lastTriggeredAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type Event = {
  eventId: string;
  accountId: string;
  developerUserId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  processingStartedAt?: Date | null;
  deadLetter: boolean;
  lastError?: string | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type Delivery = {
  deliveryId: string;
  accountId: string;
  developerUserId?: string | null;
  webhookId: string;
  eventId: string;
  eventType: string;
  status: string;
  httpStatus?: number | null;
  error?: string | null;
  attempt: number;
  nextRetryAt?: Date | null;
  maxAttempts: number;
  createdAt?: Date;
};

type WriteResult = {
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
};

export type WebhookContractDeps = {
  createEndpoint: (input: Record<string, unknown>) => Promise<Endpoint>;
  createEvent: (input: Record<string, unknown>) => Promise<Event>;
  findEndpoint: (
    filter: Record<string, unknown>,
    select?: string
  ) => Promise<Endpoint | null>;
  listEndpoints: (
    filter?: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }
  ) => Promise<Endpoint[]>;
  findActiveEndpointsForEvent: (event: {
    accountId: string;
    developerUserId?: string | null;
    type: string;
  }) => Promise<Endpoint[]>;
  updateEndpoint: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<WriteResult>;
  updateEndpoints: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<WriteResult>;
  listEvents: (
    filter?: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }
  ) => Promise<Event[]>;
  findEvent: (filter: Record<string, unknown>) => Promise<Event | null>;
  recoverStuckEvents: (
    stuckBefore: Date,
    maxAttempts: number
  ) => Promise<{ recovered: number; deadLettered: number }>;
  claimNextEvent: (maxAttempts: number, now?: Date) => Promise<Event | null>;
  insertDeliveries: (deliveries: Array<Record<string, unknown>>) => Promise<Delivery[]>;
  markEventCompleted: (eventId: string, now?: Date) => Promise<WriteResult>;
  markEventFailed: (
    eventId: string,
    lastError: string,
    now?: Date
  ) => Promise<WriteResult>;
  retryEvent: (
    eventId: string,
    nextAttemptAt: Date,
    lastError: string
  ) => Promise<WriteResult>;
  listDeliveries: (
    filter?: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }
  ) => Promise<Delivery[]>;
  deleteDeliveries: (filter: Record<string, unknown>) => Promise<WriteResult>;
  deleteEvents: (filter: Record<string, unknown>) => Promise<WriteResult>;
  deleteEndpoints: (filter: Record<string, unknown>) => Promise<WriteResult>;
  countEvents: (filter?: Record<string, unknown>) => Promise<number>;
  findOneAndUpdateEndpoint: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<Endpoint | null>;
  findOneAndUpdateEvent: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<Event | null>;
  eventExists: (filter: Record<string, unknown>) => Promise<unknown>;
  seedTenant: (accountId: string, developerUserId: string) => Promise<void>;
};

function endpointInput(
  webhookId: string,
  accountId = "acct_hooks",
  developerUserId = "dev_hooks"
) {
  return {
    webhookId,
    accountId,
    developerUserId,
    url: `https://${webhookId}.example.test/hooks`,
    secretHash: `${webhookId}_hash`,
    secretPreview: `${webhookId}_preview`,
    events: ["verification.allowed"],
    status: "active"
  };
}

function eventInput(
  eventId: string,
  overrides: Record<string, unknown> = {}
) {
  const createdAt = new Date("2026-07-01T00:00:00.000Z");
  return {
    eventId,
    accountId: "acct_hooks",
    developerUserId: "dev_hooks",
    type: "verification.allowed",
    payload: {
      eventId,
      type: "verification.allowed",
      data: { requestId: `${eventId}_request`, nested: { ok: true } }
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(createdAt.getTime() - 1_000),
    processingStartedAt: null,
    deadLetter: false,
    lastError: null,
    completedAt: null,
    createdAt,
    ...overrides
  };
}

export function makeWebhooksRepositoryContract(
  name: string,
  factory: () => WebhookContractDeps | Promise<WebhookContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("creates, isolates, disables, enables, and rotates endpoint secrets", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      await deps.seedTenant("acct_other", "dev_other");
      const created = await deps.createEndpoint(endpointInput("wh_main"));
      await deps.createEndpoint(endpointInput("wh_other", "acct_other", "dev_other"));

      expect(created.webhookId).toBe("wh_main");
      expect(created.events).toEqual(["verification.allowed"]);
      expect((await deps.listEndpoints({ accountId: "acct_hooks" })).map((row) => row.webhookId))
        .toEqual(["wh_main"]);
      expect(await deps.findEndpoint({ accountId: "acct_other", webhookId: "wh_main" }))
        .toBeNull();

      expect(
        (await deps.updateEndpoint(
          { accountId: "acct_hooks", webhookId: "wh_main" },
          { $set: { status: "disabled" } }
        )).matchedCount
      ).toBe(1);
      expect((await deps.findEndpoint({ webhookId: "wh_main" }))?.status).toBe("disabled");
      await deps.updateEndpoint(
        { accountId: "acct_hooks", webhookId: "wh_main" },
        { $set: { status: "active" } }
      );
      const rotated = await deps.findOneAndUpdateEndpoint(
        { accountId: "acct_hooks", webhookId: "wh_main" },
        { $set: { secretHash: "rotated_hash", secretPreview: "rotated_preview" } },
        { returnDocument: "after" }
      );
      expect(rotated?.secretPreview).toBe("rotated_preview");
      const withSecret = await deps.findEndpoint(
        { accountId: "acct_hooks", webhookId: "wh_main" },
        "+secretHash"
      );
      expect(withSecret?.secretHash).toBe("rotated_hash");
    });

    it("matches active endpoints by tenant, developer, event type, and status", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      await deps.seedTenant("acct_other", "dev_other");
      await deps.createEndpoint(endpointInput("wh_active"));
      await deps.createEndpoint({
        ...endpointInput("wh_disabled"),
        status: "disabled"
      });
      await deps.createEndpoint({
        ...endpointInput("wh_wrong_type"),
        events: ["verification.denied"]
      });
      await deps.createEndpoint(endpointInput("wh_other", "acct_other", "dev_other"));

      const rows = await deps.findActiveEndpointsForEvent({
        accountId: "acct_hooks",
        developerUserId: "dev_hooks",
        type: "verification.allowed"
      });
      expect(rows.map((row) => row.webhookId)).toEqual(["wh_active"]);
      expect(rows[0]?.secretHash).toBe("wh_active_hash");
    });

    it("round-trips event JSON and paginates identical timestamps deterministically", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      await deps.seedTenant("acct_other", "dev_other");
      const createdAt = new Date("2026-07-02T00:00:00.000Z");
      for (const eventId of ["evt_a", "evt_b", "evt_c"]) {
        await deps.createEvent(eventInput(eventId, { createdAt }));
      }
      await deps.createEvent(eventInput("evt_other", {
        accountId: "acct_other",
        developerUserId: "dev_other",
        createdAt
      }));

      const first = await deps.listEvents(
        { accountId: "acct_hooks" },
        { sort: { createdAt: -1 }, limit: 2 }
      );
      const second = await deps.listEvents(
        { accountId: "acct_hooks" },
        { sort: { createdAt: -1 }, skip: 2, limit: 2 }
      );
      expect(first.map((row) => row.eventId)).toEqual(["evt_c", "evt_b"]);
      expect(second.map((row) => row.eventId)).toEqual(["evt_a"]);
      expect(await deps.findEvent({ accountId: "acct_other", eventId: "evt_a" }))
        .toBeNull();
      expect(first[0]?.payload).toEqual({
        eventId: "evt_c",
        type: "verification.allowed",
        data: { requestId: "evt_c_request", nested: { ok: true } }
      });
    });

    it("atomically claims eligible events, excludes future retries, and increments attempts", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      const now = new Date("2026-07-03T00:00:00.000Z");
      await deps.createEvent(eventInput("evt_due", {
        nextAttemptAt: new Date(now.getTime() - 1),
        createdAt: new Date(now.getTime() - 2_000)
      }));
      await deps.createEvent(eventInput("evt_future", {
        nextAttemptAt: new Date(now.getTime() + 60_000),
        createdAt: new Date(now.getTime() - 1_000)
      }));

      const claims = await Promise.all([
        deps.claimNextEvent(5, now),
        deps.claimNextEvent(5, now)
      ]);
      const winners = claims.filter(Boolean);
      expect(winners).toHaveLength(1);
      expect(winners[0]?.eventId).toBe("evt_due");
      expect(winners[0]?.status).toBe("processing");
      expect(winners[0]?.attempts).toBe(1);
      expect((await deps.findEvent({ eventId: "evt_future" }))?.status).toBe("pending");
    });

    it("lets multiple workers claim different events without duplication", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      const now = new Date("2026-07-04T00:00:00.000Z");
      await deps.createEvent(eventInput("evt_worker_a", {
        nextAttemptAt: new Date(now.getTime() - 1)
      }));
      await deps.createEvent(eventInput("evt_worker_b", {
        nextAttemptAt: new Date(now.getTime() - 1)
      }));

      const claims = await Promise.all([
        deps.claimNextEvent(5, now),
        deps.claimNextEvent(5, now)
      ]);
      expect(new Set(claims.map((row) => row?.eventId))).toEqual(
        new Set(["evt_worker_a", "evt_worker_b"])
      );
      expect(claims.every((row) => row?.attempts === 1)).toBe(true);
    });

    it("preserves retry, successful completion, terminal failure, and stale-worker CAS", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      const now = new Date("2026-07-05T00:00:00.000Z");
      await deps.createEvent(eventInput("evt_retry", {
        nextAttemptAt: new Date(now.getTime() - 1)
      }));
      await deps.claimNextEvent(5, now);
      const retryAt = new Date(now.getTime() + 5_000);
      expect((await deps.retryEvent("evt_retry", retryAt, "HTTP 500")).matchedCount).toBe(1);
      const retried = await deps.findEvent({ eventId: "evt_retry" });
      expect(retried).toMatchObject({
        status: "pending",
        attempts: 1,
        nextAttemptAt: retryAt,
        lastError: "HTTP 500"
      });
      expect((await deps.markEventCompleted("evt_retry", now)).matchedCount).toBe(0);

      await deps.claimNextEvent(5, retryAt);
      expect((await deps.markEventCompleted("evt_retry", retryAt)).matchedCount).toBe(1);
      expect((await deps.findEvent({ eventId: "evt_retry" }))?.status).toBe("completed");

      await deps.createEvent(eventInput("evt_terminal", {
        attempts: 4,
        nextAttemptAt: new Date(now.getTime() - 1)
      }));
      await deps.claimNextEvent(5, now);
      expect((await deps.markEventFailed("evt_terminal", "terminal", now)).matchedCount).toBe(1);
      expect(await deps.findEvent({ eventId: "evt_terminal" })).toMatchObject({
        status: "failed",
        attempts: 5,
        deadLetter: true,
        lastError: "terminal"
      });
    });

    it("recovers stuck jobs, dead-letters exhausted jobs, and replays conditionally", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      const now = new Date("2026-07-06T00:00:00.000Z");
      const stuckAt = new Date(now.getTime() - 10 * 60_000);
      await deps.createEvent(eventInput("evt_stuck", {
        status: "processing",
        attempts: 1,
        processingStartedAt: stuckAt
      }));
      await deps.createEvent(eventInput("evt_exhausted", {
        status: "processing",
        attempts: 5,
        processingStartedAt: stuckAt
      }));

      const result = await deps.recoverStuckEvents(
        new Date(now.getTime() - 5 * 60_000),
        5
      );
      expect(result).toEqual({ recovered: 1, deadLettered: 1 });
      expect((await deps.findEvent({ eventId: "evt_stuck" }))?.status).toBe("pending");
      expect(await deps.findEvent({ eventId: "evt_exhausted" })).toMatchObject({
        status: "failed",
        deadLetter: true
      });

      const replayed = await deps.findOneAndUpdateEvent(
        {
          accountId: "acct_hooks",
          eventId: "evt_exhausted",
          status: "failed",
          deadLetter: true
        },
        {
          $set: {
            status: "pending",
            attempts: 0,
            nextAttemptAt: now,
            deadLetter: false,
            lastError: null,
            completedAt: null
          },
          $unset: { processingStartedAt: "" }
        },
        { returnDocument: "after" }
      );
      expect(replayed).toMatchObject({
        status: "pending",
        attempts: 0,
        deadLetter: false,
        lastError: null
      });
    });

    it("inserts delivery fan-out in bulk, orders it, and deletes all webhook records", async () => {
      const deps = getDeps();
      await deps.seedTenant("acct_hooks", "dev_hooks");
      await deps.createEndpoint(endpointInput("wh_delivery_a"));
      await deps.createEndpoint(endpointInput("wh_delivery_b"));
      await deps.createEvent(eventInput("evt_delivery"));
      const createdAt = new Date("2026-07-07T00:00:00.000Z");
      const rows = await deps.insertDeliveries([
        {
          deliveryId: "dlv_a",
          accountId: "acct_hooks",
          developerUserId: "dev_hooks",
          webhookId: "wh_delivery_a",
          eventId: "evt_delivery",
          eventType: "verification.allowed",
          status: "success",
          httpStatus: 204,
          attempt: 1,
          maxAttempts: 5,
          createdAt
        },
        {
          deliveryId: "dlv_b",
          accountId: "acct_hooks",
          developerUserId: "dev_hooks",
          webhookId: "wh_delivery_b",
          eventId: "evt_delivery",
          eventType: "verification.allowed",
          status: "failed",
          error: "HTTP 500",
          attempt: 1,
          nextRetryAt: new Date(createdAt.getTime() + 5_000),
          maxAttempts: 5,
          createdAt
        }
      ]);
      expect(rows).toHaveLength(2);
      expect(
        (await deps.listDeliveries(
          { accountId: "acct_hooks" },
          { sort: { createdAt: -1 } }
        )).map((row) => row.deliveryId)
      ).toEqual(["dlv_b", "dlv_a"]);

      expect((await deps.deleteDeliveries({ accountId: "acct_hooks" })).deletedCount).toBe(2);
      expect((await deps.deleteEvents({ accountId: "acct_hooks" })).deletedCount).toBe(1);
      expect((await deps.deleteEndpoints({ accountId: "acct_hooks" })).deletedCount).toBe(2);
      expect(await deps.countEvents({ accountId: "acct_hooks" })).toBe(0);
      expect(await deps.eventExists({ accountId: "acct_hooks", eventId: "evt_delivery" }))
        .toBeNull();
    });
  });
}
