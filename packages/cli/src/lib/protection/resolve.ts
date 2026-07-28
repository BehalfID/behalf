import { appendProtectionEvent } from "./audit.js";
import { canonicalizePath, isPathInsideOrEqual, pathDepth } from "./paths.js";
import { parseDurationToIso } from "./parseDuration.js";
import { resolveRepositoryRoot } from "./repo.js";
import {
  createActivationSessionId,
  readSessionActivation,
} from "./session.js";
import {
  addTimedDecision,
  enableAlways,
  findActiveTimedDecision,
  readActivationStore,
  touchDecision,
  upsertRepositoryDecision,
} from "./store.js";
import type {
  ActivationAgent,
  ActivationResolution,
  ActivationSource,
  ActivationStore,
  ManagedPolicyMode,
  PromptChoice,
  RepositoryDecision,
} from "./types.js";

export type ResolveActivationInput = {
  cwd?: string;
  agent?: ActivationAgent;
  /** From managed profile session policy, if already resolved */
  managedPolicyMode?: ManagedPolicyMode;
  /** Explicit CLI/launch flags */
  flag?: "enable" | "disable" | "timed" | "repository" | null;
  flagDuration?: string;
  flagRepository?: string;
  /** Existing env */
  env?: NodeJS.ProcessEnv;
  /** default: stdin TTY && !CI */
  interactive?: boolean;
  now?: Date;
};

function isInteractiveDefault(
  interactive: boolean | undefined,
  env: NodeJS.ProcessEnv
): boolean {
  if (interactive !== undefined) return interactive;
  const ci = env.CI;
  const inCi =
    ci !== undefined &&
    ci !== "" &&
    ci !== "0" &&
    ci.toLowerCase() !== "false";
  return Boolean(process.stdin.isTTY) && !inCi;
}

/**
 * Deepest repository decision whose root contains `cwd` (equal or ancestor).
 * Returns null when no containment match exists.
 */
export function findMatchingRepositoryDecision(
  cwd: string,
  store: ActivationStore
): { decision: RepositoryDecision; root: string } | null {
  const child = canonicalizePath(cwd);
  let best: { decision: RepositoryDecision; root: string } | null = null;

  for (const decision of store.repositories) {
    const root = canonicalizePath(decision.root);
    if (!isPathInsideOrEqual(child, root)) continue;
    if (!best || pathDepth(root) > pathDepth(best.root)) {
      best = { decision, root };
    }
  }

  return best;
}

function resolution(
  partial: Omit<ActivationResolution, "shouldPrompt"> & {
    shouldPrompt?: boolean;
  }
): ActivationResolution {
  return {
    shouldPrompt: false,
    ...partial,
  };
}

/**
 * Central activation resolver.
 *
 * Precedence:
 * 1. required managed profile / organization → force enable (flags cannot disable)
 * 2. managed managed-profile → force enable
 * 3. explicit launch flags (enable/disable/timed/repository) — user override of local prefs only
 * 4–5. deepest matching repository decision (nested or ancestor via containment)
 * 6. active timed decision
 * 7. active session env with ENABLED=1 (correlation; cannot disable stronger scopes)
 * 8. alwaysEnabled
 * 9. interactive → shouldPrompt, enabled false
 * 10. noninteractive unresolved → enabled true, mode session, source default
 *     (preserves historical `behalf <tool>` always-on / CI behavior; must not hang)
 */
export function resolveActivation(
  input: ResolveActivationInput = {}
): ActivationResolution {
  const now = input.now ?? new Date();
  const env = input.env ?? process.env;
  const cwd = canonicalizePath(input.cwd ?? process.cwd());
  const interactive = isInteractiveDefault(input.interactive, env);
  const policy = input.managedPolicyMode ?? null;

  // 1. Required / organization enforcement — cannot be disabled by flags or store
  if (policy === "required") {
    return resolution({
      enabled: true,
      mode: "managed-profile",
      reason: "Enforced by required managed profile / organization policy",
      source: "organization",
      shouldPrompt: false,
      repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
    });
  }

  // 2. Managed profile (non-required) — force enable, no prompt
  if (policy === "managed") {
    return resolution({
      enabled: true,
      mode: "managed-profile",
      reason: "Enabled by managed profile policy",
      source: "managed-profile",
      shouldPrompt: false,
      repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
    });
  }

  // 3. Explicit flags — after policy so they cannot bypass required/managed
  if (input.flag) {
    return resolveFromFlag(input, cwd, now);
  }

  const { store } = readActivationStore(now);

  // 4–5. Deepest repository decision matching cwd (explicit nested or ancestor)
  const matched = findMatchingRepositoryDecision(cwd, store);
  if (matched) {
    return resolution({
      enabled: matched.decision.enabled,
      mode: matched.decision.enabled ? "repository" : "disabled",
      reason: matched.decision.enabled
        ? `Repository activation enabled for ${matched.root}`
        : `Repository activation disabled for ${matched.root}`,
      source: matched.decision.source,
      repositoryRoot: matched.root,
      shouldPrompt: false,
    });
  }

  // 6. Active timed decision
  const timed = findActiveTimedDecision(store, now);
  if (timed) {
    touchDecision(timed.id, now);
    return resolution({
      enabled: true,
      mode: "timed",
      reason: `Timed activation until ${timed.expiresAt}`,
      source: timed.source,
      expiresAt: timed.expiresAt,
      shouldPrompt: false,
    });
  }

  // 7. Session env — require BOTH a well-formed session id and enabled flag.
  // Session ids are correlation, not auth. An enabled session may activate when
  // nothing stronger applies. A disabled session (ENABLED=0) must NEVER
  // downgrade always-on / fall through past stronger scopes — ignore disable.
  const session = readSessionActivation(env);
  if (session.sessionId && session.enabled === true) {
    return resolution({
      enabled: true,
      mode: (session.mode as ActivationResolution["mode"]) || "session",
      reason: "Active session activation via environment",
      source: "env",
      sessionId: session.sessionId,
      repositoryRoot: session.repositoryRoot,
      shouldPrompt: false,
    });
  }
  // session.enabled === false (or malformed id): ignore — do not downgrade

  // 8. User-wide always
  if (store.alwaysEnabled) {
    return resolution({
      enabled: true,
      mode: "always",
      reason: "User-wide always-on activation",
      source: "user",
      shouldPrompt: false,
    });
  }

  // 9. Interactive unresolved → prompt (do not hang noninteractive)
  if (interactive) {
    return resolution({
      enabled: false,
      mode: "disabled",
      reason: "No saved activation decision; prompt required",
      source: "default",
      shouldPrompt: true,
      repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
    });
  }

  // 10. Noninteractive unresolved default-on for agent launches.
  // Historical `behalf claude|codex|cursor` behavior was always enabled; scoped
  // activation must not hang CI. Prefer enabled session with source "default".
  return resolution({
    enabled: true,
    mode: "session",
    reason:
      "Noninteractive; no saved activation decision — default-on for agent launches",
    source: "default",
    shouldPrompt: false,
    sessionId: createActivationSessionId(),
    repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
  });
}

function resolveFromFlag(
  input: ResolveActivationInput,
  cwd: string,
  now: Date
): ActivationResolution {
  const source: ActivationSource = "flag";
  const flag = input.flag!;

  if (flag === "disable") {
    return resolution({
      enabled: false,
      mode: "disabled",
      reason: "Disabled by explicit launch flag",
      source,
      shouldPrompt: false,
    });
  }

  if (flag === "enable") {
    const sessionId = createActivationSessionId();
    return resolution({
      enabled: true,
      mode: "session",
      reason: "Enabled by explicit launch flag",
      source,
      shouldPrompt: false,
      sessionId,
      repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
    });
  }

  if (flag === "timed") {
    if (!input.flagDuration) {
      throw new Error('Timed flag requires flagDuration (e.g. "4h").');
    }
    const expiresAt = parseDurationToIso(input.flagDuration, now);
    const decision = addTimedDecision(expiresAt, source);
    return resolution({
      enabled: true,
      mode: "timed",
      reason: `Timed activation until ${expiresAt} (flag)`,
      source,
      expiresAt: decision.expiresAt,
      shouldPrompt: false,
    });
  }

  if (flag === "repository") {
    const root =
      resolveRepositoryRoot(cwd, input.flagRepository) ??
      canonicalizePath(input.flagRepository || cwd);
    upsertRepositoryDecision(root, true, source);
    return resolution({
      enabled: true,
      mode: "repository",
      reason: `Repository activation enabled for ${root} (flag)`,
      source,
      repositoryRoot: root,
      shouldPrompt: false,
    });
  }

  return resolution({
    enabled: false,
    mode: "disabled",
    reason: `Unknown flag "${String(flag)}"`,
    source,
    shouldPrompt: false,
  });
}

export type ApplyPromptChoiceOptions = {
  cwd?: string;
  agent?: ActivationAgent;
  now?: Date;
  source?: ActivationSource;
};

/**
 * Persist an interactive prompt choice (except pure session) and return the
 * resulting resolution. Session mode is env-only and is not written to
 * protection.json.
 */
export function applyPromptChoice(
  choice: PromptChoice,
  opts: ApplyPromptChoiceOptions = {}
): ActivationResolution {
  const now = opts.now ?? new Date();
  const cwd = canonicalizePath(opts.cwd ?? process.cwd());
  const source: ActivationSource = opts.source ?? "user";

  appendProtectionEvent("protection.prompted", {
    mode: choice.mode,
    source,
    agent: opts.agent,
  });

  if (choice.mode === "session") {
    const sessionId = createActivationSessionId();
    appendProtectionEvent("protection.enabled.session", {
      source,
      sessionId,
      agent: opts.agent,
    });
    return resolution({
      enabled: true,
      mode: "session",
      reason: "Enabled for this session (prompt choice)",
      source,
      shouldPrompt: false,
      sessionId,
      repositoryRoot: resolveRepositoryRoot(cwd) ?? undefined,
    });
  }

  if (choice.mode === "timed") {
    const expiresAt = parseDurationToIso(choice.duration, now);
    const decision = addTimedDecision(expiresAt, source, now);
    return resolution({
      enabled: true,
      mode: "timed",
      reason: `Timed activation until ${expiresAt} (prompt choice)`,
      source,
      expiresAt: decision.expiresAt,
      shouldPrompt: false,
    });
  }

  if (choice.mode === "repository") {
    const root =
      resolveRepositoryRoot(cwd, choice.root) ??
      canonicalizePath(choice.root || cwd);
    upsertRepositoryDecision(root, true, source);
    return resolution({
      enabled: true,
      mode: "repository",
      reason: `Repository activation enabled for ${root} (prompt choice)`,
      source,
      repositoryRoot: root,
      shouldPrompt: false,
    });
  }

  if (choice.mode === "always") {
    enableAlways(source);
    return resolution({
      enabled: true,
      mode: "always",
      reason: "Always-on activation (prompt choice)",
      source,
      shouldPrompt: false,
    });
  }

  // disabled — skip for this launch only; do not clear other local decisions
  appendProtectionEvent("protection.skipped", {
    source,
    reason: "User declined activation at prompt",
    agent: opts.agent,
  });
  return resolution({
    enabled: false,
    mode: "disabled",
    reason: "Skipped activation (prompt choice)",
    source,
    shouldPrompt: false,
  });
}
