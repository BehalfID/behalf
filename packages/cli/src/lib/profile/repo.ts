import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type RepoContext = {
  cwd: string;
  repoRoot: string | null;
  branch: string | null;
  gitRemote: string | null;
  /** Hash of the local repo root path (legacy/local diagnostics). */
  repoHash: string | null;
  /** Stable hash for dashboard protected repo matching and server policy requests. */
  policyRepoHash: string | null;
};

function runGit(args: string[], cwd: string): string | null {
  try {
    const out = execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

export function hashRepoValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function computePolicyRepoHash(input: {
  gitRemote?: string | null;
  repoRoot?: string | null;
}): string | null {
  return hashRepoValue(input.gitRemote) ?? hashRepoValue(input.repoRoot);
}

export function detectRepoContext(cwd = process.cwd()): RepoContext {
  const repoRoot = runGit(["rev-parse", "--show-toplevel"], cwd);
  const branch = repoRoot ? runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot) : null;
  const gitRemote = repoRoot
    ? runGit(["config", "--get", "remote.origin.url"], repoRoot)
    : null;

  return {
    cwd,
    repoRoot,
    branch,
    gitRemote,
    repoHash: hashRepoValue(repoRoot),
    policyRepoHash: computePolicyRepoHash({ gitRemote, repoRoot }),
  };
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}
