import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVAL_GATES,
  buildPermissionsFromSetup,
  buildTestDecision,
  recommendControlProfile,
  sanitizeVerifyMetadata,
  validateFirstAgentSetupBody
} from "@/lib/firstAgentSetup";
import { getNextRouteForFirstSetupGoal } from "@/lib/onboarding";

describe("first agent setup helpers", () => {
  it("recommends control profiles by agent surface", () => {
    expect(recommendControlProfile("cursor")).toBe("balanced");
    expect(recommendControlProfile("github_actions")).toBe("production_strict");
    expect(recommendControlProfile("internal")).toBe("production_strict");
    expect(recommendControlProfile("other")).toBe("conservative");
  });

  it("maps approval gates to permissions with profile behavior", () => {
    const balanced = buildPermissionsFromSetup({
      surface: "cursor",
      name: "Cursor agent",
      environment: "production",
      controlProfile: "balanced",
      approvalGates: ["production_deploys", "secret_env_changes"]
    });
    expect(balanced.some((permission) => permission.action === "deploy")).toBe(true);
    expect(balanced.find((permission) => permission.action === "deploy_production")?.requiresApproval).toBe(true);
    expect(balanced.find((permission) => permission.action === "secrets_write")?.requiresApproval).toBe(true);

    const custom = buildPermissionsFromSetup({
      surface: "internal",
      name: "Internal agent",
      environment: "production",
      controlProfile: "custom",
      approvalGates: ["billing_payment_actions"]
    });
    expect(custom).toHaveLength(1);
    expect(custom[0]?.action).toBe("billing_vendor_api");
    expect(custom[0]?.requiresApproval).toBe(true);
  });

  it("requires approval for every selected gate regardless of profile", () => {
    const gates = [
      "production_deploys",
      "secret_env_changes",
      "infrastructure_mutations",
      "database_schema_changes",
      "billing_payment_actions",
      "external_network_actions"
    ] as const;

    for (const profile of ["conservative", "balanced", "production_strict", "custom"] as const) {
      const permissions = buildPermissionsFromSetup({
        surface: "cursor",
        name: "Cursor agent",
        environment: "production",
        controlProfile: profile,
        approvalGates: [...gates]
      });

      for (const gate of gates) {
        const gatePermission = permissions.find((permission) => permission.gate === gate);
        expect(gatePermission?.requiresApproval, `${gate} under ${profile}`).toBe(true);
      }
    }
  });

  it("builds production-focused test decisions regardless of default environment", () => {
    const withGate = buildTestDecision({
      approvalGates: ["production_deploys"],
      defaultEnvironment: "staging",
      agentName: "Deploy agent"
    });
    expect(withGate.action).toBe("deploy_production");
    expect(withGate.resource).toBe("production");
    expect(withGate.vendor).toBe("production");
    expect(withGate.environment).toBe("production");
    expect(withGate.metadata?.defaultEnvironment).toBe("staging");
    expect(withGate.expectsApproval).toBe(true);
    expect(withGate.expectsDenied).toBe(false);

    const withoutGate = buildTestDecision({
      approvalGates: ["secret_env_changes"],
      defaultEnvironment: "development",
      agentName: "Deploy agent"
    });
    expect(withoutGate.resource).toBe("production");
    expect(withoutGate.vendor).toBe("production");
    expect(withoutGate.environment).toBe("production");
    expect(withoutGate.metadata?.defaultEnvironment).toBe("development");
    expect(withoutGate.expectsApproval).toBe(false);
    expect(withoutGate.expectsDenied).toBe(true);
  });

  it("rejects invalid custom gate selections server-side", () => {
    const missingGates = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      controlProfile: "custom",
      approvalGates: []
    });
    expect(missingGates.error).toMatch(/at least one approval gate/i);

    const invalidGate = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      controlProfile: "balanced",
      approvalGates: ["not_a_gate"]
    });
    expect(invalidGate.error).toMatch(/invalid gate/i);
  });

  it("requires a valid surface and profile", () => {
    const invalidSurface = validateFirstAgentSetupBody({
      surface: "vscode",
      name: "Agent",
      controlProfile: "balanced",
      approvalGates: APPROVAL_GATES.slice(0, 1)
    });
    expect(invalidSurface.error).toMatch(/surface/i);

    const invalidProfile = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      controlProfile: "wide_open",
      approvalGates: APPROVAL_GATES.slice(0, 1)
    });
    expect(invalidProfile.error).toMatch(/controlProfile/i);
  });

  it("strips token-like keys from first-agent verify metadata", () => {
    expect(
      sanitizeVerifyMetadata({
        source: "first_agent_setup",
        apiKey: "bhf_sk_secret",
        BEHALF_API_KEY: "bhf_sk_secret"
      })
    ).toEqual({ source: "first_agent_setup" });

    const decision = buildTestDecision({
      approvalGates: ["production_deploys"],
      agentName: "Deploy agent"
    });
    expect(decision.metadata).not.toHaveProperty("apiKey");
    expect(decision.metadata).not.toHaveProperty("BEHALF_API_KEY");
  });

  it("routes create_agent onboarding goal to first-agent setup", () => {
    expect(getNextRouteForFirstSetupGoal("create_agent")).toBe("/dashboard/agents/new");
  });
});

const mocks = vi.hoisted(() => ({
  requireVerifiedDeveloperApi: vi.fn(),
  requireWorkspaceMutationActor: vi.fn(),
  checkAgentLimit: vi.fn(),
  createDeveloperAgent: vi.fn(),
  createPermissionForAgent: vi.fn(),
  emitWebhookEvent: vi.fn(),
  permissionDeleteMany: vi.fn(),
  agentDeleteOne: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireVerifiedDeveloperApi: mocks.requireVerifiedDeveloperApi
}));
vi.mock("@/lib/workspaceActor", () => ({
  requireWorkspaceMutationActor: mocks.requireWorkspaceMutationActor
}));
vi.mock("@/lib/quota", () => ({
  checkAgentLimit: mocks.checkAgentLimit,
  quotaErrorDetails: () => ({})
}));
vi.mock("@/lib/dashboardData", () => ({
  createDeveloperAgent: mocks.createDeveloperAgent,
  serializeAgent: (agent: { agentId: string; name: string }) => agent
}));
vi.mock("@/lib/permissionMutations", () => ({
  createPermissionForAgent: mocks.createPermissionForAgent
}));
vi.mock("@/lib/webhooks", () => ({
  createWebhookEvent: vi.fn(() => ({})),
  emitWebhookEvent: mocks.emitWebhookEvent
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/models/Permission", () => ({
  default: { deleteMany: mocks.permissionDeleteMany }
}));
vi.mock("@/models/Agent", () => ({
  default: { deleteOne: mocks.agentDeleteOne }
}));

function postRequest(body: unknown) {
  return new Request("http://example.test/api/dashboard/agents/first-setup", {
    method: "POST",
    headers: {
      Origin: "http://example.test",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }) as never;
}

describe("POST /api/dashboard/agents/first-setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireVerifiedDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test", emailVerified: true },
      activeAccountId: "acct_test",
      error: null
    });
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: { userId: "dev_test", accountId: "acct_test", role: "OWNER", authorityLevel: 100 },
      error: null
    });
    mocks.checkAgentLimit.mockResolvedValue({ allowed: true });
    mocks.createDeveloperAgent.mockResolvedValue({
      agent: { agentId: "agent_test", name: "Deploy agent" },
      apiKey: "bhf_sk_test_key_once"
    });
    mocks.createPermissionForAgent.mockResolvedValue({ permissionId: "perm_test" });
    mocks.permissionDeleteMany.mockResolvedValue({});
    mocks.agentDeleteOne.mockResolvedValue({});
  });

  it("blocks unverified users from creating agents", async () => {
    mocks.requireVerifiedDeveloperApi.mockResolvedValue({
      user: null,
      error: Response.json({ error: "Email verification required." }, { status: 403 })
    });
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "cursor",
        name: "Deploy agent",
        controlProfile: "balanced",
        approvalGates: ["production_deploys"]
      })
    );
    expect(response.status).toBe(403);
  });

  it("blocks unauthorized workspace actors", async () => {
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: null,
      error: Response.json({ error: "Forbidden" }, { status: 403 })
    });
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "cursor",
        name: "Deploy agent",
        controlProfile: "balanced",
        approvalGates: ["production_deploys"]
      })
    );
    expect(response.status).toBe(403);
  });

  it("creates agent, permissions, and returns one-time api key", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "github_actions",
        name: "CI deploy agent",
        description: "Production deploy gate",
        environment: "production",
        controlProfile: "production_strict",
        approvalGates: ["production_deploys", "secret_env_changes"]
      })
    );
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.apiKey).toBe("bhf_sk_test_key_once");
    expect(json.agent.agentId).toBe("agent_test");
    expect(json.testDecision.action).toBe("deploy_production");
    expect(json.testDecision.resource).toBe("production");
    expect(json.testDecision.environment).toBe("production");
    expect(json.testDecision.metadata).not.toHaveProperty("apiKey");
    expect(mocks.createDeveloperAgent).toHaveBeenCalledOnce();
    expect(mocks.createPermissionForAgent.mock.calls.length).toBeGreaterThan(0);
  });

  it("rolls back agent creation when permission setup fails", async () => {
    mocks.createPermissionForAgent
      .mockResolvedValueOnce({ permissionId: "perm_one" })
      .mockResolvedValueOnce({ error: Response.json({ error: "Permission grant forbidden." }, { status: 403 }) });

    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "cursor",
        name: "Cursor agent",
        controlProfile: "balanced",
        approvalGates: ["production_deploys", "secret_env_changes"]
      })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.code).toBe("setup_failed");
    expect(json).not.toHaveProperty("apiKey");
    expect(json).not.toHaveProperty("agent");
    expect(mocks.permissionDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_test",
        permissionId: { $in: ["perm_one"] }
      })
    );
    expect(mocks.agentDeleteOne).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent_test" }));
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not echo api key into webhook metadata", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    await POST(
      postRequest({
        surface: "cursor",
        name: "Cursor agent",
        controlProfile: "balanced",
        approvalGates: ["production_deploys"]
      })
    );
    expect(mocks.emitWebhookEvent).toHaveBeenCalled();
    const payload = JSON.stringify(mocks.emitWebhookEvent.mock.calls);
    expect(payload).not.toMatch(/bhf_sk_/);
  });

  it("rejects invalid gate combinations", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "cursor",
        name: "Cursor agent",
        controlProfile: "custom",
        approvalGates: []
      })
    );
    expect(response.status).toBe(400);
  });
});

describe("first agent setup route registration", () => {
  it("registers the guided setup page", async () => {
    const page = await import("fs/promises").then((fs) =>
      fs.readFile("/workspace/app/dashboard/agents/new/page.tsx", "utf8")
    );
    expect(page).toContain('view="first-agent"');
  });
});
