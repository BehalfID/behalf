import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountFixture, developerUserFixture } from "./fixtures";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireVerifiedDeveloperApi: vi.fn(),
  agentCountDocuments: vi.fn(),
  agentFind: vi.fn(),
  agentCreate: vi.fn(),
  accountFindOne: vi.fn(),
  permissionCountDocuments: vi.fn(),
  verificationLogCountDocuments: vi.fn(),
  webhookEventCountDocuments: vi.fn(),
  webhookEndpointFind: vi.fn(),
  webhookEndpointCreate: vi.fn(),
  createPublicId: vi.fn(),
  createApiKey: vi.fn(),
  createWebhookEvent: vi.fn(),
  emitWebhookEvent: vi.fn(),
  createSigningSecret: vi.fn(),
  validateWebhookUrl: vi.fn(),
  validateWebhookEvents: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: routeMocks.requireVerifiedDeveloperApi
}));
vi.mock("@/lib/ids", () => ({
  createPublicId: routeMocks.createPublicId,
  createApiKey: routeMocks.createApiKey
}));
vi.mock("@/lib/webhooks", () => ({
  WEBHOOK_EVENT_TYPES: ["verification.allowed", "verification.denied"],
  createWebhookEvent: routeMocks.createWebhookEvent,
  emitWebhookEvent: routeMocks.emitWebhookEvent,
  createSigningSecret: routeMocks.createSigningSecret,
  validateWebhookUrl: routeMocks.validateWebhookUrl,
  validateWebhookEvents: routeMocks.validateWebhookEvents
}));
vi.mock("@/models/Account", () => ({
  default: { findOne: routeMocks.accountFindOne }
}));
vi.mock("@/models/Agent", () => ({
  default: {
    countDocuments: routeMocks.agentCountDocuments,
    find: routeMocks.agentFind,
    create: routeMocks.agentCreate
  }
}));
vi.mock("@/models/Permission", () => ({
  default: { countDocuments: routeMocks.permissionCountDocuments }
}));
vi.mock("@/models/VerificationLog", () => ({
  default: { countDocuments: routeMocks.verificationLogCountDocuments }
}));
vi.mock("@/models/WebhookEvent", () => ({
  default: { countDocuments: routeMocks.webhookEventCountDocuments }
}));
vi.mock("@/models/WebhookEndpoint", () => ({
  default: {
    find: routeMocks.webhookEndpointFind,
    create: routeMocks.webhookEndpointCreate
  }
}));

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("dashboard billing and quota route UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = developerUserFixture({ primaryAccountId: "acct_test" });
    const account = accountFixture({
      plan: "free",
      stripeCustomerId: "cus_secret",
      stripeSubscriptionId: "sub_secret",
      verificationCount: 123,
      verificationPeriodStart: new Date("2026-05-01T00:00:00.000Z")
    });
    routeMocks.requireDeveloperApi.mockResolvedValue({ user, account, error: null });
    routeMocks.requireVerifiedDeveloperApi.mockResolvedValue({ user, account, error: null });
    routeMocks.accountFindOne.mockResolvedValue(account);
    routeMocks.agentCountDocuments.mockResolvedValue(0);
    routeMocks.permissionCountDocuments.mockResolvedValue(0);
    routeMocks.verificationLogCountDocuments.mockResolvedValue(0);
    routeMocks.webhookEventCountDocuments.mockResolvedValue(0);
    routeMocks.webhookEndpointFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });
    routeMocks.agentFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });
    routeMocks.createPublicId.mockReturnValue("agent_test");
    routeMocks.createApiKey.mockReturnValue("bhf_sk_test_abcdefghijklmnopqrstuvwxyz123456");
    routeMocks.agentCreate.mockImplementation(async (input) => ({
      ...input,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z")
    }));
    routeMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_test" });
    routeMocks.emitWebhookEvent.mockResolvedValue(undefined);
    routeMocks.createSigningSecret.mockReturnValue({
      secret: "whsec_new",
      secretHash: "hash",
      secretPreview: "whsec_..."
    });
    routeMocks.validateWebhookUrl.mockReturnValue({ url: "https://hooks.example.com/behalf" });
    routeMocks.validateWebhookEvents.mockReturnValue({ events: ["verification.allowed"] });
    routeMocks.webhookEndpointCreate.mockImplementation(async (input) => ({
      ...input,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z")
    }));
  });

  it("returns summary usage values without Stripe internals", async () => {
    routeMocks.agentCountDocuments.mockResolvedValue(4);
    routeMocks.permissionCountDocuments.mockResolvedValue(9);
    routeMocks.verificationLogCountDocuments.mockResolvedValue(12);
    routeMocks.webhookEventCountDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const { GET } = await import("@/app/api/dashboard/summary/route");

    const response = await GET(new Request("http://localhost/api/dashboard/summary") as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.usage).toEqual(expect.objectContaining({
      plan: "free",
      agentCount: 4,
      agentLimit: 5,
      verificationCount: 123,
      verificationLimit: 10_000,
      verificationPeriodStart: "2026-05-01T00:00:00.000Z",
      verificationPeriodResetAt: "2026-06-01T00:00:00.000Z",
      webhooksEnabled: false,
      logRetentionDays: 7
    }));
    expect(JSON.stringify(json)).not.toContain("cus_secret");
    expect(JSON.stringify(json)).not.toContain("sub_secret");
  });

  it("returns structured API errors for free and pro agent limits", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/route");

    routeMocks.accountFindOne.mockResolvedValue(accountFixture({ plan: "free" }));
    routeMocks.agentCountDocuments.mockResolvedValue(5);
    const freeResponse = await POST(jsonRequest("/api/dashboard/agents", { name: "Blocked" }));
    await expect(freeResponse.json()).resolves.toEqual(expect.objectContaining({
      error: "Agent limit of 5 reached on the free plan.",
      code: "AGENT_LIMIT_REACHED",
      currentPlan: "free",
      limit: 5,
      upgradeHint: "Upgrade to Pro to add more agents."
    }));

    routeMocks.accountFindOne.mockResolvedValue(accountFixture({ plan: "pro" }));
    routeMocks.agentCountDocuments.mockResolvedValue(50);
    const proResponse = await POST(jsonRequest("/api/dashboard/agents", { name: "Blocked" }));
    await expect(proResponse.json()).resolves.toEqual(expect.objectContaining({
      error: "Agent limit of 50 reached on the pro plan.",
      code: "AGENT_LIMIT_REACHED",
      currentPlan: "pro",
      limit: 50
    }));
  });

  it("blocks webhook creation on Free and allows it on Pro", async () => {
    const { POST } = await import("@/app/api/dashboard/webhooks/route");

    const freeResponse = await POST(jsonRequest("/api/dashboard/webhooks", {
      url: "https://hooks.example.com/behalf",
      events: ["verification.allowed"]
    }));
    await expect(freeResponse.json()).resolves.toEqual({
      error: "Webhooks require Pro or Enterprise.",
      code: "WEBHOOKS_REQUIRE_PRO",
      currentPlan: "free",
      limit: 0,
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    });
    expect(routeMocks.webhookEndpointCreate).not.toHaveBeenCalled();

    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: developerUserFixture({ primaryAccountId: "acct_test" }),
      account: accountFixture({ plan: "pro" }),
      error: null
    });
    const proResponse = await POST(jsonRequest("/api/dashboard/webhooks", {
      url: "https://hooks.example.com/behalf",
      events: ["verification.allowed"]
    }));
    const json = await proResponse.json();

    expect(proResponse.status).toBe(201);
    expect(json.secret).toBe("whsec_new");
    expect(routeMocks.webhookEndpointCreate).toHaveBeenCalled();
  });
});
