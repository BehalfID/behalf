import { randomBytes } from "node:crypto";
import type { ActivationResolution } from "./types.js";

export const ENV_SESSION_ID = "BEHALFID_SESSION_ID";
export const ENV_ENABLED = "BEHALFID_ENABLED";
export const ENV_MODE = "BEHALFID_ACTIVATION_MODE";
export const ENV_REPO_ROOT = "BEHALFID_REPOSITORY_ROOT";

/** Create a new activation session id (`actsess_...`). Not persisted. */
export function createActivationSessionId(): string {
  return `actsess_${randomBytes(12).toString("base64url")}`;
}

export type SessionActivation = {
  sessionId?: string;
  enabled?: boolean;
  mode?: string;
  repositoryRoot?: string;
};

/**
 * Read session activation from env. Sessions are env-only (never written to
 * protection.json).
 *
 * Trust model: `BEHALFID_SESSION_ID` is a **correlation** id for a launch
 * process tree, not an authentication secret. Only well-formed ids minted by
 * the launcher (`actsess_…`) are recognized. A spoofed id cannot be relied on
 * as proof of authority.
 */
export function readSessionActivation(
  env: NodeJS.ProcessEnv = process.env
): SessionActivation {
  const rawId = env[ENV_SESSION_ID]?.trim() || undefined;
  const sessionId = isWellFormedSessionId(rawId) ? rawId : undefined;
  const mode = env[ENV_MODE]?.trim() || undefined;
  const repositoryRoot = env[ENV_REPO_ROOT]?.trim() || undefined;
  const rawEnabled = env[ENV_ENABLED]?.trim();
  let enabled: boolean | undefined;
  if (rawEnabled !== undefined && rawEnabled !== "") {
    const lower = rawEnabled.toLowerCase();
    if (rawEnabled === "1" || lower === "true" || lower === "yes") {
      enabled = true;
    } else if (rawEnabled === "0" || lower === "false" || lower === "no") {
      enabled = false;
    }
  }
  return { sessionId, enabled, mode, repositoryRoot };
}

/** Launcher-minted session ids only (`actsess_` + base64url-ish body). */
export function isWellFormedSessionId(value: string | undefined): boolean {
  if (!value) return false;
  if (value.length < 16 || value.length > 128) return false;
  return /^actsess_[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Build child-process env reflecting an activation resolution.
 * For enabled session mode, ensures a session id and BEHALFID_ENABLED=1.
 */
export function buildActivationEnv(
  resolution: ActivationResolution,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };

  const sessionId =
    resolution.sessionId ??
    (resolution.enabled && resolution.mode === "session"
      ? createActivationSessionId()
      : undefined);

  if (sessionId) {
    env[ENV_SESSION_ID] = sessionId;
  } else {
    delete env[ENV_SESSION_ID];
  }

  if (resolution.enabled) {
    env[ENV_ENABLED] = "1";
  } else {
    env[ENV_ENABLED] = "0";
  }

  env[ENV_MODE] = resolution.mode;

  if (resolution.repositoryRoot) {
    env[ENV_REPO_ROOT] = resolution.repositoryRoot;
  } else {
    delete env[ENV_REPO_ROOT];
  }

  return env;
}
