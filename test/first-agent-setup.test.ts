import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPermissionsFromSetup,
  buildTestDecision,
  recommendPresetForSurface,
  sanitizeVerifyMetadata,
  validateFirstAgentSetupBody
} from "@/lib/firstAgentSetup";
import { getNextRouteForFirstSetupGoal } from "@/lib/onboarding";
import { PROTECTION_CONTROLS, presetPolicy } from "@/lib/protectionPolicy";

describe("first agent setup helpers", () => {
  it("suggests a stricter starting policy for unattended surfaces", () => {
    expect(recommendPresetForSurface("cursor")).toBe("recommended");
    expect(recommendPresetForSurface("claude_code")).toBe("recommended");
    expect(recommendPresetForSurface("github_actions")).toBe("strict");
    expect(recommendPresetForSurface("internal")).toBe("strict");
  });

  it("compiles the chosen policy into permissions with canonical actions only", () => {
    const permissions = buildPermissionsFromSetup({
      surface: "cursor",
      name: "Cursor agent",
      environment: "production",
      protectionPolicy: presetPolicy("recommended")
    });

    expect(permissions.length).toBeGreaterThanOrEqual(PROTECTION_CONTROLS.length);
    expect(permissions.find((p) => p.action === "deploy_production")?.requiresApproval).toBe(true);
    expect(permissions.find((p) => p.action === "secrets_write")?.requiresApproval).toBe(true);
    expect(permissions.find((p) => p.action === "write_file")?.requiresApproval).toBe(false);

    for (const permission of permissions) {
      // Prose here would be read as an exact-match action allowlist by verify.
      expect(permission).not.toHaveProperty("allowedActions");
      for (const blocked of permission.blockedActions ?? []) {
        expect(blocked).not.toMatch(/\s/);
      }
    }
  });

  it("blocks rather than gates when the customer chose block", () => {
    const policy = presetPolicy("strict");
    const permissions = buildPermissionsFromSetup({
      surface: "github_actions",
      name: "CI agent",
      environment: "production",
      protectionPolicy: policy
    });
    const secrets = permissions.find((p) => p.action === "secrets_write");
    expect(secrets?.blockedActions).toEqual(["secrets_write"]);
    expect(secrets?.requiresApproval).toBe(false);
  });

  it("builds a test decision that states the outcome the policy will produce", () => {
    const gated = buildTestDecision({
      protectionPolicy: presetPolicy("recommended"),
      defaultEnvironment: "staging",
      agentName: "Deploy agent"
    });
    expect(gated.action).toBe("deploy_production");
    expect(gated.expectsApproval).toBe(true);
    expect(gated.expectsDenied).toBe(false);
    expect(gated.metadata?.defaultEnvironment).toBe("staging");

    const strict = buildTestDecision({
      protectionPolicy: presetPolicy("strict"),
      agentName: "CI agent"
    });
    expect(strict.expectsApproval).toBe(true);

    const openPolicy = presetPolicy("minimal");
    const open = buildTestDecision({ protectionPolicy: openPolicy, agentName: "Local agent" });
    expect(open.expectsAllowed).toBe(true);
    expect(open.expectsApproval).toBe(false);
  });

  it("sends an amount that lands in the band the test decision claims", () => {
    const policy = presetPolicy("minimal");
    policy.controls = { ...policy.controls, spend_money: "approve" };
    policy.spending = { enabled: true, approveOver: 25, blockOver: 100 };
    const decision = buildTestDecision({ protectionPolicy: policy, agentName: "Buyer" });
    expect(decision.action).toBe("purchase");
    expect(decision.expectsApproval).toBe(true);
    expect(decision.amount).toBeGreaterThan(25);
    expect(decision.amount!).toBeLessThanOrEqual(100);
  });

  it("rejects a malformed protection policy server-side", () => {
    const badState = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      protectionPolicy: { controls: { read_files: "sometimes" } }
    });
    expect(badState.error).toMatch(/allow, approve, or block/);

    const badControl = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      protectionPolicy: { controls: { teleport: "allow" } }
    });
    expect(badControl.error).toMatch(/unknown control/);
  });

  it("defaults to the recommended policy when the client sends none", () => {
    const result = validateFirstAgentSetupBody({ surface: "cursor", name: "Agent" });
    expect(result.error).toBeNull();
    expect(result.input?.protectionPolicy.preset).toBe("recommended");
  });

  it("translates a pre-upgrade browser payload instead of failing it", () => {
    const legacy = validateFirstAgentSetupBody({
      surface: "cursor",
      name: "Agent",
      controlProfile: "balanced",
      approvalGates: ["production_deploys"]
    });
    expect(legacy.error).toBeNull();
    expect(legacy.input?.protectionPolicy.controls.deploy_production).toBe("approve");
  });

  it("requires a valid surface", () => {
    const invalidSurface = validateFirstAgentSetupBody({
      surface: "vscode",
      name: "Agent"
    });
    expect(invalidSurface.error).toMatch(/surface/i);
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
      protectionPolicy: presetPolicy("recommended"),
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
        protectionPolicy: presetPolicy("recommended")
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
        protectionPolicy: presetPolicy("recommended")
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
        protectionPolicy: presetPolicy("recommended")
      })
    );
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.apiKey).toBe("bhf_sk_test_key_once");
    expect(json.agent.agentId).toBe("agent_test");
    expect(json.testDecision.action).toBe("deploy_production");
    expect(json.testDecision.expectsApproval).toBe(true);
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
        protectionPolicy: presetPolicy("recommended")
      })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.code).toBe("SETUP_FAILED");
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
        protectionPolicy: presetPolicy("recommended")
      })
    );
    expect(mocks.emitWebhookEvent).toHaveBeenCalled();
    const payload = JSON.stringify(mocks.emitWebhookEvent.mock.calls);
    expect(payload).not.toMatch(/bhf_sk_/);
  });

  it("rejects a malformed protection policy", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    const response = await POST(
      postRequest({
        surface: "cursor",
        name: "Cursor agent",
        protectionPolicy: { controls: { read_files: "sometimes" } }
      })
    );
    expect(response.status).toBe(400);
  });

  it("creates one permission per compiled rule", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/first-setup/route");
    await POST(
      postRequest({
        surface: "cursor",
        name: "Cursor agent",
        protectionPolicy: presetPolicy("recommended")
      })
    );
    const expected = buildPermissionsFromSetup({
      surface: "cursor",
      name: "Cursor agent",
      protectionPolicy: presetPolicy("recommended")
    }).length;
    expect(mocks.createPermissionForAgent.mock.calls.length).toBe(expected);
  });
});

describe("first agent setup route registration", () => {
  it("registers the guided setup page", async () => {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const page = await readFile(join(process.cwd(), "app/dashboard/agents/new/page.tsx"), "utf8");
    expect(page).toContain('view="first-agent"');
  });
});
