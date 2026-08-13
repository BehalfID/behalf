import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  READINESS_STATES,
  resolveReadinessState,
  surfaceForAction
} from "@/lib/setupReadiness";

const repoMocks = vi.hoisted(() => ({
  findOneAgent: vi.fn(),
  countPermissions: vi.fn(),
  countLogs: vi.fn(),
  findLogs: vi.fn(),
  countApprovals: vi.fn(),
  findApprovals: vi.fn()
}));

vi.mock("@/lib/repositories/agents", () => ({ findOneAgent: repoMocks.findOneAgent }));
vi.mock("@/lib/repositories/permissions", () => ({ countPermissions: repoMocks.countPermissions }));
vi.mock("@/lib/repositories/verificationLogs", () => ({
  countLogs: repoMocks.countLogs,
  findLogs: repoMocks.findLogs
}));
vi.mock("@/lib/repositories/approvals", () => ({
  countApprovals: repoMocks.countApprovals,
  findApprovals: repoMocks.findApprovals
}));

function agentRow(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent_test",
    name: "Laptop agent",
    accountId: "acct_test",
    status: "active",
    lastUsedAt: null,
    ...overrides
  };
}

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req_1",
    agentId: "agent_test",
    action: "execute_command",
    allowed: true,
    approvalRequired: false,
    reason: "Action allowed by active permission.",
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoMocks.findOneAgent.mockResolvedValue(agentRow());
  repoMocks.countPermissions.mockResolvedValue(0);
  repoMocks.countLogs.mockResolvedValue(0);
  repoMocks.findLogs.mockResolvedValue([]);
  repoMocks.countApprovals.mockResolvedValue(0);
  repoMocks.findApprovals.mockResolvedValue([]);
});

describe("readiness state machine", () => {
  it("distinguishes configured, connected, and protecting", () => {
    const base = {
      agentReady: true,
      credentialUsed: false,
      policyConfigured: true,
      verificationObserved: false
    };
    expect(resolveReadinessState(base)).toBe("configured");
    expect(resolveReadinessState({ ...base, credentialUsed: true })).toBe("connected");
    expect(
      resolveReadinessState({ ...base, credentialUsed: true, verificationObserved: true })
    ).toBe("verified");
  });

  it("never reports protection for a disabled agent", () => {
    expect(
      resolveReadinessState({
        agentReady: false,
        credentialUsed: true,
        policyConfigured: true,
        verificationObserved: true
      })
    ).toBe("not_started");
  });

  it("does not call traffic without a policy protection", () => {
    // Verifications against an agent with no active permission are all denials.
    // That is not protection working, it is protection missing.
    expect(
      resolveReadinessState({
        agentReady: true,
        credentialUsed: true,
        policyConfigured: false,
        verificationObserved: true
      })
    ).toBe("connected");
  });

  it("exposes exactly the four states the UI renders", () => {
    expect([...READINESS_STATES]).toEqual(["not_started", "configured", "connected", "verified"]);
  });
});

describe("agent readiness detection", () => {
  it("reports configured-but-not-connected before anything uses the key", async () => {
    repoMocks.countPermissions.mockResolvedValue(13);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.state).toBe("configured");
    expect(readiness?.credential.ok).toBe(false);
    expect(readiness?.credential.evidence).toBe("unknown");
    expect(readiness?.policy.ok).toBe(true);
    expect(readiness?.policy.evidence).toBe("detected");
    expect(readiness?.enforcement.ok).toBe(false);
  });

  it("detects the connection from the credential being used, not from a checkbox", async () => {
    repoMocks.findOneAgent.mockResolvedValue(agentRow({ lastUsedAt: new Date() }));
    repoMocks.countPermissions.mockResolvedValue(13);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.state).toBe("connected");
    expect(readiness?.credential.evidence).toBe("detected");
    expect(readiness?.credential.detail).toMatch(/last used/i);
  });

  it("reports protection once a real decision has been observed", async () => {
    repoMocks.findOneAgent.mockResolvedValue(agentRow({ lastUsedAt: new Date() }));
    repoMocks.countPermissions.mockResolvedValue(13);
    repoMocks.countLogs.mockResolvedValue(3);
    repoMocks.findLogs.mockResolvedValue([
      logRow(),
      logRow({ requestId: "req_0", action: "write_file" })
    ]);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.state).toBe("verified");
    expect(readiness?.enforcement.evidence).toBe("detected");
    expect(readiness?.observedActions).toEqual(["execute_command", "write_file"]);
    expect(readiness?.lastDecision?.requestId).toBe("req_1");
    expect(readiness?.counts.verifications).toBe(3);
  });

  it("reports a disabled agent honestly rather than as protected", async () => {
    repoMocks.findOneAgent.mockResolvedValue(
      agentRow({ status: "disabled", lastUsedAt: new Date() })
    );
    repoMocks.countPermissions.mockResolvedValue(13);
    repoMocks.countLogs.mockResolvedValue(9);
    repoMocks.findLogs.mockResolvedValue([logRow()]);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.state).toBe("not_started");
    expect(readiness?.agentReady.ok).toBe(false);
    expect(readiness?.agentReady.detail).toMatch(/disabled/i);
  });

  it("reports a policy-less agent as unprotected even with traffic", async () => {
    repoMocks.findOneAgent.mockResolvedValue(agentRow({ lastUsedAt: new Date() }));
    repoMocks.countPermissions.mockResolvedValue(0);
    repoMocks.countLogs.mockResolvedValue(4);
    repoMocks.findLogs.mockResolvedValue([logRow({ allowed: false })]);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.state).toBe("connected");
    expect(readiness?.policy.ok).toBe(false);
    expect(readiness?.policy.detail).toMatch(/every action is refused/i);
  });

  it("returns null for a deleted agent instead of stale readiness", async () => {
    repoMocks.findOneAgent.mockResolvedValue(null);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");
    expect(await getAgentSetupReadiness("acct_test", "agent_gone")).toBeNull();
  });

  it("scopes every read to the caller's account", async () => {
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");
    await getAgentSetupReadiness("acct_test", "agent_test");

    for (const mock of [
      repoMocks.findOneAgent,
      repoMocks.countPermissions,
      repoMocks.countLogs,
      repoMocks.findLogs,
      repoMocks.countApprovals,
      repoMocks.findApprovals
    ]) {
      expect(mock).toHaveBeenCalled();
      const filter = mock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(JSON.stringify(filter)).toContain("acct_test");
    }
  });

  it("records the approval flow only when an approval really existed", async () => {
    repoMocks.countApprovals.mockResolvedValue(2);
    repoMocks.findApprovals.mockResolvedValue([{ createdAt: new Date() }]);
    const { getAgentSetupReadiness } = await import("@/lib/setupReadiness");

    const readiness = await getAgentSetupReadiness("acct_test", "agent_test");
    expect(readiness?.approvalFlow.ok).toBe(true);
    expect(readiness?.approvalFlow.evidence).toBe("detected");
  });
});

describe("workspace protection surfaces", () => {
  it("attributes actions to the surface that produces them", () => {
    // CLI-hook actions
    expect(surfaceForAction("execute_command")).toBe("coding_agent");
    expect(surfaceForAction("write_file")).toBe("coding_agent");
    expect(surfaceForAction("mcp_tool")).toBe("coding_agent");
    // Pipeline-shaped actions
    expect(surfaceForAction("deploy_production")).toBe("ci");
    expect(surfaceForAction("secrets_write")).toBe("ci");
    // Everything else is somebody's own service
    expect(surfaceForAction("purchase")).toBe("service");
  });

  it("does not mark a surface protected just because an agent exists", async () => {
    repoMocks.findLogs.mockResolvedValue([]);
    const { getWorkspaceProtectionStatus } = await import("@/lib/setupReadiness");

    const surfaces = await getWorkspaceProtectionStatus("acct_test");
    expect(surfaces).toHaveLength(3);
    expect(surfaces.every((surface) => !surface.active)).toBe(true);
    expect(surfaces[0]?.detail).toMatch(/nothing connected/i);
  });

  it("marks only the surface that actually produced decisions", async () => {
    // A local Claude Code setup must never imply CI is covered.
    repoMocks.findLogs.mockResolvedValue([
      logRow({ action: "execute_command", agentId: "agent_laptop" })
    ]);
    repoMocks.findOneAgent.mockResolvedValue(agentRow({ agentId: "agent_laptop", name: "Laptop" }));
    const { getWorkspaceProtectionStatus } = await import("@/lib/setupReadiness");

    const surfaces = await getWorkspaceProtectionStatus("acct_test");
    const byId = Object.fromEntries(surfaces.map((surface) => [surface.surface, surface]));
    expect(byId.coding_agent?.active).toBe(true);
    expect(byId.coding_agent?.agents).toEqual([{ agentId: "agent_laptop", agentName: "Laptop" }]);
    expect(byId.ci?.active).toBe(false);
    expect(byId.service?.active).toBe(false);
  });
});
