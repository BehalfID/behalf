/**
 * Critical flows exercised against a real Postgres database.
 *
 * Every one of the recent production incidents was invisible to the mocked
 * suites because the mock accepted what Postgres rejects:
 *
 *   - `$exists` in an agent filter          → "Unsupported agent filter operator"
 *   - `findLogs(...).lean()`                → not a function on a plain Promise
 *   - a user id written to `account_id`     → foreign-key violation 23503
 *
 * These tests run the actual Postgres adapters against the canonical migration
 * chain in a disposable schema. No repository return shapes are mocked.
 *
 *   POSTGRES_TEST_URL=postgres://… RUN_POSTGRES_API_FLOWS=true npm run test:api-postgres
 *
 * Never point this at production: the harness creates and drops its own schema.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashApiKey } from "@/lib/auth";
import {
  accountMemberships,
  accounts,
  agents,
  developerUsers,
  webhookEvents
} from "@/lib/db/postgres/schema";
import { createPublicId } from "@/lib/ids";
import { MISSING_ACCOUNT_ID_CLAUSE } from "@/lib/missingAccountId";
import {
  countAgentsByAccountId,
  createAgent,
  findOneAgent,
  listAgents,
  updateAgent
} from "@/lib/repositories/postgres/agents";
import { createEvent } from "@/lib/repositories/postgres/webhooks";
import { findLogs } from "@/lib/repositories/postgres/verificationLogs";
import {
  resolveSmokeTestUrl,
  setupPostgresContractTestSchema,
  truncatePostgresContractTables,
  type PostgresContractTestContext
} from "../scripts/postgres-smoke";

const enabled = process.env.RUN_POSTGRES_API_FLOWS === "true" && Boolean(resolveSmokeTestUrl());

const PLAINTEXT_KEY = "bhf_sk_flow_abcdefghijklmnopqrstuvwxyz0123";

let context: PostgresContractTestContext | undefined;

beforeAll(async () => {
  if (!enabled) return;
  const url = resolveSmokeTestUrl();
  expect(url, "POSTGRES_TEST_URL, DATABASE_URL or POSTGRES_URL required").toBeTruthy();
  context = await setupPostgresContractTestSchema(url!);
}, 60_000);

afterEach(async () => {
  if (context) await truncatePostgresContractTables(context.sql, context.schemaName);
});

afterAll(async () => {
  await context?.cleanup();
});

describe("postgres API critical flows (optional)", () => {
  it("is skipped unless RUN_POSTGRES_API_FLOWS=true and a Postgres URL is set", () => {
    if (process.env.RUN_POSTGRES_API_FLOWS === "true" && resolveSmokeTestUrl()) {
      expect(enabled).toBe(true);
      return;
    }
    expect(enabled).toBe(false);
  });
});

if (enabled) {
  /** A workspace with an owner, built the way the app builds one. */
  async function seedWorkspace(label: string) {
    const db = context!.db;
    const userId = createPublicId("usr");
    const accountId = createPublicId("acct");

    await db.insert(developerUsers).values({
      userId,
      email: `${label}-${userId}@example.test`,
      name: `${label} owner`,
      emailVerified: true
    } as never);
    await db.insert(accounts).values({ accountId, name: `${label} workspace` } as never);
    await db.insert(accountMemberships).values({
      membershipId: createPublicId("mem"),
      accountId,
      userId,
      role: "OWNER",
      status: "active"
    } as never);

    return { userId, accountId };
  }

  describe("agent creation and the one-time key", () => {
    it("persists only the API-key hash and reads the agent back", async () => {
      const db = context!.db;
      const { userId, accountId } = await seedWorkspace("create");
      const agentId = createPublicId("agent");

      await createAgent(db, {
        agentId,
        accountId,
        developerUserId: userId,
        name: "Deploy bot",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      const stored = await findOneAgent(db, { accountId, agentId });
      expect(stored).toBeTruthy();
      expect(stored!.name).toBe("Deploy bot");
      // The plaintext must exist nowhere in the row.
      expect(JSON.stringify(stored)).not.toContain(PLAINTEXT_KEY);
      expect(stored!.apiKeyHash).toBe(hashApiKey(PLAINTEXT_KEY));
    });

    it("rotates the key so the old hash no longer matches", async () => {
      const db = context!.db;
      const { userId, accountId } = await seedWorkspace("rotate");
      const agentId = createPublicId("agent");
      const rotated = "bhf_sk_rotated_zyxwvutsrqponmlkjihgfedcba98";

      await createAgent(db, {
        agentId,
        accountId,
        developerUserId: userId,
        name: "Rotate me",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      const result = await updateAgent(
        db,
        { accountId, agentId },
        { $set: { apiKeyHash: hashApiKey(rotated), keyRotatedAt: new Date() } }
      );
      expect(result.matchedCount).toBe(1);

      const stored = await findOneAgent(db, { accountId, agentId });
      expect(stored!.apiKeyHash).toBe(hashApiKey(rotated));
      expect(stored!.apiKeyHash).not.toBe(hashApiKey(PLAINTEXT_KEY));
    });
  });

  describe("the webhook_events foreign key — Miles's 500", () => {
    it("rejects an event whose account id is really a user id", async () => {
      const db = context!.db;
      const { userId, accountId } = await seedWorkspace("fk");

      // Exactly what `createWebhookEvent(null, …, developerUserId)` used to build.
      await expect(
        createEvent(db, {
          eventId: createPublicId("evt"),
          accountId: userId,
          developerUserId: userId,
          type: "agent.created",
          payload: { agentId: "agent_1" },
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          deadLetter: false
        })
      ).rejects.toThrowError();

      // And the correctly-scoped event inserts cleanly.
      await expect(
        createEvent(db, {
          eventId: createPublicId("evt"),
          accountId,
          developerUserId: userId,
          type: "agent.created",
          payload: { agentId: "agent_1" },
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          deadLetter: false
        })
      ).resolves.toBeTruthy();
    });

    it("surfaces the violation as SQLSTATE 23503", async () => {
      const db = context!.db;
      const { userId } = await seedWorkspace("fkcode");
      let raised: unknown;
      try {
        await createEvent(db, {
          eventId: createPublicId("evt"),
          accountId: userId,
          developerUserId: userId,
          type: "agent.created",
          payload: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          deadLetter: false
        });
      } catch (error) {
        raised = error;
      }
      expect(raised).toBeTruthy();
      // Translated by lib/repositories/errors.ts into a constraint error.
      const cause = (raised as { cause?: { code?: string }; code?: string });
      const code = cause.code ?? cause.cause?.code;
      expect(String(code ?? "")).toMatch(/23503|FOREIGN_KEY/);
    });
  });

  describe("filters that used to be Mongo-only", () => {
    it("accepts the missing-accountId clause and returns legacy rows", async () => {
      const db = context!.db;
      const { userId } = await seedWorkspace("legacy");
      const agentId = createPublicId("agent");

      await createAgent(db, {
        agentId,
        developerUserId: userId,
        name: "Unscoped legacy agent",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      const rows = await listAgents(db, {
        developerUserId: userId,
        ...MISSING_ACCOUNT_ID_CLAUSE
      });
      expect(rows.map((r) => r.agentId)).toContain(agentId);
    });

    it("still rejects $exists, so the guard is meaningful", async () => {
      const db = context!.db;
      const { userId } = await seedWorkspace("exists");
      await expect(
        listAgents(db, { developerUserId: userId, accountId: { $exists: false } } as never)
      ).rejects.toThrowError(/Unsupported/i);
    });

    it("findLogs resolves to a plain array with no .lean()", async () => {
      const db = context!.db;
      const { accountId } = await seedWorkspace("logs");
      const query = findLogs(db, { accountId }, { sort: { createdAt: -1 }, limit: 10, skip: 0 });

      expect(typeof (query as { lean?: unknown }).lean).toBe("undefined");
      const rows = await query;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toEqual([]);
    });
  });

  describe("workspace isolation", () => {
    it("never returns another workspace's agents", async () => {
      const db = context!.db;
      const a = await seedWorkspace("iso-a");
      const b = await seedWorkspace("iso-b");

      const agentA = createPublicId("agent");
      await createAgent(db, {
        agentId: agentA,
        accountId: a.accountId,
        developerUserId: a.userId,
        name: "A's agent",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      expect(await listAgents(db, { accountId: b.accountId })).toEqual([]);
      expect(await findOneAgent(db, { accountId: b.accountId, agentId: agentA })).toBeNull();
      expect(await countAgentsByAccountId(db, b.accountId)).toBe(0);
      expect(await countAgentsByAccountId(db, a.accountId)).toBe(1);
    });

    it("cannot rotate an agent that belongs to another workspace", async () => {
      const db = context!.db;
      const a = await seedWorkspace("rot-a");
      const b = await seedWorkspace("rot-b");
      const agentA = createPublicId("agent");

      await createAgent(db, {
        agentId: agentA,
        accountId: a.accountId,
        developerUserId: a.userId,
        name: "A's agent",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      // The scoped filter simply does not match — no rows touched.
      const result = await updateAgent(
        db,
        { accountId: b.accountId, agentId: agentA },
        { $set: { apiKeyHash: hashApiKey("bhf_sk_attacker_00000000000000000000") } }
      );
      expect(result.matchedCount).toBe(0);

      const untouched = await findOneAgent(db, { accountId: a.accountId, agentId: agentA });
      expect(untouched!.apiKeyHash).toBe(hashApiKey(PLAINTEXT_KEY));
    });
  });

  describe("empty state on a fresh workspace", () => {
    it("returns controlled empty collections rather than throwing", async () => {
      const db = context!.db;
      const { accountId } = await seedWorkspace("empty");

      expect(await listAgents(db, { accountId })).toEqual([]);
      expect(await countAgentsByAccountId(db, accountId)).toBe(0);
      expect(await findLogs(db, { accountId }, { limit: 10, skip: 0 })).toEqual([]);
      expect(await findOneAgent(db, { accountId, agentId: "agent_missing" })).toBeNull();
    });

    it("a stale workspace id reads as empty, not as an error", async () => {
      const db = context!.db;
      await seedWorkspace("stale");
      const goneAccountId = createPublicId("acct");

      expect(await listAgents(db, { accountId: goneAccountId })).toEqual([]);
      expect(await countAgentsByAccountId(db, goneAccountId)).toBe(0);
    });
  });

  describe("webhook events are readable after a successful enqueue", () => {
    it("stores the event against the owning account", async () => {
      const db = context!.db;
      const { userId, accountId } = await seedWorkspace("evt");
      const eventId = createPublicId("evt");

      await createEvent(db, {
        eventId,
        accountId,
        developerUserId: userId,
        type: "agent.created",
        payload: { agentId: "agent_1" },
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        deadLetter: false
      });

      const rows = await db.select().from(webhookEvents);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.accountId).toBe(accountId);
      expect(JSON.stringify(rows[0])).not.toContain(PLAINTEXT_KEY);
    });
  });

  describe("the resolved workspace account id, end to end", () => {
    it("scopes the agent and its event to the same account", async () => {
      const db = context!.db;
      // Stands in for the account the actor resolved to — whether that came
      // from activeAccountId or from primaryAccountId is invisible here, which
      // is the point: one id reaches every write.
      const { userId, accountId } = await seedWorkspace("resolved");
      const agentId = createPublicId("agent");

      await createAgent(db, {
        agentId,
        accountId,
        developerUserId: userId,
        name: "Resolved workspace agent",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      await createEvent(db, {
        eventId: createPublicId("evt"),
        accountId,
        developerUserId: userId,
        type: "agent.created",
        payload: { agentId },
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        deadLetter: false
      });

      const stored = await findOneAgent(db, { accountId, agentId });
      const [event] = await db.select().from(webhookEvents);
      expect(stored!.accountId).toBe(accountId);
      // The identity the route now guarantees.
      expect(event!.accountId).toBe(stored!.accountId);
    });

    it("an agent written without an account id is invisible to its workspace", async () => {
      const db = context!.db;
      // Exactly what `createDeveloperAgent(userId, undefined, …)` produced when
      // the route re-read a null activeAccountId after authorization.
      const { userId, accountId } = await seedWorkspace("unscoped");
      const agentId = createPublicId("agent");

      await createAgent(db, {
        agentId,
        developerUserId: userId,
        name: "Legacy unscoped agent",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      // The workspace the user actually authorized against cannot see it.
      expect(await listAgents(db, { accountId })).toEqual([]);
      expect(await countAgentsByAccountId(db, accountId)).toBe(0);
      expect(await findOneAgent(db, { accountId, agentId })).toBeNull();
      // It only surfaces through the legacy backfill clause.
      const legacy = await listAgents(db, {
        developerUserId: userId,
        ...MISSING_ACCOUNT_ID_CLAUSE
      });
      expect(legacy.map((r) => r.agentId)).toContain(agentId);
    });
  });

  describe("agents table shape", () => {
    it("never stores a plaintext key column", async () => {
      const db = context!.db;
      const { userId, accountId } = await seedWorkspace("shape");
      await createAgent(db, {
        agentId: createPublicId("agent"),
        accountId,
        developerUserId: userId,
        name: "Shape check",
        agentType: "native",
        provider: "custom",
        connectionStatus: "manual",
        apiKeyHash: hashApiKey(PLAINTEXT_KEY),
        status: "active"
      } as never);

      const rows = await db.select().from(agents);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toContain(PLAINTEXT_KEY);
      expect(Object.keys(rows[0]!)).not.toContain("apiKey");
    });
  });
}
