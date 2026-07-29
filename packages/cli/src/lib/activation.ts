import { homedir } from "node:os";
import { select } from "./prompt.js";
import {
  appendProtectionEvent,
  applyPromptChoice,
  buildActivationEnv,
  resolveActivation,
  resolveRepositoryRoot,
  type ActivationAgent,
  type ActivationResolution,
  type ManagedPolicyMode,
  type PromptChoice,
  type ResolveActivationInput,
} from "./protection/index.js";

/** CLI / argv flags that control scoped activation for a single launch. */
export type ActivationFlagOpts = {
  behalf?: boolean;
  noBehalf?: boolean;
  behalfFor?: string;
  /** `true` or empty → detected repo; string → explicit path */
  behalfRepository?: boolean | string;
};

export type ParsedActivationFlags = {
  flag: ResolveActivationInput["flag"];
  flagDuration?: string;
  flagRepository?: string;
};

const ACTIVATION_FLAG_NAMES = new Set([
  "--behalf",
  "--no-behalf",
  "--behalf-for",
  "--behalf-repository",
]);

/**
 * Parse activation flags from a passthrough argv array and return remaining args.
 * Handles both `--flag=value` and `--flag value` forms.
 */
export function stripActivationFlags(args: string[]): {
  remaining: string[];
  flags: ActivationFlagOpts;
} {
  const remaining: string[] = [];
  const flags: ActivationFlagOpts = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--behalf") {
      flags.behalf = true;
      continue;
    }
    if (arg === "--no-behalf") {
      flags.noBehalf = true;
      continue;
    }
    if (arg === "--behalf-for" || arg.startsWith("--behalf-for=")) {
      const value =
        arg === "--behalf-for" ? args[++i] : arg.slice("--behalf-for=".length);
      if (value) flags.behalfFor = value;
      continue;
    }
    if (arg === "--behalf-repository" || arg.startsWith("--behalf-repository=")) {
      if (arg.startsWith("--behalf-repository=")) {
        flags.behalfRepository = arg.slice("--behalf-repository=".length) || true;
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          flags.behalfRepository = next;
          i++;
        } else {
          flags.behalfRepository = true;
        }
      }
      continue;
    }

    // Unknown to us — keep (including other --flags)
    if (ACTIVATION_FLAG_NAMES.has(arg)) continue;
    remaining.push(arg);
  }

  return { remaining, flags };
}

/** Map commander / argv flag opts into resolver flag fields. */
export function toResolverFlags(opts: ActivationFlagOpts): ParsedActivationFlags {
  if (opts.noBehalf) {
    return { flag: "disable" };
  }
  if (opts.behalfFor) {
    return { flag: "timed", flagDuration: opts.behalfFor };
  }
  if (opts.behalfRepository !== undefined && opts.behalfRepository !== false) {
    return {
      flag: "repository",
      flagRepository:
        typeof opts.behalfRepository === "string" && opts.behalfRepository.length > 0
          ? opts.behalfRepository
          : undefined,
    };
  }
  if (opts.behalf) {
    return { flag: "enable" };
  }
  return { flag: null };
}

export function displayHomePath(path: string): string {
  const home = homedir();
  const normalizedHome = home.replace(/[/\\]+$/, "");
  const startsWithHome =
    path === normalizedHome ||
    path.startsWith(normalizedHome + "/") ||
    path.startsWith(normalizedHome + "\\");
  if (startsWithHome) {
    return "~" + path.slice(normalizedHome.length).replace(/\\/g, "/");
  }
  return path.replace(/\\/g, "/");
}

const PRIMARY_CHOICES = [
  { value: "session" as const, label: "For this session" },
  { value: "timed" as const, label: "For a limited time" },
  { value: "repository" as const, label: "For this repository" },
  { value: "always" as const, label: "Always enable" },
  { value: "disabled" as const, label: "Not now" },
];

const TIMED_CHOICES = [
  { value: "1h" as const, label: "1 hour" },
  { value: "4h" as const, label: "4 hours" },
  { value: "8h" as const, label: "8 hours" },
  { value: "24h" as const, label: "24 hours" },
  { value: "custom" as const, label: "Custom" },
];

/**
 * Interactive activation prompt. Does not offer a bypass when org policy requires protection.
 */
export async function promptActivationChoice(opts: {
  cwd: string;
  agent?: ActivationAgent;
  repositoryRoot?: string | null;
}): Promise<PromptChoice> {
  const primary = await select(
    "Enable BehalfID protection?",
    PRIMARY_CHOICES,
    {
      body:
        "BehalfID verifies AI-agent actions against your permissions and can require approval before sensitive actions execute.",
    }
  );

  if (primary === "session") return { mode: "session" };
  if (primary === "always") return { mode: "always" };
  if (primary === "disabled") return { mode: "disabled" };

  if (primary === "timed") {
    const timed = await select("Enable protection for how long?", TIMED_CHOICES);
    if (timed === "custom") {
      const { ask } = await import("./prompt.js");
      const custom = await ask("Enter duration (e.g. 2h, 90m)");
      return { mode: "timed", duration: custom.trim() };
    }
    return { mode: "timed", duration: timed };
  }

  // repository
  const root =
    opts.repositoryRoot ??
    resolveRepositoryRoot(opts.cwd) ??
    opts.cwd;
  const display = displayHomePath(root);
  const confirmRepo = await select(
    "Enable BehalfID protection for this repository?",
    [
      { value: "yes" as const, label: "Enable for this repository" },
      { value: "back" as const, label: "Cancel" },
    ],
    {
      body: `${display}\n\nThis applies to the repository root and all subdirectories.`,
    }
  );
  if (confirmRepo === "back") {
    return promptActivationChoice(opts);
  }
  return { mode: "repository", root };
}

export type ResolveLaunchActivationInput = {
  cwd?: string;
  agent?: ActivationAgent;
  managedPolicyMode?: ManagedPolicyMode;
  flags?: ActivationFlagOpts;
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

/**
 * Full launch-time activation: resolve → optional interactive prompt → persist → re-resolve.
 * Required managed-profile / org policy cannot be bypassed.
 */
export async function resolveLaunchActivation(
  input: ResolveLaunchActivationInput = {}
): Promise<ActivationResolution> {
  const cwd = input.cwd ?? process.cwd();
  const stderr = input.stderr ?? process.stderr;
  const parsed = toResolverFlags(input.flags ?? {});

  const resolution = resolveActivation({
    cwd,
    agent: input.agent,
    managedPolicyMode: input.managedPolicyMode ?? null,
    flag: parsed.flag,
    flagDuration: parsed.flagDuration,
    flagRepository: parsed.flagRepository,
    env: input.env ?? process.env,
    interactive: input.interactive,
  });

  if (
    input.managedPolicyMode === "required" ||
    (resolution.source === "organization" && resolution.enabled)
  ) {
    stderr.write(
      "BehalfID protection is required by your organization for this workspace.\n"
    );
  }

  if (resolution.shouldPrompt) {
    const choice = await promptActivationChoice({
      cwd,
      agent: input.agent,
      repositoryRoot: resolution.repositoryRoot,
    });
    // applyPromptChoice records protection.prompted / enabled.* / skipped
    return applyPromptChoice(choice, {
      cwd,
      agent: input.agent,
    });
  }

  appendProtectionEvent(
    resolution.enabled
      ? resolution.mode === "timed"
        ? "protection.enabled.timed"
        : resolution.mode === "repository"
          ? "protection.enabled.repository"
          : resolution.mode === "always"
            ? "protection.enabled.always"
            : "protection.enabled.session"
      : "protection.skipped",
    {
      mode: resolution.mode,
      source: String(resolution.source),
      reason: resolution.reason,
      repositoryRoot: resolution.repositoryRoot,
      expiresAt: resolution.expiresAt,
      sessionId: resolution.sessionId,
      agent: input.agent,
    }
  );

  return resolution;
}

/** Merge activation env into a child process env when protection is enabled. */
export function mergeActivationEnv(
  resolution: ActivationResolution,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return buildActivationEnv(resolution, baseEnv);
}

export function agentFromToolKey(toolKey: string): ActivationAgent {
  if (toolKey === "claude" || toolKey === "codex" || toolKey === "cursor") {
    return toolKey;
  }
  return "other";
}
