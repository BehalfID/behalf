import type { AgentProvider } from "@/lib/agents";
import type { AgentTool } from "@/lib/onboarding";
import type { PolicyPermission } from "@/lib/policyTemplates";
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

export const CONTROL_PROFILES = [
  "conservative",
  "balanced",
  "production_strict",
  "custom"
] as const;
export type ControlProfile = (typeof CONTROL_PROFILES)[number];

export const APPROVAL_GATES = [
  "production_deploys",
  "secret_env_changes",
  "infrastructure_mutations",
  "database_schema_changes",
  "billing_payment_actions",
  "external_network_actions"
] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export const AGENT_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type AgentEnvironment = (typeof AGENT_ENVIRONMENTS)[number];

export type FirstAgentPermissionInput = PolicyPermission & {
  gate?: ApprovalGate;
};

export type FirstAgentSetupInput = {
  surface: AgentSurface;
  name: string;
  description?: string;
  environment?: AgentEnvironment;
  controlProfile: ControlProfile;
  approvalGates: ApprovalGate[];
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

export const CONTROL_PROFILE_LABELS: Record<ControlProfile, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  production_strict: "Production strict",
  custom: "Custom"
};

export const CONTROL_PROFILE_DESCRIPTIONS: Record<ControlProfile, string> = {
  conservative:
    "Minimal scope with approval on every selected gate. Best for first-time enforcement or read-heavy workflows.",
  balanced:
    "Staging and preview actions stay open while production-facing gates require approval.",
  production_strict:
    "Strict production controls with explicit blocks on bypass paths. Recommended for CI and internal automation.",
  custom:
    "Apply only the gates you select, without profile-driven baseline permissions."
};

export const APPROVAL_GATE_LABELS: Record<ApprovalGate, string> = {
  production_deploys: "Production deploys",
  secret_env_changes: "Secret / env changes",
  infrastructure_mutations: "Infrastructure mutations",
  database_schema_changes: "Database / schema changes",
  billing_payment_actions: "Billing / payment actions",
  external_network_actions: "External network actions"
};

export const APPROVAL_GATE_DESCRIPTIONS: Record<ApprovalGate, string> = {
  production_deploys: "Gate promotion to production and production-only deploy actions.",
  secret_env_changes: "Require approval before writing secrets, credentials, or environment variables.",
  infrastructure_mutations: "Gate infrastructure create/update/delete operations in protected environments.",
  database_schema_changes: "Require approval before production schema or migration changes.",
  billing_payment_actions: "Gate billing, payment, and vendor API calls that can incur cost.",
  external_network_actions: "Require approval before outbound calls to external services or APIs."
};

const GATE_PERMISSIONS: Record<ApprovalGate, FirstAgentPermissionInput> = {
  production_deploys: {
    gate: "production_deploys",
    action: "deploy_production",
    resource: "production",
    allowedActions: ["promote staging build to production", "deploy to production"],
    blockedActions: ["rollback without approval", "delete production deployment"],
    requiresApproval: true,
    notes: "Production deploy gate from first-agent setup."
  },
  secret_env_changes: {
    gate: "secret_env_changes",
    action: "secrets_write",
    resource: "environment",
    allowedActions: ["update environment variables", "write secrets"],
    blockedActions: ["read raw secret values", "export secrets"],
    requiresApproval: true,
    notes: "Secret and environment variable gate from first-agent setup."
  },
  infrastructure_mutations: {
    gate: "infrastructure_mutations",
    action: "infrastructure.mutate",
    resource: "production",
    allowedActions: ["create infrastructure", "update infrastructure", "delete infrastructure"],
    blockedActions: ["bypass approval workflow"],
    requiresApproval: true,
    notes: "Infrastructure mutation gate from first-agent setup."
  },
  database_schema_changes: {
    gate: "database_schema_changes",
    action: "database_migrate_production",
    resource: "production",
    allowedActions: ["run production migration", "apply schema change"],
    blockedActions: ["drop production database", "destructive migration without approval"],
    requiresApproval: true,
    notes: "Database schema gate from first-agent setup."
  },
  billing_payment_actions: {
    gate: "billing_payment_actions",
    action: "billing_vendor_api",
    resource: "billing",
    allowedActions: ["charge payment method", "update billing settings", "call vendor billing API"],
    blockedActions: ["refund without approval"],
    requiresApproval: true,
    notes: "Billing and vendor API gate from first-agent setup."
  },
  external_network_actions: {
    gate: "external_network_actions",
    action: "external.network",
    resource: "external",
    allowedActions: ["call external API", "send outbound webhook", "fetch remote resource"],
    blockedActions: ["exfiltrate credentials"],
    requiresApproval: true,
    notes: "External network gate from first-agent setup."
  }
};

const BASELINE_PERMISSIONS: Partial<Record<ControlProfile, FirstAgentPermissionInput[]>> = {
  conservative: [
    {
      action: "create_content",
      resource: "local-filesystem",
      allowedActions: ["read files", "write files", "run tests"],
      blockedActions: ["deploy to production", "write secrets", "push to remote repository"],
      requiresApproval: false,
      notes: "Conservative baseline from first-agent setup."
    }
  ],
  balanced: [
    {
      action: "deploy",
      resource: "staging",
      allowedActions: ["deploy to staging", "create preview deployment"],
      blockedActions: ["deploy to production", "modify production environment variables"],
      requiresApproval: false,
      notes: "Balanced staging baseline from first-agent setup."
    }
  ],
  production_strict: [
    {
      action: "deploy",
      resource: "staging",
      allowedActions: ["deploy to staging", "create preview deployment"],
      blockedActions: ["deploy to production", "promote to production"],
      requiresApproval: false,
      notes: "Production-strict staging baseline from first-agent setup."
    }
  ]
};

export function isAgentSurface(value: string): value is AgentSurface {
  return (AGENT_SURFACES as readonly string[]).includes(value);
}

export function isControlProfile(value: string): value is ControlProfile {
  return (CONTROL_PROFILES as readonly string[]).includes(value);
}

export function isApprovalGate(value: string): value is ApprovalGate {
  return (APPROVAL_GATES as readonly string[]).includes(value);
}

export function isAgentEnvironment(value: string): value is AgentEnvironment {
  return (AGENT_ENVIRONMENTS as readonly string[]).includes(value);
}

export function recommendControlProfile(surface: AgentSurface): ControlProfile {
  switch (surface) {
    case "github_actions":
    case "internal":
      return "production_strict";
    case "claude_code":
    case "codex":
    case "cursor":
      return "balanced";
    case "other":
    default:
      return "conservative";
  }
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

export function defaultApprovalGatesForSurface(surface: AgentSurface): ApprovalGate[] {
  switch (surface) {
    case "github_actions":
      return ["production_deploys", "secret_env_changes", "infrastructure_mutations"];
    case "internal":
      return ["production_deploys", "database_schema_changes", "billing_payment_actions"];
    case "claude_code":
    case "codex":
    case "cursor":
      return ["production_deploys", "secret_env_changes", "database_schema_changes"];
    case "other":
    default:
      return ["production_deploys", "secret_env_changes"];
  }
}

function applyProfileToGatePermission(
  gate: ApprovalGate,
  profile: ControlProfile
): FirstAgentPermissionInput {
  const base = {
    ...GATE_PERMISSIONS[gate],
    allowedActions: [...GATE_PERMISSIONS[gate].allowedActions],
    blockedActions: [...GATE_PERMISSIONS[gate].blockedActions],
    requiresApproval: true
  };

  if (profile === "production_strict") {
    base.blockedActions = [...base.blockedActions, "bypass approval workflow", "force deploy"];
  }

  return base;
}

export function buildPermissionsFromSetup(input: FirstAgentSetupInput): FirstAgentPermissionInput[] {
  const gates = input.controlProfile === "custom" ? input.approvalGates : input.approvalGates;
  const gatePermissions = gates.map((gate) => applyProfileToGatePermission(gate, input.controlProfile));

  if (input.controlProfile === "custom") {
    return gatePermissions;
  }

  const baseline = BASELINE_PERMISSIONS[input.controlProfile] ?? [];
  return [...baseline, ...gatePermissions];
}

export function buildTestDecision(input: {
  approvalGates: ApprovalGate[];
  agentName: string;
  defaultEnvironment?: AgentEnvironment;
}) {
  const action = "deploy_production";
  const resource = "production";
  const vendor = "production";
  const environment = "production";
  const expectsApproval = input.approvalGates.includes("production_deploys");
  const expectsDenied = !expectsApproval;

  return {
    action,
    resource,
    vendor,
    environment,
    metadata: sanitizeVerifyMetadata({
      source: "first_agent_setup",
      agentName: input.agentName,
      defaultEnvironment: input.defaultEnvironment,
      test: true
    }),
    expectsApproval,
    expectsDenied,
    expectsAllowed: false
  };
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

  const profileRaw = readString(record.controlProfile);
  if (!profileRaw || !isControlProfile(profileRaw)) {
    return { error: "controlProfile must be conservative, balanced, production_strict, or custom." };
  }

  const gatesRaw = record.approvalGates;
  if (!Array.isArray(gatesRaw)) {
    return { error: "approvalGates must be an array." };
  }

  const approvalGates: ApprovalGate[] = [];
  for (const gate of gatesRaw) {
    if (typeof gate !== "string" || !isApprovalGate(gate)) {
      return { error: "approvalGates contains an invalid gate." };
    }
    if (!approvalGates.includes(gate)) approvalGates.push(gate);
  }

  if (profileRaw === "custom" && approvalGates.length === 0) {
    return { error: "Select at least one approval gate for a custom profile." };
  }

  if (profileRaw !== "custom" && approvalGates.length === 0) {
    return { error: "Select at least one approval gate." };
  }

  return {
    input: {
      surface: surfaceRaw,
      name,
      description: description || undefined,
      environment: environmentRaw,
      controlProfile: profileRaw,
      approvalGates
    },
    error: null
  };
}

export function permissionBodyFromSetupPermission(permission: FirstAgentPermissionInput) {
  return {
    action: permission.action,
    resource: permission.resource || undefined,
    allowedActions: permission.allowedActions,
    blockedActions: permission.blockedActions,
    requiresApproval: permission.requiresApproval,
    notes: permission.notes || undefined,
    constraints: permission.constraints
  };
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

export function mergeSuggestedGates(existing: ApprovalGate[], suggested: ApprovalGate[]): ApprovalGate[] {
  const merged = [...existing];
  for (const gate of suggested) {
    if (!merged.includes(gate)) merged.push(gate);
  }
  return merged;
}
