/**
 * Authoritative inventory of how a customer connects BehalfID to a real agent.
 *
 * One entry per *setup path*, not per marketing integration. Each entry states
 * where enforcement actually happens, which credential is used, what BehalfID
 * does when it cannot be reached, and which of those facts BehalfID can detect
 * on its own versus which the customer has to assert.
 *
 * Rules this file exists to keep:
 *
 * 1. No path claims interception it does not perform. The CLI hook intercepts;
 *    the SDK and direct API do not — the customer's own code calls verify and
 *    obeys the answer.
 * 2. Fail behaviour is copied from the shipped code, per path, never
 *    generalised. `packages/cli/src/commands/hook.ts` fails *open* on a missing
 *    config or an unreachable API and *closed* on a deny, an approval, or an
 *    oversized policy context. An SDK caller fails whichever way they wrote it.
 * 3. Generated commands never contain a secret. Credentials go through an
 *    interactive prompt or an environment variable the customer sets, so they
 *    do not land in shell history.
 */

import type { ProtectionState } from "@/lib/protectionPolicy";

// ────────────────────────────────────────────────────────────────────────────
// What is being protected
// ────────────────────────────────────────────────────────────────────────────

export const SETUP_TARGETS = [
  "claude_code",
  "codex",
  "cursor",
  "mcp_agent",
  "ci",
  "custom_agent"
] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];

/** Where the protected thing runs. Narrows the instructions, never the policy. */
export const SETUP_LOCATIONS = ["workstation", "ci", "server"] as const;
export type SetupLocation = (typeof SETUP_LOCATIONS)[number];

export const SETUP_LOCATION_LABELS: Record<SetupLocation, string> = {
  workstation: "A developer machine",
  ci: "CI — GitHub Actions or similar",
  server: "A server or container you run"
};

export const SETUP_LOCATION_DESCRIPTIONS: Record<SetupLocation, string> = {
  workstation: "Your laptop, or the laptops of everyone on the team.",
  ci: "An unattended pipeline. Nobody is at a keyboard when it runs.",
  server: "A long-running process you deploy and operate."
};

// ────────────────────────────────────────────────────────────────────────────
// How enforcement happens
// ────────────────────────────────────────────────────────────────────────────

/**
 * `intercepting` — BehalfID sits in front of the action and can stop it.
 * `advisory`    — BehalfID answers, and the caller's own code decides. Honest
 *                 word for the SDK, direct API, and the MCP advisory server.
 */
export type EnforcementKind = "intercepting" | "advisory";

export const ENFORCEMENT_KIND_LABELS: Record<EnforcementKind, string> = {
  intercepting: "BehalfID stops the action itself",
  advisory: "BehalfID answers; your code stops the action"
};

/** Fail behaviour, copied from the shipped implementation of each path. */
export type FailBehaviour = {
  /** What happens when BehalfID says no. */
  onDeny: string;
  /** What happens when BehalfID cannot be reached at all. */
  onUnreachable: string;
  /** True when an unreachable BehalfID lets the action proceed. */
  failsOpen: boolean;
};

const CLI_HOOK_FAIL: FailBehaviour = {
  onDeny: "The tool call is blocked before it runs, and the agent is told why.",
  onUnreachable:
    "The action is allowed through. The hook fails open when BehalfID is unreachable or the CLI is not configured, so a network problem never bricks your editor.",
  failsOpen: true
};

const CALLER_FAIL: FailBehaviour = {
  onDeny: "Your code receives allowed: false and is responsible for not proceeding.",
  onUnreachable:
    "Whatever your code does with a failed request. Treat a failed verify as a denial if you want this to fail closed.",
  failsOpen: false
};

// ────────────────────────────────────────────────────────────────────────────
// Detectable signals
// ────────────────────────────────────────────────────────────────────────────

/**
 * Signals BehalfID can confirm server-side. Anything not listed here is
 * user-asserted and must be presented that way.
 */
export const DETECTABLE_SIGNALS = [
  "agent_created",
  "credential_issued",
  "credential_used",
  "policy_configured",
  "verification_observed",
  "approval_observed"
] as const;
export type DetectableSignal = (typeof DETECTABLE_SIGNALS)[number];

export type SetupStepId =
  | "install_cli"
  | "authenticate_cli"
  | "point_cli_at_agent"
  | "install_hook"
  | "launch_through_behalf"
  | "install_sdk"
  | "set_credential_env"
  | "add_verify_call"
  | "add_ci_step"
  | "configure_mcp";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  /** What this step actually does. One or two sentences, no internal jargon. */
  body: string;
  /**
   * Shell/code the customer runs. `{{agentId}}` and `{{baseUrl}}` are replaced
   * with real values. Never contains a credential.
   */
  command?: string;
  language?: "bash" | "ts" | "yaml" | "json";
  /** Optional expandable detail: exactly what changes on their machine. */
  detail?: string;
};

export type SetupPath = {
  target: SetupTarget;
  location: SetupLocation;
  label: string;
  /** One line describing the finished state. */
  outcome: string;
  enforcement: EnforcementKind;
  /** Where the decision is made, in the customer's words. */
  enforcementPoint: string;
  credential: string;
  fail: FailBehaviour;
  /** Signals this path can produce. Used to decide what to poll for. */
  detectable: DetectableSignal[];
  steps: SetupStep[];
  /** True when the path is documentation plus adapters, not automatic wiring. */
  requiresCustomerCode: boolean;
  /** Honest note about what BehalfID does *not* see on this path. */
  limits?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Shared steps — defined once, reused by every path that needs them
// ────────────────────────────────────────────────────────────────────────────

export const CLI_INSTALL_COMMAND = "npm install -g @behalfid/cli";

const installCli: SetupStep = {
  id: "install_cli",
  title: "Install the BehalfID CLI",
  body: "The CLI is what actually sits between your coding agent and the things it wants to do.",
  command: CLI_INSTALL_COMMAND,
  language: "bash",
  detail:
    "Installs the `behalf` command globally. Nothing is written to your projects, and no credentials are stored yet."
};

const authenticateCli: SetupStep = {
  id: "authenticate_cli",
  title: "Sign in from the terminal",
  body: "Opens your browser, you approve the device, and the CLI stores a session for this machine.",
  command: "behalf login",
  language: "bash",
  detail:
    "Writes a session file to ~/.behalf/. No password and no long-lived API key is typed into your shell, so nothing sensitive lands in your shell history."
};

const pointCliAtAgent: SetupStep = {
  id: "point_cli_at_agent",
  title: "Point the CLI at this agent",
  body: "Tells the CLI which identity to use when it asks BehalfID for a decision.",
  command: "behalf config set agent-id {{agentId}}",
  language: "bash",
  detail:
    "Writes the agent id — not a secret — to ~/.behalf/config.json. The API key is read from the BEHALFID_API_KEY environment variable or fetched with your signed-in session, so it never appears in a command."
};

function launchStep(tool: "claude" | "codex" | "cursor", toolLabel: string): SetupStep {
  return {
    id: "install_hook",
    title: `Connect ${toolLabel}`,
    body: `Installs a hook that runs before ${toolLabel} touches a file, runs a command, or reaches the network, and asks BehalfID whether it may proceed.`,
    command: `behalf ${tool}`,
    language: "bash",
    detail:
      tool === "claude"
        ? "Adds a PreToolUse hook entry to ~/.claude/settings.json, then launches Claude Code. Existing settings are preserved. Run `behalf doctor` at any time to check it is still there."
        : tool === "codex"
          ? "Adds a hook entry to ~/.codex/hooks.json, then launches Codex. Existing entries are preserved."
          : "Adds a beforeShellExecution hook to ~/.cursor/hooks.json, then launches Cursor. Cursor gates shell commands only — file edits are not intercepted on this path."
  };
}

const installSdk: SetupStep = {
  id: "install_sdk",
  title: "Install the SDK",
  body: "A small client for the decision API, so you do not have to hand-roll HTTP calls.",
  command: "npm install @behalfid/sdk",
  language: "bash"
};

const setCredentialEnv: SetupStep = {
  id: "set_credential_env",
  title: "Store the agent key",
  body:
    "Your agent presents this key when it asks BehalfID for a decision. Put it in your secret manager or your process environment — not in source control, and not typed into a terminal.",
  command: "BEHALFID_API_KEY=<the key shown once above>",
  language: "bash",
  detail:
    "The key is shown exactly once, when the agent is created. If you lose it, rotate the key from the agent page rather than creating a second agent. Anyone holding it can ask BehalfID for decisions as this agent, but cannot change your policy — granting permissions requires a signed-in human."
};

const addVerifyCall: SetupStep = {
  id: "add_verify_call",
  title: "Ask before you act",
  body:
    "Call verify at the point where your agent is about to do the thing, and honour the answer. BehalfID cannot stop the action for you here — your code does that.",
  language: "ts",
  command: `import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "{{baseUrl}}"
});

const decision = await behalf.verify({
  agentId: "{{agentId}}",
  action: "deploy_production"
});

if (!decision.allowed) {
  // approvalRequired means a person can still say yes — poll or wait for the
  // approval webhook. Anything else is a refusal.
  throw new Error(decision.reason);
}`,
  detail:
    "A verify call returns allowed, approvalRequired, reason, and a requestId. Every call is written to your activity log whichever way it goes, so you get an audit trail even for actions you allow."
};

const addCiStep: SetupStep = {
  id: "add_ci_step",
  title: "Ask BehalfID before the risky step",
  body:
    "Put the check in front of the deploy, not around the whole job. A refusal fails the step, which fails the job.",
  language: "yaml",
  command: `- name: Ask BehalfID before deploying
  env:
    BEHALFID_API_KEY: \${{ secrets.BEHALFID_API_KEY }}
  run: |
    curl -sS --fail-with-body -X POST "{{baseUrl}}/api/verify" \\
      -H "Authorization: Bearer $BEHALFID_API_KEY" \\
      -H "Content-Type: application/json" \\
      -d '{"agentId":"{{agentId}}","action":"deploy_production","metadata":{"environment":"production","repository":"\${{ github.repository }}"}}' \\
      | tee decision.json
    node -e 'process.exit(JSON.parse(require("fs").readFileSync("decision.json","utf8")).allowed ? 0 : 1)'

- name: Deploy
  run: ./deploy.sh`,
  detail:
    "`--fail-with-body` makes curl exit non-zero on an HTTP error, and the node line exits non-zero when BehalfID says no — so both a refusal and an outage stop the deploy. That is the fail-closed shape; drop the node line if you would rather log and continue."
};

const configureMcp: SetupStep = {
  id: "configure_mcp",
  title: "Add the BehalfID MCP server",
  body:
    "Generates a .mcp.json in this project and writes a summary of the agent's permissions your assistant can read.",
  command: "behalf mcp init",
  language: "bash",
  detail:
    "Existing .mcp.json entries are preserved. This server is advisory: it answers when your assistant asks, but it does not intercept the other MCP servers you have configured."
};

// ────────────────────────────────────────────────────────────────────────────
// Paths
// ────────────────────────────────────────────────────────────────────────────

const CODING_AGENT_DETECTABLE: DetectableSignal[] = [
  "agent_created",
  "credential_issued",
  "policy_configured",
  "credential_used",
  "verification_observed",
  "approval_observed"
];

function codingAgentPath(
  target: Extract<SetupTarget, "claude_code" | "codex" | "cursor">,
  tool: "claude" | "codex" | "cursor",
  label: string
): SetupPath {
  return {
    target,
    location: "workstation",
    label,
    outcome: `${label} asks BehalfID before it edits a file, runs a command, or reaches the network.`,
    enforcement: "intercepting",
    enforcementPoint: `A hook inside ${label}, on this machine.`,
    credential: "An agent key held by the CLI on this machine.",
    fail:
      tool === "cursor"
        ? {
            ...CLI_HOOK_FAIL,
            onDeny: "The shell command is blocked before it runs. File edits are not intercepted on this path."
          }
        : CLI_HOOK_FAIL,
    detectable: CODING_AGENT_DETECTABLE,
    requiresCustomerCode: false,
    limits:
      tool === "cursor"
        ? "Cursor exposes a shell hook only, so BehalfID sees commands but not individual file edits."
        : undefined,
    steps: [installCli, authenticateCli, pointCliAtAgent, launchStep(tool, label)]
  };
}

export const SETUP_PATHS: SetupPath[] = [
  codingAgentPath("claude_code", "claude", "Claude Code"),
  codingAgentPath("codex", "codex", "Codex"),
  codingAgentPath("cursor", "cursor", "Cursor"),
  {
    target: "mcp_agent",
    location: "workstation",
    label: "An MCP-based assistant",
    outcome:
      "Your assistant can ask BehalfID whether an action is allowed, and can read what this agent is permitted to do.",
    enforcement: "advisory",
    enforcementPoint: "Inside your assistant, when it chooses to ask.",
    credential: "An agent key held by the CLI on this machine.",
    fail: {
      onDeny: "BehalfID returns a refusal. Whether the assistant respects it is up to the assistant.",
      onUnreachable: "The tool call fails; the assistant decides what to do next.",
      failsOpen: true
    },
    detectable: ["agent_created", "credential_issued", "policy_configured", "verification_observed"],
    requiresCustomerCode: false,
    limits:
      "This server answers questions — it does not sit in front of your other MCP servers. For enforcement that cannot be skipped, use the Claude Code, Codex, or Cursor path, whose hook also covers MCP tool calls as `mcp_tool` on the server name.",
    steps: [installCli, authenticateCli, pointCliAtAgent, configureMcp]
  },
  {
    target: "ci",
    location: "ci",
    label: "CI / GitHub Actions",
    outcome: "Your pipeline asks BehalfID before it ships, and stops when the answer is no.",
    enforcement: "advisory",
    enforcementPoint: "A step in your workflow, which you add.",
    credential: "An agent key stored as a CI secret.",
    fail: CALLER_FAIL,
    detectable: ["agent_created", "credential_issued", "policy_configured", "credential_used", "verification_observed"],
    requiresCustomerCode: true,
    limits:
      "Nobody is at a keyboard in CI. An action set to \"require approval\" will hold the job until a person responds, so use approvals for deploys a human really does gate, and blocks for everything else.",
    steps: [setCredentialEnv, addCiStep]
  },
  {
    target: "custom_agent",
    location: "server",
    label: "Your own agent or service",
    outcome: "Your code asks BehalfID before each risky action and honours the answer.",
    enforcement: "advisory",
    enforcementPoint: "Your code, at the call site you choose.",
    credential: "An agent key in your process environment.",
    fail: CALLER_FAIL,
    detectable: ["agent_created", "credential_issued", "policy_configured", "credential_used", "verification_observed", "approval_observed"],
    requiresCustomerCode: true,
    steps: [installSdk, setCredentialEnv, addVerifyCall]
  }
];

// ────────────────────────────────────────────────────────────────────────────
// Lookup and rendering
// ────────────────────────────────────────────────────────────────────────────

export const SETUP_TARGET_LABELS: Record<SetupTarget, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  mcp_agent: "An MCP assistant",
  ci: "CI / GitHub Actions",
  custom_agent: "My own agent or service"
};

export const SETUP_TARGET_DESCRIPTIONS: Record<SetupTarget, string> = {
  claude_code: "The terminal coding agent. BehalfID installs a hook and stops actions itself.",
  codex: "The Codex CLI. BehalfID installs a hook and stops actions itself.",
  cursor: "Cursor's agent. BehalfID gates shell commands it runs.",
  mcp_agent: "An assistant you have wired up through MCP.",
  ci: "A pipeline that builds, tests, and ships without a person watching.",
  custom_agent: "Something you wrote. You call BehalfID and act on the answer."
};

/** Which locations a target can honestly be set up in. */
export const TARGET_LOCATIONS: Record<SetupTarget, SetupLocation[]> = {
  claude_code: ["workstation"],
  codex: ["workstation"],
  cursor: ["workstation"],
  mcp_agent: ["workstation"],
  ci: ["ci"],
  custom_agent: ["server"]
};

export function isSetupTarget(value: unknown): value is SetupTarget {
  return typeof value === "string" && (SETUP_TARGETS as readonly string[]).includes(value);
}

export function getSetupPath(target: SetupTarget): SetupPath {
  const path = SETUP_PATHS.find((entry) => entry.target === target);
  if (!path) throw new Error(`Unknown setup target: ${target}`);
  return path;
}

/** Map the agent-surface values used elsewhere onto a setup target. */
export function setupTargetForSurface(surface: string): SetupTarget {
  switch (surface) {
    case "claude_code":
      return "claude_code";
    case "codex":
      return "codex";
    case "cursor":
      return "cursor";
    case "github_actions":
      return "ci";
    case "internal":
    case "other":
    default:
      return "custom_agent";
  }
}

const AGENT_ID_PATTERN = /^agent_[A-Za-z0-9_-]{1,64}$/;

/**
 * Substitute real values into a generated command.
 *
 * The agent id is pattern-checked and the base URL is parsed before either is
 * interpolated, so a malformed value can never be pasted into a shell snippet
 * we told the customer to run.
 */
export function renderSetupCommand(
  command: string,
  context: { agentId?: string | null; baseUrl?: string | null }
): string {
  const agentId = context.agentId && AGENT_ID_PATTERN.test(context.agentId) ? context.agentId : "<your agent id>";

  let baseUrl = "https://behalfid.com";
  if (context.baseUrl) {
    try {
      const parsed = new URL(context.baseUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        baseUrl = parsed.origin;
      }
    } catch {
      // keep the default
    }
  }

  return command.replaceAll("{{agentId}}", agentId).replaceAll("{{baseUrl}}", baseUrl);
}

export function renderSetupSteps(
  path: SetupPath,
  context: { agentId?: string | null; baseUrl?: string | null }
): SetupStep[] {
  return path.steps.map((step) =>
    step.command ? { ...step, command: renderSetupCommand(step.command, context) } : step
  );
}

/**
 * Copy for how a path behaves when BehalfID is unreachable. Deliberately
 * per-path: the CLI hook and an SDK caller behave differently, and a single
 * blanket sentence would be wrong for one of them.
 */
export function failBehaviourSummary(path: SetupPath): string {
  return path.fail.failsOpen
    ? `If BehalfID cannot be reached, the action goes ahead. ${path.fail.onUnreachable}`
    : `If BehalfID cannot be reached, ${path.fail.onUnreachable.charAt(0).toLowerCase()}${path.fail.onUnreachable.slice(1)}`;
}

/** CI is unattended, so approvals there behave differently enough to warn about. */
export function locationPolicyNote(
  location: SetupLocation,
  approvalCount: number
): string | null {
  if (location !== "ci" || approvalCount === 0) return null;
  return `${approvalCount} of your rules need a person to approve them. In CI nobody is watching, so those jobs will wait until someone responds in your approval inbox. Consider blocking those actions in CI instead.`;
}

export function protectionStateNoteForCi(state: ProtectionState): string | null {
  return state === "approve"
    ? "This will pause an unattended job until a person responds."
    : null;
}
