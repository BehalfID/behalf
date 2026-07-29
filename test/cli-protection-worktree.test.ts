import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-worktree-"));
}

function git(cwd: string, args: string) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init");
  git(dir, "config user.email test@example.com");
  git(dir, "config user.name test");
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, "add README.md");
  git(dir, "commit -m init");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("git worktree repository activation", () => {
  it("detects worktree root via git toplevel and applies path-keyed activation", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);
    const prot = await import("../packages/cli/src/lib/protection/index.js");

    const mainRepo = join(home, "main-repo");
    initRepo(mainRepo);
    const worktree = join(home, "linked-worktree");
    try {
      git(mainRepo, `worktree add -b feature-wt "${worktree}"`);
    } catch (err) {
      // Older git or sandbox restrictions
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("skip worktree add:", msg);
      return;
    }

    expect(existsSync(join(worktree, ".git"))).toBe(true); // file, not directory
    const wtRoot = prot.resolveRepositoryRoot(worktree);
    expect(wtRoot).toBe(prot.canonicalizePath(worktree));

    // Activation is keyed by canonical worktree path (not common git dir) for this release.
    prot.upsertRepositoryDecision(prot.canonicalizePath(worktree), true, "user");

    const nested = join(worktree, "src", "deep");
    mkdirSync(nested, { recursive: true });
    const fromNested = prot.resolveActivation({ cwd: nested, interactive: true });
    expect(fromNested.mode).toBe("repository");
    expect(fromNested.repositoryRoot).toBe(prot.canonicalizePath(worktree));

    // Main repo path does not inherit the worktree decision (different canonical root).
    const fromMain = prot.resolveActivation({ cwd: mainRepo, interactive: true });
    expect(fromMain.shouldPrompt).toBe(true);

    // Nested git repo inside protected worktree can override.
    const nestedRepo = join(worktree, "vendor", "lib");
    initRepo(nestedRepo);
    prot.upsertRepositoryDecision(prot.canonicalizePath(nestedRepo), false, "user");
    const nestedRes = prot.resolveActivation({
      cwd: join(nestedRepo, "src"),
      interactive: true,
    });
    mkdirSync(join(nestedRepo, "src"), { recursive: true });
    const nestedRes2 = prot.resolveActivation({
      cwd: join(nestedRepo, "src"),
      interactive: true,
    });
    expect(nestedRes2.mode).toBe("disabled");
    expect(nestedRes2.repositoryRoot).toBe(prot.canonicalizePath(nestedRepo));

    // Deleted worktree path: decision remains in store but cwd elsewhere prompts.
    rmSync(worktree, { recursive: true, force: true });
    const afterDelete = prot.resolveActivation({
      cwd: join(home, "elsewhere"),
      interactive: true,
    });
    mkdirSync(join(home, "elsewhere"), { recursive: true });
    const afterDelete2 = prot.resolveActivation({
      cwd: join(home, "elsewhere"),
      interactive: true,
    });
    expect(afterDelete2.shouldPrompt).toBe(true);

    void nestedRes;
    void fromMain;
    void afterDelete;
  });

  it("standard repo: nested path inherits canonical root", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);
    const prot = await import("../packages/cli/src/lib/protection/index.js");
    const repo = join(home, "std");
    initRepo(repo);
    const nested = join(repo, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    prot.upsertRepositoryDecision(prot.canonicalizePath(repo), true, "user");
    const res = prot.resolveActivation({ cwd: nested, interactive: true });
    expect(res.mode).toBe("repository");
    expect(res.repositoryRoot).toBe(prot.canonicalizePath(repo));
  });
});
