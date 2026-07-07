import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateAgent, hashApiKey } from "@/lib/auth";
import { authenticateDeveloperToken, hashDeveloperToken } from "@/lib/developerToken";
import { getQuotas, verificationPeriodStart } from "@/lib/plans";
import { checkAgentLimit, checkAndIncrementVerifications } from "@/lib/quota";
import { checkSiteAccess } from "@/lib/siteGuard";
import { authenticateSiteGuardKey, hashSiteGuardKey } from "@/lib/siteGuardKey";
import { verifyAction } from "@/lib/verify";
import { WEBHOOK_MAX_ATTEMPTS } from "@/lib/webhooks";
import { processWebhookEvents } from "@/lib/webhookWorker";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import DeveloperApiToken from "@/models/DeveloperApiToken";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import Site from "@/models/Site";
import SiteAccessLog from "@/models/SiteAccessLog";
import SiteAccessRule from "@/models/SiteAccessRule";
import SiteGuardKey from "@/models/SiteGuardKey";
import StripeWebhookEvent from "@/models/StripeWebhookEvent";
import VerificationLog from "@/models/VerificationLog";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";

const developerAuthMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn()
}));

const billingMocks = vi.hoisted(() => ({
  constructEvent: vi.fn()
}));

const workerNetwork = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  statuses: [] as number[]
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: developerAuthMocks.requireDeveloperApi
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: billingMocks.constructEvent }
  })
}));

vi.mock("dns/promises", () => ({
  default: { lookup: workerNetwork.lookup }
}));

vi.mock("http", () => ({
  default: { request: workerNetwork.request }
}));

vi.mock("https", () => ({
  default: { request: workerNetwork.request }
}));

const rawApiKey = "bhf_sk_integration_abcdefghijklmnopqrstuvwxyz123456";
const rotatedApiKey = "bhf_sk_rotated_abcdefghijklmnopqrstuvwxyz123456";
const rawDeveloperToken = "bhf_dev_integration_abcdefghijklmnopqrstuvwxyz123456";

function requestWithBearer(apiKey: string) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` }
  }) as never;
}

function requestWithDeveloperToken(token: string) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "x-developer-token": token }
  }) as never;
}

function dashboardTokenRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/dashboard/tokens", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }) as never;
}

function siteGuardCheckRequest(token: string, body: unknown) {
  return new Request("http://localhost/api/site-guard/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-developer-token": token
    },
    body: JSON.stringify(body)
  }) as never;
}

function stripeRequest() {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_integration" },
    body: "{}"
  }) as never;
}

async function createAccountAndAgent(
  overrides: {
    accountId?: string;
    agentId?: string;
    apiKey?: string;
    plan?: "free" | "pro" | "enterprise";
  } = {}
) {
  const accountId = overrides.accountId ?? "acct_integration";
  const agentId = overrides.agentId ?? "agent_integration";
  const apiKey = overrides.apiKey ?? rawApiKey;

  const account = await Account.create({
    accountId,
    name: "Integration Account",
    plan: overrides.plan ?? "free"
  });
  const agent = await Agent.create({
    agentId,
    accountId,
    developerUserId: "dev_integration",
    name: "Integration Agent",
    apiKeyHash: hashApiKey(apiKey)
  });

  return { account, agent };
}

async function createPermission(overrides: Record<string, unknown> = {}) {
  return Permission.create({
    permissionId: `perm_${randomUUID()}`,
    accountId: "acct_integration",
    developerUserId: "dev_integration",
    agentId: "agent_integration",
    action: "purchase",
    constraints: {},
    status: "active",
    ...overrides
  });
}

async function createAgents(accountId: string, count: number, prefix: string) {
  await Agent.insertMany(
    Array.from({ length: count }, (_, index) => ({
      agentId: `${prefix}_${index}`,
      accountId,
      name: `${prefix} ${index}`,
      apiKeyHash: hashApiKey(`${prefix}_key_${index}`)
    }))
  );
}

async function createWebhookEndpoint(overrides: Record<string, unknown> = {}) {
  return WebhookEndpoint.create({
    webhookId: `wh_${randomUUID()}`,
    accountId: "acct_webhook",
    developerUserId: "dev_webhook",
    url: "https://hooks.example.com/behalf",
    secretHash: "secret_hash",
    secretPreview: "secret...hash",
    events: ["verification.allowed"],
    status: "active",
    ...overrides
  });
}

async function createWebhookEvent(overrides: Record<string, unknown> = {}) {
  const eventId = `evt_${randomUUID()}`;
  return WebhookEvent.create({
    eventId,
    accountId: "acct_webhook",
    developerUserId: "dev_webhook",
    type: "verification.allowed",
    payload: {
      eventId,
      accountId: "acct_webhook",
      developerUserId: "dev_webhook",
      type: "verification.allowed",
      createdAt: new Date().toISOString(),
      data: { requestId: "req_webhook" }
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    deadLetter: false,
    ...overrides
  });
}

function mockPinnedHttpStatuses(...statuses: number[]) {
  workerNetwork.statuses.push(...statuses);
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_integration");
  developerAuthMocks.requireDeveloperApi.mockResolvedValue({
    user: { userId: "dev_integration", primaryAccountId: "acct_integration" },
    account: { accountId: "acct_integration", plan: "pro" },
    error: null
  });
  billingMocks.constructEvent.mockReset();
  workerNetwork.statuses.length = 0;
  workerNetwork.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  workerNetwork.request.mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & {
      destroy: (error: Error) => void;
      end: () => void;
      write: (body: Buffer) => boolean;
    };
    request.write = vi.fn(() => true);
    request.destroy = (error) => request.emit("error", error);
    request.end = () => {
      callback({
        statusCode: workerNetwork.statuses.shift() ?? 204,
        resume: vi.fn()
      });
    };
    return request;
  });
});

describe("MongoDB-backed verification flows", () => {
  it("persists allowed and denied decisions and updates agent use for auth and verify", async () => {
    await createAccountAndAgent();
    await createPermission();

    const auth = await authenticateAgent(requestWithBearer(rawApiKey), "agent_integration");
    const allowed = await verifyAction({
      agentId: "agent_integration",
      accountId: "acct_integration",
      developerUserId: "dev_integration",
      agentStatus: auth.agent?.status,
      action: "purchase",
      amount: 25,
      vendor: "amazon.com"
    });
    const denied = await verifyAction({
      agentId: "agent_integration",
      accountId: "acct_integration",
      developerUserId: "dev_integration",
      action: "refund"
    });

    expect(auth.error).toBeNull();
    expect(allowed).toEqual(expect.objectContaining({
      allowed: true,
      permissionId: expect.stringMatching(/^perm_/)
    }));
    expect(denied).toEqual(expect.objectContaining({
      allowed: false,
      reason: "No active permission exists for this action."
    }));
    await expect(VerificationLog.find({ agentId: "agent_integration" }).sort({ createdAt: 1 }).lean()).resolves.toEqual([
      expect.objectContaining({ requestId: allowed.requestId, allowed: true, permissionId: allowed.permissionId }),
      expect.objectContaining({ requestId: denied.requestId, allowed: false, permissionId: null })
    ]);
    await vi.waitFor(async () => {
      const agent = await Agent.findOne({ agentId: "agent_integration" }).lean();
      expect(agent?.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  it("enforces revoked, expired, approval-gated, and cross-record blocked permissions", async () => {
    await createAccountAndAgent();
    await createPermission({ status: "revoked" });
    await expect(verifyAction({ agentId: "agent_integration", action: "purchase" })).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has been revoked." })
    );

    await Permission.deleteMany({});
    await createPermission({ constraints: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(verifyAction({ agentId: "agent_integration", action: "purchase" })).resolves.toEqual(
      expect.objectContaining({ allowed: false, reason: "Permission has expired." })
    );

    await Permission.deleteMany({});
    await createPermission({ requiresApproval: true });
    await expect(verifyAction({ agentId: "agent_integration", action: "purchase" })).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: "Permission requires approval before execution."
      })
    );

    await Permission.deleteMany({});
    await createPermission({
      permissionId: "perm_block_send",
      action: "email",
      blockedActions: ["send email"],
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    await createPermission({
      permissionId: "perm_allow_send",
      action: "send email",
      createdAt: new Date("2026-02-01T00:00:00.000Z")
    });
    const orderedPermissions = await Permission.find({ agentId: "agent_integration" })
      .sort({ createdAt: -1 })
      .select("permissionId")
      .lean();
    expect(orderedPermissions.map((permission) => permission.permissionId)).toEqual([
      "perm_allow_send",
      "perm_block_send"
    ]);
    await expect(verifyAction({ agentId: "agent_integration", action: "send email" })).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        permissionId: "perm_block_send",
        reason: "Action is blocked by this permission."
      })
    );
  });

  it("applies allowedActions narrowing and comma-separated resource/vendor matching", async () => {
    await createAccountAndAgent();
    await createPermission({
      action: "access_data",
      allowedActions: ["read email messages"],
      resource: "gmail.com, slack.com"
    });

    await expect(verifyAction({
      agentId: "agent_integration",
      action: "access_data",
      vendor: "slack.com"
    })).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: "Action is not included in allowedActions."
    }));
    await expect(verifyAction({
      agentId: "agent_integration",
      action: "read email messages",
      vendor: "slack.com"
    })).resolves.toEqual(expect.objectContaining({ allowed: true }));

    await Permission.deleteMany({});
    await createPermission({
      constraints: { allowedVendors: ["amazon.com, stripe.com"] }
    });
    await expect(verifyAction({
      agentId: "agent_integration",
      action: "purchase",
      vendor: "stripe.com"
    })).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("rejects an old rotated API key against the persisted hash", async () => {
    await createAccountAndAgent();
    await Agent.updateOne(
      { agentId: "agent_integration" },
      { $set: { apiKeyHash: hashApiKey(rotatedApiKey), keyRotatedAt: new Date() } }
    );

    await expect(authenticateAgent(requestWithBearer(rawApiKey), "agent_integration")).resolves.toEqual({
      agent: null,
      error: "API key does not match this agent."
    });
    const agent = await Agent.findOne({ agentId: "agent_integration" }).lean();
    expect(agent?.lastUsedAt).toBeUndefined();
  });
});

describe("MongoDB-backed Site Guard flow", () => {
  it("checks real Site and Rule records and writes a SiteAccessLog", async () => {
    await Site.create({
      siteId: "site_integration",
      accountId: "acct_site",
      developerUserId: "dev_site",
      name: "Docs",
      domain: "docs.example.com",
      status: "active"
    });
    await SiteAccessRule.create({
      ruleId: "sgr_integration",
      siteId: "site_integration",
      accountId: "acct_site",
      developerUserId: "dev_site",
      name: "Docs bot",
      userAgentPattern: "ExampleBot/*",
      allowedPaths: ["/docs/*"],
      blockedPaths: ["/docs/private/*"],
      status: "active"
    });

    const allowed = await checkSiteAccess({
      accountId: "acct_site",
      developerUserId: "dev_site",
      siteId: "site_integration",
      path: "/docs/api",
      userAgent: "ExampleBot/1.0"
    });
    const denied = await checkSiteAccess({
      accountId: "acct_site",
      developerUserId: "dev_site",
      siteId: "site_integration",
      path: "/docs/private/key",
      userAgent: "ExampleBot/1.0"
    });

    expect(allowed).toEqual(expect.objectContaining({ allowed: true, matchedRuleId: "sgr_integration" }));
    expect(denied).toEqual(expect.objectContaining({
      allowed: false,
      reason: "Path is blocked by an active Site Guard rule."
    }));
    await expect(SiteAccessLog.find({ siteId: "site_integration" }).sort({ createdAt: 1 }).lean()).resolves.toEqual([
      expect.objectContaining({ requestId: allowed.requestId, allowed: true, ruleId: "sgr_integration" }),
      expect.objectContaining({ requestId: denied.requestId, allowed: false, ruleId: "sgr_integration" })
    ]);
  });

  it("does not evaluate another developer's Site Guard site through a same-account developer token", async () => {
    const developerAToken = "bhf_dev_site_a_abcdefghijklmnopqrstuvwxyz123456";
    await DeveloperApiToken.create({
      tokenId: "tok_site_a",
      userId: "dev_site_a",
      accountId: "acct_site_shared",
      name: "Site A token",
      tokenHash: hashDeveloperToken(developerAToken)
    });
    await Site.create({
      siteId: "site_dev_b",
      accountId: "acct_site_shared",
      developerUserId: "dev_site_b",
      name: "Developer B Docs",
      domain: "b-docs.example.com",
      status: "active"
    });
    await SiteAccessRule.create({
      ruleId: "sgr_dev_b",
      siteId: "site_dev_b",
      accountId: "acct_site_shared",
      developerUserId: "dev_site_b",
      name: "Developer B allow",
      userAgentPattern: "ExampleBot/*",
      allowedPaths: ["/docs/*"],
      blockedPaths: [],
      status: "active"
    });

    const { POST } = await import("@/app/api/site-guard/check/route");
    const bySiteId = await POST(siteGuardCheckRequest(developerAToken, {
      siteId: "site_dev_b",
      path: "/docs/api",
      userAgent: "ExampleBot/1.0"
    }));
    const byDomain = await POST(siteGuardCheckRequest(developerAToken, {
      domain: "b-docs.example.com",
      path: "/docs/api",
      userAgent: "ExampleBot/1.0"
    }));

    expect(bySiteId.status).toBe(200);
    await expect(bySiteId.json()).resolves.toEqual(expect.objectContaining({
      allowed: false,
      matchedRuleId: null,
      reason: "Site not found.",
      siteId: null
    }));
    await expect(byDomain.json()).resolves.toEqual(expect.objectContaining({
      allowed: false,
      matchedRuleId: null,
      reason: "Site not found.",
      siteId: null
    }));
    await expect(SiteAccessLog.countDocuments({ siteId: "site_dev_b" })).resolves.toBe(0);
  });
});

describe("MongoDB-backed Site Guard key flow", () => {
  const rawSiteKey = "bhf_site_integration_abcdefghijklmnopqrstuvwxyz12";

  function siteKeyCheckRequest(key: string, body: unknown) {
    return new Request("http://localhost/api/site-guard/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${key}`
      },
      body: JSON.stringify(body)
    }) as never;
  }

  async function seedSiteAndKey() {
    await Site.create({
      siteId: "site_key_integration",
      accountId: "acct_key",
      developerUserId: "dev_key",
      name: "Key site",
      domain: "key.example.com",
      status: "active"
    });
    await SiteGuardKey.create({
      keyId: "sgk_integration",
      siteId: "site_key_integration",
      accountId: "acct_key",
      developerUserId: "dev_key",
      name: "Integration key",
      keyHash: hashSiteGuardKey(rawSiteKey),
      keyPreview: "bhf_site_integra...yz12",
      status: "active"
    });
  }

  it("authenticates an active site key", async () => {
    await seedSiteAndKey();

    const req = new Request("http://localhost", {
      headers: { authorization: `Bearer ${rawSiteKey}` }
    }) as never;
    const result = await authenticateSiteGuardKey(req);

    expect(result.error).toBeNull();
    expect(result.keyDoc).toMatchObject({ keyId: "sgk_integration", siteId: "site_key_integration" });
  });

  it("refuses a revoked key", async () => {
    await SiteGuardKey.create({
      keyId: "sgk_revoked",
      siteId: "site_key_integration",
      accountId: "acct_key",
      developerUserId: "dev_key",
      name: "Revoked key",
      keyHash: hashSiteGuardKey("bhf_site_revoked_abcdefghijklmnopqrstuvwxyz12"),
      keyPreview: "bhf_site_revoked...yz12",
      status: "revoked"
    });

    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer bhf_site_revoked_abcdefghijklmnopqrstuvwxyz12" }
    }) as never;
    const result = await authenticateSiteGuardKey(req);

    expect(result.keyDoc).toBeNull();
    expect(result.error).toBe("Site Guard key has been revoked.");
  });

  it("scopes the check to the key's site even when a different siteId is in the body", async () => {
    await seedSiteAndKey();
    await SiteAccessRule.create({
      ruleId: "sgr_key_integration",
      siteId: "site_key_integration",
      accountId: "acct_key",
      developerUserId: "dev_key",
      name: "Allow docs",
      userAgentPattern: "Bot/*",
      allowedPaths: ["/docs/*"],
      blockedPaths: [],
      status: "active"
    });

    const { POST } = await import("@/app/api/site-guard/check/route");
    const response = await POST(siteKeyCheckRequest(rawSiteKey, {
      siteId: "site_attacker",
      domain: "evil.example.com",
      path: "/docs/api",
      userAgent: "Bot/1.0"
    }));

    expect(response.status).toBe(200);
    const json = await response.json() as { allowed: boolean; siteId: string };
    expect(json.allowed).toBe(true);
    expect(json.siteId).toBe("site_key_integration");
    await expect(SiteAccessLog.countDocuments({ siteId: "site_attacker" })).resolves.toBe(0);
  });

  it("updates lastUsedAt on the SiteGuardKey after a successful check", async () => {
    await seedSiteAndKey();
    await SiteAccessRule.create({
      ruleId: "sgr_key_lastused",
      siteId: "site_key_integration",
      accountId: "acct_key",
      developerUserId: "dev_key",
      name: "Allow docs",
      userAgentPattern: "Bot/*",
      allowedPaths: ["/docs/*"],
      blockedPaths: [],
      status: "active"
    });

    const { POST } = await import("@/app/api/site-guard/check/route");
    await POST(siteKeyCheckRequest(rawSiteKey, {
      path: "/docs/api",
      userAgent: "Bot/1.0"
    }));

    await vi.waitFor(async () => {
      const key = await SiteGuardKey.findOne({ keyId: "sgk_integration" }).lean();
      expect(key?.lastUsedAt).toBeInstanceOf(Date);
    });
  });
});

describe("MongoDB-backed quotas", () => {
  it("enforces free and pro agent limits with persisted Agent counts", async () => {
    await Account.create({ accountId: "acct_free", name: "Free", plan: "free" });
    await Account.create({ accountId: "acct_pro", name: "Pro", plan: "pro" });
    await createAgents("acct_free", getQuotas("free").maxAgents, "free_agent");
    await createAgents("acct_pro", getQuotas("pro").maxAgents, "pro_agent");

    await expect(checkAgentLimit("acct_free")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "AGENT_LIMIT_REACHED", limit: 3 })
    );
    await expect(checkAgentLimit("acct_pro")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "AGENT_LIMIT_REACHED", limit: 50 })
    );
  });

  it("enforces, resets, and bypasses monthly verification quotas according to plan", async () => {
    await Account.create({
      accountId: "acct_limit",
      name: "At limit",
      plan: "free",
      verificationCount: getQuotas("free").verificationsPerMonth,
      verificationPeriodStart: verificationPeriodStart()
    });
    await Account.create({
      accountId: "acct_reset",
      name: "Reset",
      plan: "free",
      verificationCount: getQuotas("free").verificationsPerMonth,
      verificationPeriodStart: new Date("2024-01-01T00:00:00.000Z")
    });
    await Account.create({
      accountId: "acct_pro_limit",
      name: "Pro limit",
      plan: "pro",
      verificationCount: getQuotas("pro").verificationsPerMonth,
      verificationPeriodStart: verificationPeriodStart()
    });
    await Account.create({
      accountId: "acct_enterprise",
      name: "Enterprise",
      plan: "enterprise",
      verificationCount: Number.MAX_SAFE_INTEGER
    });

    await expect(checkAndIncrementVerifications("acct_limit")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "VERIFICATION_LIMIT_REACHED", limit: 10_000 })
    );
    await expect(checkAndIncrementVerifications("acct_pro_limit")).resolves.toEqual(
      expect.objectContaining({ allowed: false, code: "VERIFICATION_LIMIT_REACHED", limit: 250_000 })
    );
    await expect(checkAndIncrementVerifications("acct_reset")).resolves.toEqual({ allowed: true });
    await expect(Account.findOne({ accountId: "acct_reset" }).lean()).resolves.toEqual(
      expect.objectContaining({ verificationCount: 1 })
    );
    await expect(checkAndIncrementVerifications("acct_enterprise")).resolves.toEqual({ allowed: true });
    await expect(Account.findOne({ accountId: "acct_enterprise" }).lean()).resolves.toEqual(
      expect.objectContaining({ verificationCount: Number.MAX_SAFE_INTEGER })
    );
  });

  it("fails closed when accountId is missing but stays unmetered for a missing Account document", async () => {
    // Decision note for issue #77 lives in lib/quota.ts: metered helpers deny
    // lost account context, while a known accountId without an Account document
    // remains unmetered because it indicates data inconsistency, not lost auth.
    const denied = expect.objectContaining({ allowed: false, code: "ACCOUNT_CONTEXT_MISSING" });
    await expect(checkAgentLimit(undefined)).resolves.toEqual(denied);
    await expect(checkAndIncrementVerifications(undefined)).resolves.toEqual(denied);
    await expect(checkAgentLimit("acct_missing")).resolves.toEqual({ allowed: true });
    await expect(checkAndIncrementVerifications("acct_missing")).resolves.toEqual({ allowed: true });
  });
});

describe("MongoDB-backed webhook worker", () => {
  it("completes matching events, skips filtered endpoints, and writes delivery records", async () => {
    await createWebhookEndpoint({ webhookId: "wh_match" });
    await createWebhookEndpoint({ webhookId: "wh_disabled", status: "disabled" });
    await createWebhookEndpoint({ webhookId: "wh_wrong_event", events: ["verification.denied"] });
    await createWebhookEndpoint({
      webhookId: "wh_wrong_account",
      accountId: "acct_other",
      developerUserId: "dev_other"
    });
    const event = await createWebhookEvent();
    mockPinnedHttpStatuses(204);

    await expect(processWebhookEvents(1)).resolves.toEqual(expect.objectContaining({
      processed: 1,
      completed: 1,
      retried: 0
    }));
    await expect(WebhookEvent.findOne({ eventId: event.eventId }).lean()).resolves.toEqual(
      expect.objectContaining({ status: "completed", attempts: 1, deadLetter: false })
    );
    await expect(WebhookDelivery.find({ eventId: event.eventId }).lean()).resolves.toEqual([
      expect.objectContaining({ webhookId: "wh_match", status: "success", attempt: 1 })
    ]);
  });

  it("records failed delivery attempts and schedules retries", async () => {
    await createWebhookEndpoint({ webhookId: "wh_retry" });
    const event = await createWebhookEvent();
    mockPinnedHttpStatuses(500);

    await expect(processWebhookEvents(1)).resolves.toEqual(expect.objectContaining({
      processed: 1,
      retried: 1,
      failed: 0
    }));
    const stored = await WebhookEvent.findOne({ eventId: event.eventId }).lean();
    expect(stored).toEqual(expect.objectContaining({ status: "pending", attempts: 1 }));
    expect(stored?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await expect(WebhookDelivery.findOne({ eventId: event.eventId }).lean()).resolves.toEqual(
      expect.objectContaining({ status: "failed", httpStatus: 500, attempt: 1 })
    );
  });

  it("dead-letters events that fail at the maximum attempt", async () => {
    await createWebhookEndpoint({ webhookId: "wh_dead_letter" });
    const event = await createWebhookEvent({ attempts: WEBHOOK_MAX_ATTEMPTS - 1 });
    mockPinnedHttpStatuses(500);

    await expect(processWebhookEvents(1)).resolves.toEqual(expect.objectContaining({
      processed: 1,
      failed: 1,
      deadLettered: 1
    }));
    await expect(WebhookEvent.findOne({ eventId: event.eventId }).lean()).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        attempts: WEBHOOK_MAX_ATTEMPTS,
        deadLetter: true
      })
    );
  });
});

describe("MongoDB-backed billing webhooks", () => {
  async function createPaidAccountState() {
    await Account.create({
      accountId: "acct_billing",
      name: "Billing",
      plan: "pro",
      stripeCustomerId: "cus_billing",
      stripeSubscriptionId: "sub_billing",
      stripeSubscriptionStatus: "active"
    });
    await DeveloperUser.create({
      userId: "dev_billing",
      email: "billing@example.com",
      passwordHash: "hash",
      primaryAccountId: "acct_billing"
    });
    await createWebhookEndpoint({
      webhookId: "wh_billing",
      accountId: "acct_billing",
      developerUserId: "dev_billing"
    });
  }

  it("claims Stripe event IDs once and applies checkout plan updates", async () => {
    await Account.create({ accountId: "acct_checkout", name: "Checkout", plan: "free" });
    await DeveloperUser.create({
      userId: "dev_checkout",
      email: "checkout@example.com",
      passwordHash: "hash",
      primaryAccountId: "acct_checkout"
    });
    await createWebhookEndpoint({
      webhookId: "wh_checkout",
      accountId: "acct_checkout",
      developerUserId: "dev_checkout",
      status: "disabled"
    });
    await StripeWebhookEvent.init();
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "acct_checkout",
          customer: "cus_checkout",
          subscription: "sub_checkout"
        }
      }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    expect((await POST(stripeRequest())).status).toBe(204);
    expect((await POST(stripeRequest())).status).toBe(204);
    await expect(Account.findOne({ accountId: "acct_checkout" }).lean()).resolves.toEqual(
      expect.objectContaining({
        plan: "pro",
        stripeCustomerId: "cus_checkout",
        stripeSubscriptionId: "sub_checkout",
        stripeSubscriptionStatus: "active"
      })
    );
    await expect(WebhookEndpoint.findOne({ webhookId: "wh_checkout" }).lean()).resolves.toEqual(
      expect.objectContaining({ status: "active" })
    );
    await expect(StripeWebhookEvent.countDocuments({ eventId: "evt_checkout" })).resolves.toBe(1);
  });

  it("disables webhooks for subscription deletion and failed invoices", async () => {
    await createPaidAccountState();
    const { POST } = await import("@/app/api/billing/webhook/route");

    billingMocks.constructEvent.mockReturnValue({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_billing" } }
    });
    expect((await POST(stripeRequest())).status).toBe(204);
    await expect(Account.findOne({ accountId: "acct_billing" }).lean()).resolves.toEqual(
      expect.objectContaining({ plan: "free", stripeSubscriptionId: null, stripeSubscriptionStatus: "canceled" })
    );
    await expect(WebhookEndpoint.findOne({ webhookId: "wh_billing" }).lean()).resolves.toEqual(
      expect.objectContaining({ status: "disabled" })
    );

    await WebhookEndpoint.updateOne({ webhookId: "wh_billing" }, { $set: { status: "active" } });
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_failed_invoice",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_billing" } }
    });
    expect((await POST(stripeRequest())).status).toBe(204);
    await expect(Account.findOne({ accountId: "acct_billing" }).lean()).resolves.toEqual(
      expect.objectContaining({ plan: "free", stripeSubscriptionStatus: "past_due" })
    );
    await expect(WebhookEndpoint.findOne({ webhookId: "wh_billing" }).lean()).resolves.toEqual(
      expect.objectContaining({ status: "disabled" })
    );
  });

  it("records and safely ignores unknown Stripe event types", async () => {
    billingMocks.constructEvent.mockReturnValue({
      id: "evt_unknown",
      type: "billing_portal.session.created",
      data: { object: {} }
    });
    const { POST } = await import("@/app/api/billing/webhook/route");

    expect((await POST(stripeRequest())).status).toBe(204);
    await expect(StripeWebhookEvent.findOne({ eventId: "evt_unknown" }).lean()).resolves.toEqual(
      expect.objectContaining({ type: "billing_portal.session.created" })
    );
    await expect(Account.countDocuments()).resolves.toBe(0);
  });
});

describe("MongoDB-backed developer tokens", () => {
  it("stores hashes, lists previews, authenticates use, and deletes owned tokens", async () => {
    const { GET, POST } = await import("@/app/api/dashboard/tokens/route");
    const { DELETE } = await import("@/app/api/dashboard/tokens/[tokenId]/route");

    const created = await POST(dashboardTokenRequest("POST", { name: "CI" }));
    const createdJson = await created.json();
    const stored = await DeveloperApiToken.findOne({ tokenId: createdJson.tokenId }).select("+tokenHash");

    expect(created.status).toBe(201);
    expect(stored?.tokenHash).toBe(hashDeveloperToken(createdJson.token));
    expect(stored?.tokenHash).not.toBe(createdJson.token);
    expect(stored?.tokenPreview).toBe(createdJson.tokenPreview);

    const listedJson = await (await GET(dashboardTokenRequest("GET"))).json();
    expect(listedJson.tokens).toEqual([
      expect.objectContaining({
        tokenId: createdJson.tokenId,
        tokenPreview: createdJson.tokenPreview
      })
    ]);
    expect(JSON.stringify(listedJson)).not.toContain(createdJson.token);

    await expect(authenticateDeveloperToken(requestWithDeveloperToken(createdJson.token))).resolves.toEqual(
      expect.objectContaining({ error: null })
    );
    await vi.waitFor(async () => {
      const used = await DeveloperApiToken.findOne({ tokenId: createdJson.tokenId }).lean();
      expect(used?.lastUsedAt).toBeInstanceOf(Date);
    });

    const deleted = await DELETE(dashboardTokenRequest("DELETE"), {
      params: Promise.resolve({ tokenId: createdJson.tokenId })
    });
    expect(deleted.status).toBe(204);
    await expect(DeveloperApiToken.countDocuments({ tokenId: createdJson.tokenId })).resolves.toBe(0);
  });

  it("does not update persisted tokens for invalid developer token authentication", async () => {
    await DeveloperApiToken.create({
      tokenId: "tok_valid",
      userId: "dev_integration",
      accountId: "acct_integration",
      name: "CI",
      tokenPreview: "bhf_dev_val...token",
      tokenHash: hashDeveloperToken(rawDeveloperToken)
    });

    await expect(authenticateDeveloperToken(
      requestWithDeveloperToken("bhf_dev_invalid_abcdefghijklmnopqrstuvwxyz123456")
    )).resolves.toEqual({
      tokenDoc: null,
      error: "Invalid developer token."
    });
    const stored = await DeveloperApiToken.findOne({ tokenId: "tok_valid" }).lean();
    expect(stored?.lastUsedAt).toBeUndefined();
  });
});
