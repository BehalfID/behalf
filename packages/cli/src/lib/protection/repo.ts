import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectRepoContext } from "../profile/repo.js";
import { canonicalizePath } from "./paths.js";

/**
 * Walk ancestors looking for a project-local `.behalf/context.md` marker
 * (written by mcp-setup) or a `.behalfid` marker directory.
 */
export function findBehalfMarkerRoot(start: string): string | null {
  let current = canonicalizePath(start);
  const seen = new Set<string>();

  while (true) {
    const key =
      process.platform === "win32" ? current.toLowerCase() : current;
    if (seen.has(key)) break;
    seen.add(key);

    const contextFile = join(current, ".behalf", "context.md");
    if (existsSync(contextFile)) return current;

    if (existsSync(join(current, ".behalfid"))) return current;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Resolve the repository root for activation scoping.
 *
 * Order:
 * 1. Explicit path (canonicalized)
 * 2. Ancestor `.behalf/context.md` or `.behalfid` project marker
 * 3. `git rev-parse --show-toplevel` via detectRepoContext (handles worktrees)
 * 4. null when nothing matches (callers that need a root for user-selected
 *    repository mode should fall back to canonical cwd themselves)
 */
export function resolveRepositoryRoot(
  cwd: string,
  explicit?: string
): string | null {
  if (explicit && explicit.trim()) {
    return canonicalizePath(explicit);
  }

  const start = canonicalizePath(cwd);

  const marker = findBehalfMarkerRoot(start);
  if (marker) return marker;

  const ctx = detectRepoContext(start);
  if (ctx.repoRoot) {
    return canonicalizePath(ctx.repoRoot);
  }

  return null;
}
