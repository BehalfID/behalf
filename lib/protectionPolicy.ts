/**
 * Protection policy — the single source of truth that turns the plain-language
 * choices a new customer makes during onboarding into real BehalfID
 * enforcement.
 *
 * Design rules, in priority order:
 *
 * 1. Every control here maps to a permission shape that `POST /api/verify`
 *    genuinely evaluates. Nothing in this file is decorative.
 * 2. `allowedActions` / `blockedActions` are **canonical action identifiers**,
 *    never prose. `lib/verify.ts` treats a non-empty `allowedActions` as an
 *    exact-match allowlist, so a human-readable phrase in that field denies the
 *    very action it claims to permit.
 * 3. Presets are shorthand for an explicit, fully-materialised control map.
 *    Nothing downstream reads `policy.preset` to make a decision — the
 *    verification engine only ever sees permissions built from `controls`.
 */

export const PROTECTION_POLICY_VERSION = 1;

// ────────────────────────────────────────────────────────────────────────────
// States
// ────────────────────────────────────────────────────────────────────────────

export const PROTECTION_STATES = ["allow", "approve", "block"] as const;
export type ProtectionState = (typeof PROTECTION_STATES)[number];

export const PROTECTION_STATE_LABELS: Record<ProtectionState, string> = {
  allow: "Allow automatically",
  approve: "Require my approval",
  block: "Block"
};

export const PROTECTION_STATE_SHORT_LABELS: Record<ProtectionState, string> = {
  allow: "Allow",
  approve: "Ask me",
  block: "Block"
};

export const PROTECTION_STATE_DESCRIPTIONS: Record<ProtectionState, string> = {
  allow: "The agent does this on its own. Every attempt is still recorded.",
  approve: "The agent has to ask. It waits, paused, until you say yes.",
  block: "The agent cannot do this. There is nothing to approve."
};

export function isProtectionState(value: unknown): value is ProtectionState {
  return typeof value === "string" && (PROTECTION_STATES as readonly string[]).includes(value);
}

// ────────────────────────────────────────────────────────────────────────────
// Where a control is enforced
// ────────────────────────────────────────────────────────────────────────────

/**
 * How the decision actually reaches BehalfID.
 *
 * - `cli`  — the BehalfID CLI hook produces this action automatically once the
 *            customer installs it in Claude Code / Codex / Cursor.
 *            See packages/cli/src/commands/hook.ts (mapToolToAction).
 * - `api`  — the customer's own pipeline or agent calls POST /api/verify with
 *            this action. Enforced identically, but only once they wire it up.
 */
export const ENFORCEMENT_SURFACES = ["cli", "api"] as const;
export type EnforcementSurface = (typeof ENFORCEMENT_SURFACES)[number];

export const ENFORCEMENT_SURFACE_LABELS: Record<EnforcementSurface, string> = {
  cli: "Enforced by the BehalfID CLI",
  api: "Enforced when your pipeline calls BehalfID"
};

export const ENFORCEMENT_SURFACE_HELP: Record<EnforcementSurface, string> = {
  cli: "Works as soon as you install the BehalfID CLI into your coding agent. No other wiring needed.",
  api: "Works once your deploy script, CI job, or agent asks BehalfID before it acts. We show you how after setup."
};

// ────────────────────────────────────────────────────────────────────────────
// Categories
// ────────────────────────────────────────────────────────────────────────────

export const PROTECTION_CATEGORIES = [
  "workspace",
  "reach",
  "shipping",
  "data",
  "money"
] as const;
export type ProtectionCategoryId = (typeof PROTECTION_CATEGORIES)[number];

export type ProtectionCategory = {
  id: ProtectionCategoryId;
  label: string;
  /** One line: what this group of controls is protecting. */
  description: string;
  surface: EnforcementSurface;
};

export const PROTECTION_CATEGORY_LIST: ProtectionCategory[] = [
  {
    id: "workspace",
    label: "Your code and your machine",
    description: "What the agent may do to the files and shell on the computer it runs on.",
    surface: "cli"
  },
  {
    id: "reach",
    label: "Reaching outside the project",
    description: "The internet, connected tools, and helper agents it can start on its own.",
    surface: "cli"
  },
  {
    id: "shipping",
    label: "Shipping and releases",
    description: "Putting changes in front of real users.",
    surface: "api"
  },
  {
    id: "data",
    label: "Data and credentials",
    description: "Production data and the keys that unlock everything else.",
    surface: "api"
  },
  {
    id: "money",
    label: "Money",
    description: "Anything that can spend, charge, or refund.",
    surface: "api"
  }
];

// ────────────────────────────────────────────────────────────────────────────
// Controls
// ────────────────────────────────────────────────────────────────────────────

export const PROTECTION_CONTROLS = [
  "read_files",
  "edit_files",
  "run_commands",
  "browse_web",
  "use_connected_tools",
  "start_subagents",
  "deploy_production",
  "deploy_other_environments",
  "change_production_data",
  "change_credentials",
  "spend_money",
  "change_billing",
  "send_external_messages"
] as const;
export type ProtectionControlId = (typeof PROTECTION_CONTROLS)[number];

export type ProtectionControl = {
  id: ProtectionControlId;
  category: ProtectionCategoryId;
  surface: EnforcementSurface;
  /** Plain-language name. Never an internal identifier. */
  label: string;
  /** What this protects. One sentence, no security jargon. */
  description: string;
  /** What happens when the agent tries it, per state. */
  outcome: Record<ProtectionState, string>;
  /** Recognisable examples. `conceptual: true` when no shipped integration emits them for you. */
  examples: string[];
  conceptualExamples: boolean;
  /** States this control can honestly represent. */
  states: readonly ProtectionState[];
  /**
   * Canonical action identifier written to the permission. This is the exact
   * string `POST /api/verify` matches on.
   */
  action: string;
  /** Default `resource` recorded on the permission, or undefined for none. */
  resource?: string;
  /** Only shown in the Advanced drawer, not in the default category list. */
  advanced?: boolean;
};

/**
 * Resource is deliberately omitted on most controls.
 *
 * `lib/verify.ts` treats `permission.resource` as a hard equality check against
 * the request's `vendor`. Setting it narrows the permission to callers that
 * send exactly that vendor string, which silently denies everyone else. Only
 * controls whose shipped integration always sends a known vendor set it.
 */
export const PROTECTION_CONTROL_LIST: ProtectionControl[] = [
  {
    id: "read_files",
    category: "workspace",
    surface: "cli",
    label: "Read files",
    description: "Opening files on the machine the agent runs on, including files outside your project.",
    outcome: {
      allow: "The agent opens files without asking. Every read is logged.",
      approve: "Each file the agent opens waits for you. Expect to be asked constantly.",
      block: "The agent cannot read files at all, which stops most coding work."
    },
    examples: ["Read src/server.ts", "Open a config file", "Load a test fixture"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "read_file",
    resource: "filesystem"
  },
  {
    id: "edit_files",
    category: "workspace",
    surface: "cli",
    label: "Create and edit files",
    description: "Writing to files — the normal work of a coding agent.",
    outcome: {
      allow: "The agent edits files on its own. Every change is logged.",
      approve: "Every single file edit pauses for your approval.",
      block: "The agent can read and suggest, but cannot change anything on disk."
    },
    examples: ["Edit a component", "Add a test file", "Update package.json"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "write_file",
    resource: "filesystem"
  },
  {
    id: "run_commands",
    category: "workspace",
    surface: "cli",
    label: "Run terminal commands",
    description: "Anything the agent runs in your shell — builds, tests, installs, git.",
    outcome: {
      allow: "Commands run without asking, except the ones on your blocked list below.",
      approve: "Every command waits for you, with the exact command shown before you decide.",
      block: "The agent cannot run commands. Builds and tests stop working."
    },
    examples: ["npm test", "git commit", "npm install"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "execute_command",
    resource: "shell"
  },
  {
    id: "browse_web",
    category: "reach",
    surface: "cli",
    label: "Read pages from the internet",
    description: "Fetching web pages and running web searches while it works.",
    outcome: {
      allow: "The agent looks things up on its own. The site it fetched is logged.",
      approve: "Each fetch waits for you, with the site shown before you decide.",
      block: "The agent cannot reach the internet."
    },
    examples: ["Read library documentation", "Search for an error message"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "browse_web"
  },
  {
    id: "use_connected_tools",
    category: "reach",
    surface: "cli",
    label: "Use connected tools",
    description:
      "Tools you have plugged into the agent through MCP. BehalfID sees which tool server was called, not what the tool does inside.",
    outcome: {
      allow: "Connected tools run without asking. The tool server is logged each time.",
      approve: "Every connected-tool call waits for you.",
      block: "Connected tools cannot be used at all."
    },
    examples: ["A Linear or Sentry MCP server", "An internal MCP tool"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "mcp_tool"
  },
  {
    id: "start_subagents",
    category: "reach",
    surface: "cli",
    label: "Start helper agents",
    description:
      "Letting the agent spin up its own sub-agents. Anything those sub-agents do is checked against these same rules.",
    outcome: {
      allow: "The agent starts helpers on its own.",
      approve: "Starting a helper agent waits for you.",
      block: "The agent works alone."
    },
    examples: ["Run a research sub-agent", "Fan out a search task"],
    conceptualExamples: false,
    states: PROTECTION_STATES,
    action: "spawn_agent",
    resource: "agent"
  },
  {
    id: "deploy_production",
    category: "shipping",
    surface: "api",
    label: "Deploy to production",
    description: "Releasing changes to the environment your real users are on.",
    outcome: {
      allow: "Production deploys go out without asking.",
      approve: "A production deploy stops and waits for a person to approve it.",
      block: "Production deploys are refused outright."
    },
    examples: ["Promote a build to production", "Cut a production release"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "deploy_production"
  },
  {
    id: "deploy_other_environments",
    category: "shipping",
    surface: "api",
    label: "Deploy to staging and previews",
    description:
      "Everyday deploys to non-production environments. A deploy that names production is refused here — the production control above decides those. A deploy that names no environment at all is treated as non-production.",
    outcome: {
      allow: "Staging and preview deploys go out without asking.",
      approve: "Every non-production deploy waits for you.",
      block: "The agent cannot deploy anywhere through this control."
    },
    examples: ["Deploy to staging", "Create a preview environment"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "deploy"
  },
  {
    id: "change_production_data",
    category: "data",
    surface: "api",
    label: "Change production data",
    description: "Migrations and schema changes against the live database.",
    outcome: {
      allow: "The agent changes production data without asking.",
      approve: "A production database change waits for a person to approve it.",
      block: "Production database changes are refused outright."
    },
    examples: ["Run a production migration", "Alter a live table"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "database_migrate_production"
  },
  {
    id: "change_credentials",
    category: "data",
    surface: "api",
    label: "Change secrets and credentials",
    description: "Writing API keys, tokens, and environment variables that other systems trust.",
    outcome: {
      allow: "The agent writes secrets without asking.",
      approve: "Writing a secret waits for a person to approve it.",
      block: "The agent cannot write secrets at all."
    },
    examples: ["Rotate an API key", "Set a production environment variable"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "secrets_write"
  },
  {
    id: "spend_money",
    category: "money",
    surface: "api",
    label: "Spend money",
    description: "Purchases and charges made through anything the agent can reach.",
    outcome: {
      allow: "Purchases go through without asking, up to any limit you set below.",
      approve: "Every purchase waits for you, with the amount shown before you decide.",
      block: "The agent cannot buy anything."
    },
    examples: ["Buy a subscription", "Place an order", "Charge a card"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "purchase"
  },
  {
    id: "change_billing",
    category: "money",
    surface: "api",
    label: "Change billing and vendor accounts",
    description: "Refunds, plan changes, and calls to a payment provider's API.",
    outcome: {
      allow: "Billing changes go through without asking.",
      approve: "A billing change waits for a person to approve it.",
      block: "Billing changes are refused outright."
    },
    examples: ["Issue a refund", "Change a subscription plan"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "billing_vendor_api"
  },
  {
    id: "send_external_messages",
    category: "reach",
    surface: "api",
    label: "Send email on your behalf",
    description: "Messages that leave your company and land in someone else's inbox.",
    outcome: {
      allow: "The agent sends email without asking.",
      approve: "Every email waits for you before it is sent.",
      block: "The agent cannot send email."
    },
    examples: ["Reply to a customer", "Send a status update"],
    conceptualExamples: true,
    states: PROTECTION_STATES,
    action: "send_email",
    advanced: true
  }
];

const CONTROL_BY_ID = new Map<ProtectionControlId, ProtectionControl>(
  PROTECTION_CONTROL_LIST.map((control) => [control.id, control])
);

export function getProtectionControl(id: ProtectionControlId): ProtectionControl {
  const control = CONTROL_BY_ID.get(id);
  if (!control) throw new Error(`Unknown protection control: ${id}`);
  return control;
}

export function isProtectionControlId(value: unknown): value is ProtectionControlId {
  return typeof value === "string" && (PROTECTION_CONTROLS as readonly string[]).includes(value);
}

export function controlsForCategory(category: ProtectionCategoryId, includeAdvanced = false) {
  return PROTECTION_CONTROL_LIST.filter(
    (control) => control.category === category && (includeAdvanced || !control.advanced)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Always-on guards (deny lists — there is no "approve" shape for these)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Credential-shaped paths refused for both reads and writes.
 * Enforced by `constraints.deniedPaths`, which `lib/verify.ts` checks for
 * `read_file` and `write_file` only.
 */
export const SENSITIVE_FILE_PATTERNS = [
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa",
  "**/id_ed25519",
  "~/.ssh/**",
  "~/.aws/**",
  "~/.config/gcloud/**",
  "**/credentials.json",
  "**/service-account*.json"
] as const;

/**
 * Literal substrings refused inside any shell command.
 * Enforced by `constraints.deniedCommands`, matched as literal substrings of
 * the whole command string (documented in docs/API.md).
 */
export const DESTRUCTIVE_COMMAND_PATTERNS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf --no-preserve-root",
  "mkfs",
  "dd if=/dev/zero",
  "git push --force",
  "git push -f",
  "git reset --hard origin",
  "DROP DATABASE",
  "DROP TABLE",
  "TRUNCATE TABLE",
  "shutdown",
  "chmod -R 777 /"
] as const;

export type ProtectionGuardId = "sensitive_files" | "destructive_commands";

export type ProtectionGuard = {
  id: ProtectionGuardId;
  label: string;
  description: string;
  outcome: string;
  examples: readonly string[];
  category: ProtectionCategoryId;
  surface: EnforcementSurface;
};

export const PROTECTION_GUARD_LIST: ProtectionGuard[] = [
  {
    id: "sensitive_files",
    label: "Never touch credential files",
    description: "Keys, certificates, and .env files stay off limits even when the agent may read and write everything else.",
    outcome: "The agent is refused, and the attempt shows up in your activity log.",
    examples: SENSITIVE_FILE_PATTERNS,
    category: "workspace",
    surface: "cli"
  },
  {
    id: "destructive_commands",
    label: "Never run destructive commands",
    description: "A short list of commands that cannot be undone, refused even when the agent may run everything else.",
    outcome: "The command is refused before your shell ever sees it.",
    examples: DESTRUCTIVE_COMMAND_PATTERNS,
    category: "workspace",
    surface: "cli"
  }
];

// ────────────────────────────────────────────────────────────────────────────
// Spending limits
// ────────────────────────────────────────────────────────────────────────────

export type SpendingLimits = {
  enabled: boolean;
  /** At or below this amount a purchase runs without asking. */
  approveOver: number;
  /** Above this amount a purchase is refused outright. */
  blockOver: number;
};

export const DEFAULT_SPENDING_LIMITS: SpendingLimits = {
  enabled: true,
  approveOver: 25,
  blockOver: 500
};

export const MAX_SPENDING_LIMIT = 1_000_000;

// ────────────────────────────────────────────────────────────────────────────
// Policy shape
// ────────────────────────────────────────────────────────────────────────────

export const PROTECTION_PRESETS = ["recommended", "strict", "minimal", "custom"] as const;
export type ProtectionPreset = (typeof PROTECTION_PRESETS)[number];

export const PROTECTION_PRESET_LABELS: Record<ProtectionPreset, string> = {
  recommended: "Recommended",
  strict: "Strict",
  minimal: "Minimal",
  custom: "Custom"
};

export const PROTECTION_PRESET_DESCRIPTIONS: Record<ProtectionPreset, string> = {
  recommended:
    "Normal coding runs freely. Anything that reaches real users, real money, or real credentials asks you first.",
  strict:
    "Adds your approval to shell commands and connected tools, and refuses credential changes outright.",
  minimal: "Nothing waits on you. Only credential files and unrecoverable shell commands stay blocked.",
  custom: "Start from the recommended settings and change whatever you like."
};

export type ProtectionPolicy = {
  version: number;
  preset: ProtectionPreset;
  controls: Record<ProtectionControlId, ProtectionState>;
  guards: Record<ProtectionGuardId, boolean>;
  spending: SpendingLimits;
};

function controlMap(
  entries: Partial<Record<ProtectionControlId, ProtectionState>>,
  fallback: ProtectionState
): Record<ProtectionControlId, ProtectionState> {
  const result = {} as Record<ProtectionControlId, ProtectionState>;
  for (const id of PROTECTION_CONTROLS) {
    result[id] = entries[id] ?? fallback;
  }
  return result;
}

/**
 * Preset → an explicit state for every control.
 *
 * Presets are a starting point the customer can see and change, not a mode the
 * verification engine understands. Nothing downstream branches on `preset`.
 */
export function presetControls(preset: ProtectionPreset): Record<ProtectionControlId, ProtectionState> {
  switch (preset) {
    case "strict":
      return controlMap(
        {
          read_files: "allow",
          edit_files: "allow",
          run_commands: "approve",
          browse_web: "allow",
          use_connected_tools: "approve",
          start_subagents: "approve",
          deploy_production: "approve",
          deploy_other_environments: "allow",
          change_production_data: "approve",
          change_credentials: "block",
          spend_money: "approve",
          change_billing: "approve",
          send_external_messages: "approve"
        },
        "approve"
      );
    case "minimal":
      return controlMap({}, "allow");
    case "recommended":
    case "custom":
    default:
      return controlMap(
        {
          read_files: "allow",
          edit_files: "allow",
          run_commands: "allow",
          browse_web: "allow",
          use_connected_tools: "allow",
          start_subagents: "allow",
          deploy_production: "approve",
          deploy_other_environments: "allow",
          change_production_data: "approve",
          change_credentials: "approve",
          spend_money: "approve",
          change_billing: "approve",
          send_external_messages: "approve"
        },
        "approve"
      );
  }
}

export function presetPolicy(preset: ProtectionPreset): ProtectionPolicy {
  return {
    version: PROTECTION_POLICY_VERSION,
    preset,
    controls: presetControls(preset),
    // Both guards are deny lists with no downside for a coding agent, so they
    // stay on for every preset including "minimal".
    guards: { sensitive_files: true, destructive_commands: true },
    spending:
      preset === "minimal"
        ? { enabled: false, approveOver: DEFAULT_SPENDING_LIMITS.approveOver, blockOver: DEFAULT_SPENDING_LIMITS.blockOver }
        : preset === "strict"
          ? { enabled: true, approveOver: 0, blockOver: 100 }
          : { ...DEFAULT_SPENDING_LIMITS }
  };
}

export function defaultProtectionPolicy(): ProtectionPolicy {
  return presetPolicy("recommended");
}

/** Why a control carries its recommended state, shown next to the "Recommended" tag. */
export const RECOMMENDED_REASONS: Partial<Record<ProtectionControlId, string>> = {
  read_files: "Blocking reads stops the agent doing any useful work, and reads are already logged.",
  edit_files: "Editing code is the job. Credential files stay protected separately.",
  run_commands: "Tests and builds would stall on every command. Unrecoverable commands stay blocked.",
  browse_web: "Looking up documentation is low risk and the site is recorded.",
  use_connected_tools: "Most connected tools are read-only. Raise this to Strict if yours can act.",
  start_subagents: "Whatever a helper agent does is checked against these same rules.",
  deploy_production: "A bad production deploy reaches your users before you can react.",
  deploy_other_environments: "Staging exists to be broken safely.",
  change_production_data: "Migrations are hard to reverse once data has moved.",
  change_credentials: "A leaked or rotated key can lock you out or open you up.",
  spend_money: "Money leaves your account the moment the request succeeds.",
  change_billing: "Refunds and plan changes are visible to your customers.",
  send_external_messages: "Email cannot be recalled once it is sent."
};

export function recommendedStateFor(id: ProtectionControlId): ProtectionState {
  return presetControls("recommended")[id];
}

// ────────────────────────────────────────────────────────────────────────────
// Agent-type tailoring
// ────────────────────────────────────────────────────────────────────────────

/**
 * Which categories a given agent surface actually exercises. Used only to
 * decide what to open first in the UI — it never changes enforcement.
 */
export const SURFACE_PRIORITY_CATEGORIES: Record<string, ProtectionCategoryId[]> = {
  claude_code: ["workspace", "reach"],
  codex: ["workspace", "reach"],
  cursor: ["workspace", "reach"],
  github_actions: ["shipping", "data"],
  internal: ["data", "money"],
  other: ["workspace", "shipping"]
};

export function priorityCategoriesForSurfaces(surfaces: string[]): ProtectionCategoryId[] {
  const seen: ProtectionCategoryId[] = [];
  for (const surface of surfaces) {
    for (const category of SURFACE_PRIORITY_CATEGORIES[surface] ?? []) {
      if (!seen.includes(category)) seen.push(category);
    }
  }
  return seen.length ? seen : ["workspace"];
}

// ────────────────────────────────────────────────────────────────────────────
// Validation / persistence
// ────────────────────────────────────────────────────────────────────────────

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAmount(value: unknown, field: string): { value?: number; error: string | null } {
  if (value === undefined || value === null || value === "") return { value: undefined, error: null };
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return { error: `${field} must be a number.` };
  if (amount < 0) return { error: `${field} must not be negative.` };
  if (amount > MAX_SPENDING_LIMIT) return { error: `${field} must be at most ${MAX_SPENDING_LIMIT}.` };
  return { value: Math.round(amount * 100) / 100, error: null };
}

/**
 * Parse an untrusted protection policy into a complete, canonical one.
 * Missing controls fall back to the recommended state so a policy saved by an
 * older client never silently loses coverage when new controls ship.
 */
export function validateProtectionPolicy(value: unknown): {
  policy?: ProtectionPolicy;
  error: string | null;
} {
  if (!isRecordValue(value)) {
    return { error: "protectionPolicy must be an object." };
  }

  const preset = value.preset === undefined ? "custom" : value.preset;
  if (typeof preset !== "string" || !(PROTECTION_PRESETS as readonly string[]).includes(preset)) {
    return { error: "protectionPolicy.preset is invalid." };
  }

  const recommended = presetControls("recommended");
  const controls = {} as Record<ProtectionControlId, ProtectionState>;
  const rawControls = value.controls;
  if (rawControls !== undefined && !isRecordValue(rawControls)) {
    return { error: "protectionPolicy.controls must be an object." };
  }
  if (isRecordValue(rawControls)) {
    for (const key of Object.keys(rawControls)) {
      if (!isProtectionControlId(key)) {
        return { error: `protectionPolicy.controls contains an unknown control: ${key}.` };
      }
      if (!isProtectionState(rawControls[key])) {
        return { error: `protectionPolicy.controls.${key} must be allow, approve, or block.` };
      }
    }
  }
  for (const id of PROTECTION_CONTROLS) {
    const raw = isRecordValue(rawControls) ? rawControls[id] : undefined;
    controls[id] = isProtectionState(raw) ? raw : recommended[id];
  }

  const rawGuards = value.guards;
  if (rawGuards !== undefined && !isRecordValue(rawGuards)) {
    return { error: "protectionPolicy.guards must be an object." };
  }
  const guards: Record<ProtectionGuardId, boolean> = {
    sensitive_files: true,
    destructive_commands: true
  };
  if (isRecordValue(rawGuards)) {
    for (const key of Object.keys(rawGuards)) {
      if (key !== "sensitive_files" && key !== "destructive_commands") {
        return { error: `protectionPolicy.guards contains an unknown guard: ${key}.` };
      }
      if (typeof rawGuards[key] !== "boolean") {
        return { error: `protectionPolicy.guards.${key} must be a boolean.` };
      }
      guards[key as ProtectionGuardId] = rawGuards[key] as boolean;
    }
  }

  const rawSpending = value.spending;
  if (rawSpending !== undefined && !isRecordValue(rawSpending)) {
    return { error: "protectionPolicy.spending must be an object." };
  }
  let spending: SpendingLimits = { ...DEFAULT_SPENDING_LIMITS };
  if (isRecordValue(rawSpending)) {
    const unknown = Object.keys(rawSpending).find(
      (key) => !["enabled", "approveOver", "blockOver"].includes(key)
    );
    if (unknown) {
      return { error: `protectionPolicy.spending contains an unknown field: ${unknown}.` };
    }
    if (rawSpending.enabled !== undefined && typeof rawSpending.enabled !== "boolean") {
      return { error: "protectionPolicy.spending.enabled must be a boolean." };
    }
    const approveOver = parseAmount(rawSpending.approveOver, "protectionPolicy.spending.approveOver");
    if (approveOver.error) return { error: approveOver.error };
    const blockOver = parseAmount(rawSpending.blockOver, "protectionPolicy.spending.blockOver");
    if (blockOver.error) return { error: blockOver.error };
    spending = {
      enabled: rawSpending.enabled === undefined ? true : (rawSpending.enabled as boolean),
      approveOver: approveOver.value ?? DEFAULT_SPENDING_LIMITS.approveOver,
      blockOver: blockOver.value ?? DEFAULT_SPENDING_LIMITS.blockOver
    };
    if (spending.blockOver < spending.approveOver) {
      return {
        error: "protectionPolicy.spending.blockOver must be greater than or equal to approveOver."
      };
    }
  }

  const unknownField = Object.keys(value).find(
    (key) => !["version", "preset", "controls", "guards", "spending"].includes(key)
  );
  if (unknownField) {
    return { error: `protectionPolicy contains an unknown field: ${unknownField}.` };
  }

  return {
    policy: {
      version: PROTECTION_POLICY_VERSION,
      preset: preset as ProtectionPreset,
      controls,
      guards,
      spending
    },
    error: null
  };
}

/** True when every control matches the preset exactly (used to keep the label honest). */
export function matchesPreset(policy: ProtectionPolicy, preset: ProtectionPreset): boolean {
  if (preset === "custom") return false;
  const base = presetPolicy(preset);
  if (policy.guards.sensitive_files !== base.guards.sensitive_files) return false;
  if (policy.guards.destructive_commands !== base.guards.destructive_commands) return false;
  if (policy.spending.enabled !== base.spending.enabled) return false;
  if (policy.spending.enabled) {
    if (policy.spending.approveOver !== base.spending.approveOver) return false;
    if (policy.spending.blockOver !== base.spending.blockOver) return false;
  }
  return PROTECTION_CONTROLS.every((id) => policy.controls[id] === base.controls[id]);
}

/** Re-label a policy as "custom" as soon as it stops matching the preset it claims. */
export function reconcilePreset(policy: ProtectionPolicy): ProtectionPolicy {
  if (policy.preset !== "custom" && matchesPreset(policy, policy.preset)) return policy;
  const match = (["recommended", "strict", "minimal"] as const).find((preset) =>
    matchesPreset(policy, preset)
  );
  return { ...policy, preset: match ?? "custom" };
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy bridge — keep the pre-existing controlAreas consumers working
// ────────────────────────────────────────────────────────────────────────────

/**
 * `account.onboarding.controlAreas` predates this module and still drives the
 * dashboard "Policy coverage" panel and the legacy CLI session-policy fallback.
 * Derive it rather than asking the customer the same question twice.
 */
export function deriveControlAreas(policy: ProtectionPolicy): string[] {
  const areas: string[] = [];
  const guarded = (id: ProtectionControlId) => policy.controls[id] !== "allow";

  if (guarded("deploy_production") || guarded("deploy_other_environments")) {
    areas.push("production_deploys");
  }
  if (guarded("edit_files") || guarded("run_commands")) areas.push("github_writes");
  if (guarded("change_production_data")) areas.push("db_migrations");
  if (guarded("change_credentials") || policy.guards.sensitive_files) areas.push("secrets");
  if (guarded("spend_money") || guarded("change_billing") || policy.spending.enabled) {
    areas.push("billing_vendor_apis");
  }
  if (guarded("send_external_messages") || guarded("browse_web")) areas.push("external_comms");

  return areas;
}
