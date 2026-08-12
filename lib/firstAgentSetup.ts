import type { AgentProvider } from "@/lib/agents";
import type { AgentTool } from "@/lib/onboarding";
import {
  defaultProtectionPolicy,
  presetPolicy,
  reconcilePreset,
  getProtectionControl,
  validateProtectionPolicy,
  type ProtectionControlId,
  type ProtectionPolicy,
  type ProtectionPreset,
  type ProtectionState
} from "@/lib/protectionPolicy";
import {
  buildPermissionsFromProtectionPolicy,
  protectionPermissionBody,
  type ProtectionPermission
} from "@/lib/protectionPolicyPermissions";
import { readString } from "@/lib/validation";

export const AGENT_SURFACES = [
  "claude_code",
  "codex",
  "cursor",
  "github_actions",
  "internal",
  "other"
] as const;
export type AgentSurface = (typeof AGENT_SURFACES)[number];

export const AGENT_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type AgentEnvironment = (typeof AGENT_ENVIRONMENTS)[number];

export type FirstAgentPermissionInput = ProtectionPermission;

export type FirstAgentSetupInput = {
  surface: AgentSurface;
  name: string;
  description?: string;
  environment?: AgentEnvironment;
  protectionPolicy: ProtectionPolicy;
};

export type FirstAgentSetupValidation = {
  input?: FirstAgentSetupInput;
  error: string | null;
};

export const AGENT_SURFACE_LABELS: Record<AgentSurface, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  github_actions: "GitHub Actions / CI",
  internal: "Internal agent",
  other: "Other"
};

export const AGENT_SURFACE_DESCRIPTIONS: Record<AgentSurface, string> = {
  claude_code: "Terminal coding agent with file, shell, and web tools.",
  codex: "Terminal coding agent with file, shell, and web tools.",
  cursor: "Editor agent with file and shell tools.",
  github_actions: "CI jobs that build, test, and ship on your behalf.",
  internal: "An agent you built and run yourself.",
  other: "Something else."
};

export function isAgentSurface(value: string): value is AgentSurface {
  return (AGENT_SURFACES as readonly string[]).includes(value);
}

export function isAgentEnvironment(value: string): value is AgentEnvironment {
  return (AGENT_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Which starting policy we suggest for a surface. CI and internal automation
 * run unattended, so they start Strict; interactive coding agents start on the
 * Recommended policy, which keeps normal development moving.
 */
export function recommendPresetForSurface(surface: AgentSurface): ProtectionPreset {
  switch (surface) {
    case "github_actions":
    case "internal":
      return "strict";
    case "claude_code":
    case "codex":
    case "cursor":
    case "other":
    default:
      return "recommended";
  }
}

export function recommendPolicyForSurface(surface: AgentSurface): ProtectionPolicy {
  return presetPolicy(recommendPresetForSurface(surface));
}

export function mapAgentSurfaceToProvider(surface: AgentSurface): AgentProvider {
  switch (surface) {
    case "claude_code":
      return "claude";
    case "codex":
      return "openai";
    case "cursor":
      return "custom";
    case "github_actions":
      return "custom";
    case "internal":
      return "custom";
    case "other":
    default:
      return "other";
  }
}

export function buildPermissionsFromSetup(input: FirstAgentSetupInput): FirstAgentPermissionInput[] {
  return buildPermissionsFromProtectionPolicy(input.protectionPolicy);
}

/**
 * Pick a request that demonstrates the policy the customer just chose, and
 * state up front what BehalfID will answer.
 *
 * The expectation is read from the compiled permissions, not from the UI, so
 * the "test decision" step can never promise an outcome the engine will not
 * produce.
 */
export function buildTestDecision(input: {
  protectionPolicy: ProtectionPolicy;
  agentName: string;
  defaultEnvironment?: AgentEnvironment;
}) {
  const policy = input.protectionPolicy;

  // Prefer the most recognisable gated action, then anything gated at all, then
  // fall back to demonstrating an allowed action.
  const order: ProtectionControlId[] = [
    "deploy_production",
    "change_credentials",
    "change_production_data",
    "spend_money",
    "change_billing",
    "run_commands",
    "edit_files",
    "read_files"
  ];

  const pick = (state: ProtectionState) =>
    order.find((id) => policy.controls[id] === state);

  const controlId = pick("approve") ?? pick("block") ?? pick("allow") ?? "read_files";
  const control = getProtectionControl(controlId);
  const state = policy.controls[controlId];

  // A purchase must carry an amount whenever a spending cap exists, so use an
  // amount that lands in the band the chosen state describes.
  const amount =
    controlId === "spend_money" && policy.spending.enabled
      ? state === "approve"
        ? Math.max(policy.spending.approveOver + 1, 1)
        : Math.max(policy.spending.blockOver, 1)
      : undefined;

  return {
    controlId,
    controlLabel: control.label,
    action: control.action,
    resource: control.resource ?? "",
    vendor: control.resource ?? "",
    amount,
    environment: input.defaultEnvironment ?? "production",
    metadata: sanitizeVerifyMetadata({
      source: "first_agent_setup",
      agentName: input.agentName,
      defaultEnvironment: input.defaultEnvironment,
      test: true
    }),
    expectsApproval: state === "approve",
    expectsDenied: state === "block",
    expectsAllowed: state === "allow"
  };
}

/**
 * Legacy bridge: a browser session opened before this step shipped still posts
 * `controlProfile` / `approvalGates`. Those gates all mapped to
 * approval-required production controls, which is exactly what the Recommended
 * policy does, so translate the whole payload to it rather than keeping a
 * second policy model alive.
 */
function legacyPolicyFromBody(record: Record<string, unknown>): ProtectionPolicy | null {
  if (record.controlProfile === undefined && record.approvalGates === undefined) return null;
  return presetPolicy("recommended");
}

export function validateFirstAgentSetupBody(body: unknown): FirstAgentSetupValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const surfaceRaw = readString(record.surface);
  if (!surfaceRaw || !isAgentSurface(surfaceRaw)) {
    return { error: "surface must be a supported agent surface." };
  }

  const name = readString(record.name);
  if (!name) return { error: "name is required." };
  if (name.length > 120) return { error: "name must be at most 120 characters." };

  const description = record.description === undefined ? undefined : readString(record.description);
  if (record.description !== undefined && !description) {
    return { error: "description must be a non-empty string when provided." };
  }
  if (description && description.length > 800) {
    return { error: "description must be at most 800 characters." };
  }

  const environmentRaw = record.environment === undefined ? "production" : readString(record.environment);
  if (!environmentRaw || !isAgentEnvironment(environmentRaw)) {
    return { error: "environment must be development, staging, or production." };
  }

  let protectionPolicy: ProtectionPolicy;
  if (record.protectionPolicy !== undefined) {
    const parsed = validateProtectionPolicy(record.protectionPolicy);
    if (parsed.error || !parsed.policy) {
      return { error: parsed.error ?? "protectionPolicy is invalid." };
    }
    protectionPolicy = reconcilePreset(parsed.policy);
  } else {
    protectionPolicy = legacyPolicyFromBody(record) ?? defaultProtectionPolicy();
  }

  return {
    input: {
      surface: surfaceRaw,
      name,
      description: description || undefined,
      environment: environmentRaw,
      protectionPolicy
    },
    error: null
  };
}

export function permissionBodyFromSetupPermission(permission: FirstAgentPermissionInput) {
  return protectionPermissionBody(permission);
}

export function sanitizeVerifyMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return metadata;
  const clone = { ...metadata };
  for (const key of Object.keys(clone)) {
    if (/token|apikey|api_key|secret|password/i.test(key)) {
      delete clone[key];
    }
  }
  return clone;
}

export function buildIntegrationInstructions(input: {
  surface: AgentSurface;
  apiKeyPlaceholder?: string;
}) {
  const key = input.apiKeyPlaceholder ?? "bhf_sk_…";
  const envBlock = `BEHALF_API_KEY=${key}`;

  switch (input.surface) {
    case "github_actions":
      return {
        title: "Add BehalfID to GitHub Actions", // pragma: allowlist secret
        body: "Store the agent key as a repository or organization secret, then call verify before deploy steps.",
        envBlock,
        snippet: `# .github/workflows/deploy.yml\n- name: Verify production deploy\n  env:\n    BEHALF_API_KEY: \${{ secrets.BEHALF_API_KEY }}\n  run: |\n    curl -sS -X POST "$BEHALF_API_URL/verify" \\\n      -H "Authorization: Bearer $BEHALF_API_KEY" \\\n      -H "Content-Type: application/json" \\\n      -d '{"agentId":"YOUR_AGENT_ID","action":"deploy_production","resource":"production"}'`
      };
    case "claude_code":
      return {
        title: "Add BehalfID to Claude Code", // pragma: allowlist secret
        body: "Export the key in your shell profile or project env file and call verify before tool actions that touch production.",
        envBlock,
        snippet: `# ~/.zshrc or project .env\n${envBlock}\n\n# Before a risky tool action:\n# POST /api/verify with Authorization: Bearer $BEHALF_API_KEY`
      };
    case "codex":
      return {
        title: "Add BehalfID to Codex", // pragma: allowlist secret
        body: "Load the key into your Codex workspace environment and verify before deploy or secret mutations.",
        envBlock,
        snippet: `# Project environment\n${envBlock}\n\n# Verify before executing gated actions in your agent workflow.`
      };
    case "cursor":
      return {
        title: "Add BehalfID to Cursor agents", // pragma: allowlist secret
        body: "Add the key to your project environment or CI secret store and verify before production-impacting tool calls.",
        envBlock,
        snippet: `# .env.local (never commit)\n${envBlock}\n\n# Call POST /api/verify before deploy_production, secrets_write, or other gated actions.`
      };
    case "internal":
      return {
        title: "Wire your internal agent",
        body: "Inject the key into your internal runner and call verify at the enforcement boundary.",
        envBlock,
        snippet: `${envBlock}\n\n# Node example\nawait fetch(process.env.BEHALF_API_URL + "/verify", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer " + process.env.BEHALF_API_KEY,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({ agentId, action, resource })\n});`
      };
    case "other":
    default:
      return {
        title: "Connect your agent",
        body: "Store the key securely and verify before any action covered by your selected gates.",
        envBlock,
        snippet: `${envBlock}\n\n# POST /api/verify\n# Authorization: Bearer <BEHALF_API_KEY>`
      };
  }
}

export function surfaceFromAccountTool(tool: AgentTool): AgentSurface | null {
  if (tool === "other") return null;
  return tool;
}
