import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_MAX_ATTEMPTS } from "@/lib/webhooks";
import { rawApiKey } from "./fixtures";

const workerMocks = vi.hoisted(() => {
  type EventRecord = {
    eventId: string;
    accountId: string;
    developerUserId?: string;
    type: string;
    payload: Record<string, unknown>;
    status: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    nextAttemptAt: Date;
    processingStartedAt?: Date;
    deadLetter: boolean;
    lastError?: string | null;
    completedAt?: Date | null;
    createdAt: Date;
  };

  type EndpointRecord = {
    webhookId: string;
    accountId: string;
    developerUserId?: string;
    url: string;
    secretHash: string;
    events: string[];
    status: "active" | "disabled";
    lastTriggeredAt?: Date;
  };

  type DeliveryRecord = Record<string, unknown>;

  return {
    events: [] as EventRecord[],
    endpoints: [] as EndpointRecord[],
    deliveries: [] as DeliveryRecord[],
    httpStatus: 204,
    httpError: null as string | null,
    requestBodies: [] as string[],
    requestHeaders: [] as Record<string, string>,
    connectToDatabase: vi.fn()
  };
});

function getValueAtPath(record: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}

function matches(record: Record<string, unknown>, query: Record<string, unknown>) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = getValueAtPath(record, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      const operators = expected as Record<string, unknown>;
      if ("$lte" in operators && !(actual instanceof Date && operators.$lte instanceof Date && actual <= operators.$lte)) {
        return false;
      }
      if ("$lt" in operators && !(typeof actual === "number" && typeof operators.$lt === "number" && actual < operators.$lt)) {
        return false;
      }
      if ("$gte" in operators && !(typeof actual === "number" && typeof operators.$gte === "number" && actual >= operators.$gte)) {
        return false;
      }
      if ("$in" in operators && Array.isArray(operators.$in) && !operators.$in.includes(actual)) {
        return false;
      }
      return true;
    }

    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }

    return actual === expected;
  });
}

function applyUpdate(record: Record<string, unknown>, update: Record<string, unknown>) {
  const set = update.$set as Record<string, unknown> | undefined;
  const inc = update.$inc as Record<string, number> | undefined;
  const unset = update.$unset as Record<string, unknown> | undefined;

  if (set) {
    Object.assign(record, set);
  }

  if (inc) {
    Object.entries(inc).forEach(([key, value]) => {
      record[key] = Number(record[key] ?? 0) + value;
    });
  }

  if (unset) {
    Object.keys(unset).forEach((key) => {
      delete record[key];
    });
  }
}

vi.mock("@/lib/db", () => ({
  connectToDatabase: workerMocks.connectToDatabase
}));

vi.mock("@/models/WebhookEvent", () => ({
  default: {
    updateMany: vi.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      let modifiedCount = 0;
      workerMocks.events.forEach((event) => {
        if (matches(event as unknown as Record<string, unknown>, query)) {
          applyUpdate(event as unknown as Record<string, unknown>, update);
          modifiedCount += 1;
        }
      });
      return { modifiedCount };
    }),
    findOneAndUpdate: vi.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      const event = workerMocks.events
        .filter((candidate) => matches(candidate as unknown as Record<string, unknown>, query))
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())[0];

      if (!event) {
        return null;
      }

      applyUpdate(event as unknown as Record<string, unknown>, update);
      return event;
    }),
    updateOne: vi.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      const event = workerMocks.events.find((candidate) => matches(candidate as unknown as Record<string, unknown>, query));
      if (!event) return { modifiedCount: 0 };
      applyUpdate(event as unknown as Record<string, unknown>, update);
      return { modifiedCount: 1 };
    })
  }
}));

vi.mock("@/models/WebhookEndpoint", () => ({
  default: {
    find: vi.fn((query: Record<string, unknown>) => ({
      select: vi.fn(async () =>
        workerMocks.endpoints.filter((endpoint) => matches(endpoint as unknown as Record<string, unknown>, query))
      )
    })),
    updateMany: vi.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      let modifiedCount = 0;
      workerMocks.endpoints.forEach((endpoint) => {
        if (matches(endpoint as unknown as Record<string, unknown>, query)) {
          applyUpdate(endpoint as unknown as Record<string, unknown>, update);
          modifiedCount += 1;
        }
      });
      return { modifiedCount };
    })
  }
}));

vi.mock("@/models/WebhookDelivery", () => ({
  default: {
    insertMany: vi.fn(async (records: Record<string, unknown>[]) => {
      workerMocks.deliveries.push(...records);
      return records;
    })
  }
}));

vi.mock("dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }])
  }
}));

function createMockRequest(
  _url: URL,
  options: { headers?: Record<string, string> },
  callback: (response: EventEmitter & { statusCode: number; resume: () => void }) => void
) {
  const request = new EventEmitter() as EventEmitter & {
    write: (chunk: Buffer) => void;
    end: () => void;
    destroy: (error: Error) => void;
  };

  request.write = (chunk: Buffer) => {
    workerMocks.requestBodies.push(chunk.toString("utf8"));
  };
  request.end = () => {
    if (workerMocks.httpError) {
      request.emit("error", new Error(workerMocks.httpError));
      return;
    }

    const response = Object.assign(new EventEmitter(), {
      statusCode: workerMocks.httpStatus,
      resume: vi.fn()
    });
    workerMocks.requestHeaders.push(options.headers ?? {});
    callback(response);
  };
  request.destroy = (error: Error) => {
    request.emit("error", error);
  };

  return request;
}

vi.mock("https", () => ({
  default: {
    request: vi.fn(createMockRequest)
  }
}));

vi.mock("http", () => ({
  default: {
    request: vi.fn(createMockRequest)
  }
}));

function webhookEvent(overrides: Partial<(typeof workerMocks.events)[number]> = {}) {
  const eventId = overrides.eventId ?? `evt_${workerMocks.events.length + 1}`;
  return {
    eventId,
    accountId: "acct_test",
    developerUserId: "dev_test",
    type: "verification.allowed",
    payload: {
      eventId,
      type: "verification.allowed",
      accountId: "acct_test",
      developerUserId: "dev_test",
      createdAt: new Date().toISOString(),
      data: { requestId: "req_test" }
    },
    status: "pending" as const,
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    deadLetter: false,
    lastError: null,
    completedAt: null,
    createdAt: new Date(Date.now() - 1000),
    ...overrides
  };
}

function endpoint(overrides: Partial<(typeof workerMocks.endpoints)[number]> = {}) {
  return {
    webhookId: `wh_${workerMocks.endpoints.length + 1}`,
    accountId: "acct_test",
    developerUserId: "dev_test",
    url: "https://hooks.example.com/behalf",
    secretHash: "secret_hash",
    events: ["verification.allowed"],
    status: "active" as const,
    ...overrides
  };
}

describe("webhook worker event processing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-05-19T12:00:00.000Z") });
    workerMocks.events.length = 0;
    workerMocks.endpoints.length = 0;
    workerMocks.deliveries.length = 0;
    workerMocks.requestBodies.length = 0;
    workerMocks.requestHeaders.length = 0;
    workerMocks.httpStatus = 204;
    workerMocks.httpError = null;
    workerMocks.connectToDatabase.mockResolvedValue(undefined);
  });

  it("claims a pending event before delivery and completes it on success", async () => {
    workerMocks.events.push(webhookEvent());
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summary = await processWebhookEvents();

    expect(summary).toMatchObject({ processed: 1, completed: 1, retried: 0, failed: 0, skipped: 0 });
    expect(workerMocks.events[0]).toMatchObject({ status: "completed", attempts: 1, deadLetter: false });
    expect(workerMocks.events[0].processingStartedAt).toBeUndefined();
    expect(workerMocks.deliveries).toHaveLength(1);
    expect(workerMocks.deliveries[0]).toMatchObject({
      webhookId: "wh_1",
      eventId: "evt_1",
      status: "success",
      httpStatus: 204,
      attempt: 1,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS
    });
  });

  it("does not let concurrent workers process the same pending event twice", async () => {
    workerMocks.events.push(webhookEvent());
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summaries = await Promise.all([processWebhookEvents(), processWebhookEvents()]);

    expect(summaries.reduce((total, summary) => total + summary.processed, 0)).toBe(1);
    expect(summaries.reduce((total, summary) => total + summary.completed, 0)).toBe(1);
    expect(workerMocks.events[0]).toMatchObject({ status: "completed", attempts: 1 });
    expect(workerMocks.deliveries).toHaveLength(1);
  });

  it("does not claim processing, completed, failed, dead-lettered, or too-early retry events", async () => {
    workerMocks.events.push(
      webhookEvent({ eventId: "evt_processing", status: "processing", processingStartedAt: new Date() }),
      webhookEvent({ eventId: "evt_completed", status: "completed", completedAt: new Date() }),
      webhookEvent({ eventId: "evt_failed", status: "failed", deadLetter: true }),
      webhookEvent({ eventId: "evt_too_early", attempts: 1, nextAttemptAt: new Date(Date.now() + 5000) })
    );
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summary = await processWebhookEvents();

    expect(summary).toMatchObject({ processed: 0, completed: 0, retried: 0, failed: 0 });
    expect(workerMocks.deliveries).toHaveLength(0);
  });

  it("recovers stuck processing events and processes them once", async () => {
    workerMocks.events.push(
      webhookEvent({
        status: "processing",
        attempts: 1,
        processingStartedAt: new Date(Date.now() - 6 * 60 * 1000)
      })
    );
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summary = await processWebhookEvents();

    expect(summary).toMatchObject({ processed: 1, completed: 1, recovered: 1, deadLettered: 0 });
    expect(workerMocks.events[0]).toMatchObject({ status: "completed", attempts: 2 });
    expect(workerMocks.deliveries).toHaveLength(1);
  });

  it("records failures, sets nextAttemptAt, and does not retry before it is due", async () => {
    workerMocks.httpStatus = 500;
    workerMocks.events.push(webhookEvent());
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const firstSummary = await processWebhookEvents();
    const nextAttemptAt = workerMocks.events[0].nextAttemptAt;
    const earlySummary = await processWebhookEvents();

    expect(firstSummary).toMatchObject({ processed: 1, retried: 1, failed: 0 });
    expect(workerMocks.events[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(workerMocks.deliveries[0]).toMatchObject({
      status: "failed",
      httpStatus: 500,
      attempt: 1,
      nextRetryAt: nextAttemptAt
    });
    expect(earlySummary).toMatchObject({ processed: 0 });
    expect(workerMocks.deliveries).toHaveLength(1);
  });

  it("retries after nextAttemptAt and dead-letters after max attempts", async () => {
    workerMocks.httpStatus = 500;
    workerMocks.events.push(webhookEvent({ attempts: WEBHOOK_MAX_ATTEMPTS - 1 }));
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summary = await processWebhookEvents();

    expect(summary).toMatchObject({ processed: 1, failed: 1, deadLettered: 1 });
    expect(workerMocks.events[0]).toMatchObject({
      status: "failed",
      attempts: WEBHOOK_MAX_ATTEMPTS,
      deadLetter: true
    });
    expect(workerMocks.deliveries[0]).toMatchObject({
      status: "failed",
      attempt: WEBHOOK_MAX_ATTEMPTS,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS
    });
  });

  it("honors endpoint filters and account boundaries", async () => {
    workerMocks.events.push(webhookEvent());
    workerMocks.endpoints.push(
      endpoint({ webhookId: "wh_matching" }),
      endpoint({ webhookId: "wh_other_event", events: ["verification.denied"] }),
      endpoint({ webhookId: "wh_disabled", status: "disabled" }),
      endpoint({ webhookId: "wh_other_account", accountId: "acct_other", developerUserId: "dev_other" })
    );
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    await processWebhookEvents();

    expect(workerMocks.deliveries).toHaveLength(1);
    expect(workerMocks.deliveries[0]).toMatchObject({ webhookId: "wh_matching" });
  });

  it("completes events without crashing when there are no matching endpoints", async () => {
    workerMocks.events.push(webhookEvent());
    workerMocks.endpoints.push(endpoint({ events: ["verification.denied"] }));
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    const summary = await processWebhookEvents();

    expect(summary).toMatchObject({ processed: 1, completed: 1 });
    expect(workerMocks.events[0]).toMatchObject({ status: "completed", attempts: 1 });
    expect(workerMocks.deliveries).toHaveLength(0);
  });

  it("does not store raw secrets or API keys in failed delivery records", async () => {
    workerMocks.httpError = `failed ${rawApiKey} whsec_supersecret Bearer ${rawApiKey}`;
    workerMocks.events.push(
      webhookEvent({
        payload: {
          eventId: "evt_1",
          type: "verification.allowed",
          accountId: "acct_test",
          createdAt: new Date().toISOString(),
          data: { requestId: "req_test" }
        }
      })
    );
    workerMocks.endpoints.push(endpoint());
    const { processWebhookEvents } = await import("@/lib/webhookWorker");

    await processWebhookEvents();

    const stored = JSON.stringify({ delivery: workerMocks.deliveries[0], event: workerMocks.events[0] });
    expect(stored).not.toContain(rawApiKey);
    expect(stored).not.toContain("whsec_supersecret");
    expect(workerMocks.requestBodies.join("")).not.toContain("apiKey");
    expect(workerMocks.requestHeaders.join("")).not.toContain("secret_hash");
  });
});
