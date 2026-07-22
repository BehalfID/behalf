/**
 * Context dimensions for Stage 5 Adaptive Delegation / permission constraints.
 * Drawn from VerificationLog.metadata (policyContext is never persisted).
 */

export type AuthorizationContext = {
  repository: string | null;
  branch: string | null;
  environment: string | null;
  workspace: string | null;
};

const REPO_KEYS = ["repository", "repo", "repoName", "repositoryName", "repo_full_name"] as const;
const BRANCH_KEYS = ["branch", "gitBranch", "ref", "git_ref", "head_branch"] as const;
const ENV_KEYS = ["environment", "env", "stage", "deployment", "targetEnvironment"] as const;
const WORKSPACE_KEYS = ["workspace", "workspaceId", "workspaceSlug", "workspace_id"] as const;

const PROTECTED_BRANCHES = new Set(["main", "master", "production", "prod", "release"]);
const PROTECTED_ENVIRONMENTS = new Set(["production", "prod", "live"]);

function readMetaString(metadata: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!metadata || typeof metadata !== "object") return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 200);
    }
  }
  return null;
}

export function extractAuthorizationContext(
  metadata?: Record<string, unknown> | null
): AuthorizationContext {
  return {
    repository: readMetaString(metadata, REPO_KEYS),
    branch: readMetaString(metadata, BRANCH_KEYS),
    environment: readMetaString(metadata, ENV_KEYS),
    workspace: readMetaString(metadata, WORKSPACE_KEYS)
  };
}

export function normalizeContextValue(value: string): string {
  return value.trim().toLowerCase();
}

export function isProtectedBranch(branch: string | null | undefined): boolean {
  if (!branch) return false;
  const normalized = normalizeContextValue(branch);
  if (PROTECTED_BRANCHES.has(normalized)) return true;
  return /^(release|hotfix)([/_-]|$)/.test(normalized);
}

export function isProtectedEnvironment(environment: string | null | undefined): boolean {
  if (!environment) return false;
  return PROTECTED_ENVIRONMENTS.has(normalizeContextValue(environment));
}

/** Classify a branch into a stable bucket for aggregation. */
export function branchBucket(branch: string | null): string | null {
  if (!branch) return null;
  const normalized = normalizeContextValue(branch);
  if (isProtectedBranch(normalized)) return normalized;
  if (normalized.startsWith("feature/") || normalized.startsWith("feat/")) return "feature/*";
  if (normalized.startsWith("bugfix/") || normalized.startsWith("fix/")) return "fix/*";
  if (normalized === "develop" || normalized === "development") return "develop";
  if (normalized === "staging" || normalized === "stage") return "staging";
  return branch.trim().slice(0, 120);
}

export function environmentBucket(environment: string | null): string | null {
  if (!environment) return null;
  const normalized = normalizeContextValue(environment);
  if (isProtectedEnvironment(normalized)) return normalized;
  if (["staging", "stage", "preview", "dev", "development", "test", "sandbox"].includes(normalized)) {
    return normalized;
  }
  return environment.trim().slice(0, 80);
}

/**
 * Glob-style match for context constraints (* and **), shared with verify().
 */
export function contextGlobMatch(pattern: string, value: string): boolean {
  let reStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      i += 2;
      if (i < pattern.length && pattern[i] === "/") {
        reStr += "(?:.*\\/)?";
        i++;
      } else {
        reStr += ".*";
      }
    } else if (ch === "*") {
      reStr += "[^/]*";
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      reStr += "\\" + ch;
      i++;
    } else {
      reStr += ch;
      i++;
    }
  }
  return new RegExp("^" + reStr + "$", "i").test(value);
}

export function listContextMatches(patterns: string[] | undefined, value: string | undefined): boolean {
  if (!value) return false;
  return (patterns ?? []).some((pattern) => {
    const trimmed = pattern.trim();
    if (!trimmed) return false;
    if (trimmed.includes("*")) return contextGlobMatch(trimmed, value);
    return normalizeContextValue(trimmed) === normalizeContextValue(value);
  });
}
