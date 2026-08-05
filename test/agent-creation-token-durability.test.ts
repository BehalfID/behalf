/**
 * Regression for the production report: "creating an agent and receiving its
 * token throws a 500".
 *
 * `POST /api/dashboard/agents` committed the agent and its API-key hash, then
 * awaited `emitWebhookEvent` *before* returning. The event was built with
 * `createWebhookEvent(null, …)`, and `createWebhookEvent` substituted the
 * developer's user id for the missing account id. Mongo accepted that; on
 * Postgres `webhook_events.account_id` is NOT NULL with a foreign key to
 * `accounts.account_id`, so the insert raised SQLSTATE 23503. The route had no
 * try/catch, so the request became an unhandled, bodiless 500 — after the
 * commit. The one-time plaintext key existed only in the response body that
 * was never sent, making the credential permanently unrecoverable.
 *
 * The product invariant these tests pin: a nonessential downstream side effect
 * must never produce a 500 that hides a successfully committed one-time
 * credential.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const PLAINTEXT = "bk_live_plaintext_key_do_not_log";

const mocks = vi.hoisted(() => ({
  requireVerifiedDeveloperApi: vi.fn(),
  requireDeveloperApi: vi.fn(),
  requireWorkspaceMutationActor: vi.fn(),
  getWorkspaceActor: vi.fn(),
  checkAgentLimit: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  createEvent: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireVerifiedDeveloperApi: mocks.requireVerifiedDeveloperApi,
  requireDeveloperApi: mocks.requireDeveloperApi
}));
vi.mock("@/lib/workspaceActor", () => ({
  requireWorkspaceMutationActor: mocks.requireWorkspaceMutationActor
}));
vi.mock("@/lib/delegatedAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegatedAuth")>();
  return { ...actual, getWorkspaceActor: mocks.getWorkspaceActor };
});
vi.mock("@/lib/quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quota")>();
  return { ...actual, checkAgentLimit: mocks.checkAgentLimit };
});
// Repository level, so the route's own key generation/hashing still runs.
vi.mock("@/lib/repositories/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/agents")>();
  return { ...actual, createAgent: mocks.createAgent, updateAgent: mocks.updateAgent };
});
vi.mock("@/lib/repositories/webhooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/webhooks")>();
  return { ...actual, createEvent: mocks.createEvent };
});
vi.mock("@/lib/ids", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ids")>();
  return { ...actual, createApiKey: () => PLAINTEXT };
});

import { POST as createAgentRoute } from "@/app/api/dashboard/agents/route";
import { POST as rotateKeyRoute } from "@/app/api/dashboard/agents/[agentId]/rotate-key/route";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import { logger } from "@/lib/logger";

const ACTOR = { userId: "user_1", accountId: "acct_1", role: "OWNER", authorityLevel: 3 };

/**
 * A real `Request` (so the route's streaming body reader and size limits run
 * for real) with `nextUrl` attached, which is all NextRequest adds here.
 */
function makeRequest(body: unknown, url = "https://app.behalfid.com/api/dashboard/agents") {
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  return request as never;
}

/** A Postgres foreign-key violation, shaped exactly as the driver raises it. */
function foreignKeyViolation() {
  return Object.assign(new Error('insert or update on table "webhook_events" violates foreign key constraint'), {
    code: "23503",
    constraint: "webhook_events_account_id_fkey"
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVerifiedDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: "user_1" },
    activeAccountId: "acct_1"
  });
  mocks.requireDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: "user_1" },
    activeAccountId: "acct_1"
  });
  mocks.requireWorkspaceMutationActor.mockResolvedValue({ error: null, actor: ACTOR });
  mocks.getWorkspaceActor.mockResolvedValue(ACTOR);
  mocks.checkAgentLimit.mockResolvedValue({ allowed: true });
  mocks.createAgent.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc }));
  mocks.updateAgent.mockResolvedValue({ matchedCount: 1 });
  mocks.createEvent.mockResolvedValue({});
});

describe("POST /api/dashboard/agents — happy path", () => {
  it("returns 201 with the agent and the plaintext key exactly once", async () => {
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.agent.name).toBe("Deploy bot");
    expect(body.apiKey).toBe(PLAINTEXT);
    // Exactly once: the key must not also be echoed inside the agent object.
    expect(JSON.stringify(body).match(new RegExp(PLAINTEXT, "g"))).toHaveLength(1);
  });

  it("persists only the hash, never the plaintext key", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));

    const [persisted] = mocks.createAgent.mock.calls[0];
    expect(persisted.apiKeyHash).toBeTruthy();
    expect(persisted.apiKeyHash).not.toBe(PLAINTEXT);
    expect(JSON.stringify(persisted)).not.toContain(PLAINTEXT);
  });

  it("scopes the agent to the active workspace", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    const [persisted] = mocks.createAgent.mock.calls[0];
    expect(persisted.accountId).toBe("acct_1");
    expect(persisted.developerUserId).toBe("user_1");
  });
});

describe("the exact production failure", () => {
  it("emits the event with the workspace account id, not the user id", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));

    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    const [event] = mocks.createEvent.mock.calls[0];
    // The FK target. `usr_…` here is precisely what raised SQLSTATE 23503.
    expect(event.accountId).toBe("acct_1");
    expect(event.accountId).not.toBe("user_1");
    expect(event.developerUserId).toBe("user_1");
  });

  it("still returns 201 and the key when the event insert violates the FK", async () => {
    mocks.createEvent.mockRejectedValue(foreignKeyViolation());

    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));

    // The agent is committed; withholding the key would strand the credential.
    expect(res.status).toBe(201);
    expect((await res.json()).apiKey).toBe(PLAINTEXT);
  });

  it("logs the enqueue failure with a stable scope instead of swallowing it", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mocks.createEvent.mockRejectedValue(foreignKeyViolation());

    await createAgentRoute(makeRequest({ name: "Deploy bot" }));

    expect(spy).toHaveBeenCalledWith(
      "webhook_event_enqueue_failed",
      expect.objectContaining({ code: "23503", accountId: "acct_1", type: "agent.created" })
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain(PLAINTEXT);
    spy.mockRestore();
  });

  it("never lets any downstream event failure withhold a committed credential", async () => {
    for (const failure of [
      foreignKeyViolation(),
      Object.assign(new Error("not null"), { code: "23502" }),
      new Error("connection terminated unexpectedly")
    ]) {
      vi.clearAllMocks();
      mocks.createAgent.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc }));
      mocks.createEvent.mockRejectedValue(failure);

      const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
      expect(res.status).toBe(201);
      expect((await res.json()).apiKey).toBe(PLAINTEXT);
    }
  });
});

describe("createWebhookEvent account scoping", () => {
  it("refuses to substitute a user id for a missing account id", () => {
    const event = createWebhookEvent(null, "agent.created", { agentId: "agent_1" }, "user_1");
    // Previously this returned an event with accountId === "user_1".
    expect(event).toBeNull();
  });

  it("builds an event when a real account id is supplied", () => {
    const event = createWebhookEvent("acct_1", "agent.created", { agentId: "agent_1" }, "user_1");
    expect(event?.accountId).toBe("acct_1");
    expect(event?.developerUserId).toBe("user_1");
  });

  it("emitWebhookEvent reports success and failure without throwing", async () => {
    await expect(emitWebhookEvent(null)).resolves.toBe(false);

    mocks.createEvent.mockResolvedValue({});
    await expect(
      emitWebhookEvent(createWebhookEvent("acct_1", "agent.created", {}, "user_1"))
    ).resolves.toBe(true);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createEvent.mockRejectedValue(foreignKeyViolation());
    await expect(
      emitWebhookEvent(createWebhookEvent("acct_1", "agent.created", {}, "user_1"))
    ).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("POST /api/dashboard/agents — controlled failures", () => {
  it("returns a structured 500 when the agent insert itself fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createAgent.mockRejectedValue(Object.assign(new Error("deadlock"), { code: "40P01" }));

    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
    expect(body.error).toBeTruthy();
    expect(body.error).not.toContain("deadlock");
    expect(JSON.stringify(spy.mock.calls)).toContain("dashboard.agents.create");
    // A failed create must not leak the key it had already generated.
    expect(JSON.stringify(body)).not.toContain(PLAINTEXT);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(PLAINTEXT);
    spy.mockRestore();
  });

  it("does not emit an event when the agent was never committed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createAgent.mockRejectedValue(new Error("insert failed"));
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.createEvent).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects a missing name with 400", async () => {
    const res = await createAgentRoute(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("rejects unknown fields with 400", async () => {
    const res = await createAgentRoute(makeRequest({ name: "x", isAdmin: true }));
    expect(res.status).toBe(400);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("rejects a non-object body with 400", async () => {
    const res = await createAgentRoute(makeRequest([1, 2, 3]));
    expect(res.status).toBe(400);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("returns 402 with quota details when the agent limit is reached", async () => {
    mocks.checkAgentLimit.mockResolvedValue({ allowed: false, reason: "Agent limit reached." });
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(402);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("blocks an unverified developer before any mutation", async () => {
    mocks.requireVerifiedDeveloperApi.mockResolvedValue({
      error: new Response(null, { status: 403 }),
      user: null
    });
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(403);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("blocks a member without mutation authority", async () => {
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      error: new Response(null, { status: 403 }),
      actor: null
    });
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(403);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });
});

describe("POST /api/dashboard/agents/[agentId]/rotate-key", () => {
  const ctx = { params: Promise.resolve({ agentId: "agent_1" }) };

  it("returns a new plaintext key and stores only its hash", async () => {
    const res = await rotateKeyRoute(makeRequest({}), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).apiKey).toBe(PLAINTEXT);

    const [, update] = mocks.updateAgent.mock.calls[0];
    expect(update.$set.apiKeyHash).toBeTruthy();
    expect(update.$set.apiKeyHash).not.toBe(PLAINTEXT);
    expect(JSON.stringify(update)).not.toContain(PLAINTEXT);
  });

  it("scopes the rotation to the actor's own workspace", async () => {
    await rotateKeyRoute(makeRequest({}), ctx);
    const [filter] = mocks.updateAgent.mock.calls[0];
    expect(JSON.stringify(filter)).toContain("acct_1");
  });

  it("returns 404 rather than rotating another workspace's agent", async () => {
    // A cross-workspace agentId simply does not match the scoped filter.
    mocks.updateAgent.mockResolvedValue({ matchedCount: 0 });
    const res = await rotateKeyRoute(makeRequest({}), {
      params: Promise.resolve({ agentId: "agent_from_workspace_b" })
    });
    expect(res.status).toBe(404);
  });

  it("returns a structured 500 without leaking the new key when the update fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateAgent.mockRejectedValue(Object.assign(new Error("pool timeout"), { code: "57014" }));

    const res = await rotateKeyRoute(makeRequest({}), ctx);

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("internal_error");
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("agents.key_rotate");
    expect(logged).not.toContain(PLAINTEXT);
    spy.mockRestore();
  });

  it("does not report a completed rotation as failed when the event fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createEvent.mockRejectedValue(foreignKeyViolation());

    const res = await rotateKeyRoute(makeRequest({}), ctx);

    // The hash swap already happened — the old key is dead either way, so the
    // caller must receive the new one.
    expect(res.status).toBe(200);
    expect((await res.json()).apiKey).toBe(PLAINTEXT);
    spy.mockRestore();
  });
});
