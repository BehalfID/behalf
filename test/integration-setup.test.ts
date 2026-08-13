import { describe, expect, it } from "vitest";
import {
  CLI_INSTALL_COMMAND,
  SETUP_PATHS,
  SETUP_TARGETS,
  TARGET_LOCATIONS,
  failBehaviourSummary,
  getSetupPath,
  locationPolicyNote,
  renderSetupCommand,
  renderSetupSteps,
  setupTargetForSurface
} from "@/lib/integrationSetup";

const CONTEXT = { agentId: "agent_abc123", baseUrl: "https://app.example.com" };

describe("setup path inventory", () => {
  it("covers every declared target exactly once", () => {
    expect(SETUP_PATHS.map((path) => path.target).sort()).toEqual([...SETUP_TARGETS].sort());
  });

  it("declares a location each target can honestly be set up in", () => {
    for (const target of SETUP_TARGETS) {
      const locations = TARGET_LOCATIONS[target];
      expect(locations.length).toBeGreaterThan(0);
      expect(locations).toContain(getSetupPath(target).location);
    }
  });

  it("maps agent surfaces onto real setup paths", () => {
    expect(setupTargetForSurface("claude_code")).toBe("claude_code");
    expect(setupTargetForSurface("codex")).toBe("codex");
    expect(setupTargetForSurface("cursor")).toBe("cursor");
    expect(setupTargetForSurface("github_actions")).toBe("ci");
    expect(setupTargetForSurface("internal")).toBe("custom_agent");
    expect(setupTargetForSurface("other")).toBe("custom_agent");
    // Anything unrecognised must land on the path that assumes nothing.
    expect(setupTargetForSurface("something_new")).toBe("custom_agent");
  });

  it("only claims interception where a hook really runs", () => {
    // The CLI hook is the only shipped thing that can stop an action itself.
    // Everything else answers and lets the caller decide, and must say so.
    for (const path of SETUP_PATHS) {
      if (path.enforcement === "intercepting") {
        expect(["claude_code", "codex", "cursor"]).toContain(path.target);
        expect(path.requiresCustomerCode).toBe(false);
      } else {
        expect(path.enforcementPoint.length).toBeGreaterThan(0);
      }
    }
  });

  it("states fail behaviour per path rather than making a blanket claim", () => {
    const hook = getSetupPath("claude_code");
    expect(hook.fail.failsOpen).toBe(true);
    expect(failBehaviourSummary(hook)).toMatch(/goes ahead/i);

    const ci = getSetupPath("ci");
    expect(ci.fail.failsOpen).toBe(false);
    expect(failBehaviourSummary(ci)).not.toMatch(/action goes ahead/i);
  });

  it("flags the paths where the customer still has to write the call", () => {
    expect(getSetupPath("custom_agent").requiresCustomerCode).toBe(true);
    expect(getSetupPath("ci").requiresCustomerCode).toBe(true);
    expect(getSetupPath("claude_code").requiresCustomerCode).toBe(false);
  });

  it("says out loud where BehalfID sees less than a customer might assume", () => {
    expect(getSetupPath("cursor").limits).toMatch(/shell/i);
    expect(getSetupPath("mcp_agent").limits).toMatch(/does not sit in front/i);
    expect(getSetupPath("ci").limits).toMatch(/approval/i);
  });
});

describe("generated commands", () => {
  it("never contains a credential", () => {
    // The old flow printed `behalf config set api-key bhf_sk_live…`, which put a
    // live secret straight into shell history. Nothing generated may do that.
    for (const path of SETUP_PATHS) {
      for (const step of renderSetupSteps(path, CONTEXT)) {
        if (!step.command) continue;
        expect(step.command, `${path.target}/${step.id}`).not.toMatch(/bhf_sk_/);
        expect(step.command, `${path.target}/${step.id}`).not.toMatch(/bhf_dev_/);
        expect(step.command, `${path.target}/${step.id}`).not.toMatch(/config set api-key\s+\S/);
      }
    }
  });

  it("interpolates the real agent and workspace values", () => {
    const steps = renderSetupSteps(getSetupPath("claude_code"), CONTEXT);
    const pointStep = steps.find((step) => step.id === "point_cli_at_agent");
    expect(pointStep?.command).toBe("behalf config set agent-id agent_abc123");
    expect(steps[0]?.command).toBe(CLI_INSTALL_COMMAND);

    const ci = renderSetupSteps(getSetupPath("ci"), CONTEXT);
    expect(ci.find((step) => step.id === "add_ci_step")?.command).toContain(
      "https://app.example.com/api/verify"
    );
    expect(ci.find((step) => step.id === "add_ci_step")?.command).toContain('"agentId":"agent_abc123"');
  });

  it("refuses to interpolate a value that could break out of the command", () => {
    // A malformed agent id or base URL must never be pasted into a snippet we
    // told the customer to run.
    expect(
      renderSetupCommand("behalf config set agent-id {{agentId}}", {
        agentId: "agent_x; rm -rf /",
        baseUrl: null
      })
    ).toBe("behalf config set agent-id <your agent id>");

    expect(
      renderSetupCommand("curl {{baseUrl}}/api/verify", {
        agentId: null,
        baseUrl: "javascript:alert(1)"
      })
    ).toBe("curl https://behalfid.com/api/verify");

    expect(
      renderSetupCommand("curl {{baseUrl}}/api/verify", { agentId: null, baseUrl: "not a url" })
    ).toBe("curl https://behalfid.com/api/verify");
  });

  it("keeps only the origin of a supplied base URL", () => {
    expect(
      renderSetupCommand("{{baseUrl}}", { agentId: null, baseUrl: "https://app.example.com/dashboard?x=1" })
    ).toBe("https://app.example.com");
  });
});

describe("unattended locations", () => {
  it("warns that approvals stall a pipeline, and only in CI", () => {
    expect(locationPolicyNote("ci", 4)).toMatch(/nobody is watching/i);
    expect(locationPolicyNote("ci", 0)).toBeNull();
    expect(locationPolicyNote("workstation", 4)).toBeNull();
    expect(locationPolicyNote("server", 4)).toBeNull();
  });
});

describe("the setup test exercises the policy the customer just configured", () => {
  it("picks a demonstration action the compiled permissions really cover", async () => {
    const { buildTestDecision, buildPermissionsFromSetup } = await import("@/lib/firstAgentSetup");
    const { presetPolicy } = await import("@/lib/protectionPolicy");

    for (const preset of ["recommended", "strict", "minimal"] as const) {
      const policy = presetPolicy(preset);
      const decision = buildTestDecision({ protectionPolicy: policy, agentName: "Test agent" });
      const permissions = buildPermissionsFromSetup({
        surface: "claude_code",
        name: "Test agent",
        protectionPolicy: policy
      });

      // The action the flow is about to send must be one the policy compiled a
      // permission for — otherwise the "test" would prove nothing about setup.
      const matching = permissions.filter(
        (permission) =>
          permission.action === decision.action ||
          (permission.blockedActions ?? []).includes(decision.action)
      );
      expect(matching.length, `${preset}/${decision.action}`).toBeGreaterThan(0);

      // And the stated expectation must match the state the customer chose.
      const state = policy.controls[decision.controlId];
      expect(decision.expectsApproval).toBe(state === "approve");
      expect(decision.expectsDenied).toBe(state === "block");
      expect(decision.expectsAllowed).toBe(state === "allow");
    }
  });
});

describe("setup surfaces are reusable outside first-run", () => {
  it("renders the same instructions for an agent created long ago", () => {
    // The agent-detail panel calls the same helpers with the same shape, so a
    // returning user gets identical commands without re-entering a wizard.
    const first = renderSetupSteps(getSetupPath("claude_code"), CONTEXT);
    const later = renderSetupSteps(getSetupPath("claude_code"), CONTEXT);
    expect(later).toEqual(first);
  });

  it("falls back to a safe placeholder when the agent id is not available yet", () => {
    const steps = renderSetupSteps(getSetupPath("claude_code"), { agentId: null, baseUrl: null });
    expect(steps.find((step) => step.id === "point_cli_at_agent")?.command).toContain(
      "<your agent id>"
    );
  });
});
