import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

/**
 * Fake TTY stdin/stdout that exercises the real arrow-key `select()` path
 * without a native PTY dependency (Windows-safe).
 */
class FakeTtyStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  readable = true;
  setEncoding(_enc?: BufferEncoding) {
    return this;
  }
  setRawMode(mode: boolean) {
    this.isRaw = mode;
    return this;
  }
  resume() {
    return this;
  }
  pause() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
}

class FakeTtyStdout extends EventEmitter {
  isTTY = true;
  chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(String(chunk));
    return true;
  }
  get text() {
    return this.chunks.join("");
  }
}

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-pty-"));
}

function seedFakeBinary(home: string, tool: string): string {
  const binDir = join(home, "real-bin");
  mkdirSync(binDir, { recursive: true });
  const binName = process.platform === "win32" ? `${tool}.cmd` : tool;
  const binPath = join(binDir, binName);
  const body =
    process.platform === "win32"
      ? `@echo off\r\necho ${tool}\r\nexit /b 0\r\n`
      : `#!/usr/bin/env bash\necho ${tool}\nexit 0\n`;
  writeFileSync(binPath, body, { mode: 0o755 });
  if (process.platform !== "win32") chmodSync(binPath, 0o755);
  const currentPath = process.env.PATH ?? "";
  vi.stubEnv("PATH", `${binDir}${delimiter}${currentPath}`);
  return binPath;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("interactive select() arrow prompt (fake TTY)", () => {
  it("renders ❯ and accepts down-arrow + enter", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);

    const stdin = new FakeTtyStdin();
    const stdout = new FakeTtyStdout();
    vi.stubGlobal("process", {
      ...process,
      stdin,
      stdout,
      exit: (code?: number) => {
        throw new Error(`process.exit(${code})`);
      },
    });

    const { select } = await import("../packages/cli/src/lib/prompt.js");
    const pending = select("Enable BehalfID protection?", [
      { value: "session", label: "For this session" },
      { value: "timed", label: "For a limited time" },
      { value: "repository", label: "For this repository" },
      { value: "always", label: "Always enable" },
      { value: "disabled", label: "Not now" },
    ]);

    // Down twice → "For this repository", then Enter
    queueMicrotask(() => {
      stdin.emit("data", "\x1b[B");
      stdin.emit("data", "\x1b[B");
      stdin.emit("data", "\r");
    });

    await expect(pending).resolves.toBe("repository");
    expect(stdout.text).toContain("Enable BehalfID protection?");
    expect(stdout.text).toContain("❯");
    expect(stdout.text).toContain("For this repository");
  });
});

describe("launchTool interactive paths via fixture binaries", () => {
  async function loadLaunch(home: string) {
    vi.resetModules();
    stubCliHome(home);
    // Force interactive resolution even though vitest stdin is often non-TTY.
    vi.stubEnv("CI", "");
    return {
      run: await import("../packages/cli/src/commands/run.js"),
      config: await import("../packages/cli/src/lib/config.js"),
      activation: await import("../packages/cli/src/lib/activation.js"),
      protection: await import("../packages/cli/src/lib/protection/index.js"),
    };
  }

  for (const tool of ["cursor", "claude", "codex"] as const) {
    it(`${tool}: repository choice → env + nested no-prompt + exit code`, async () => {
      const home = tempHome();
      seedFakeBinary(home, tool);
      const repo = join(home, "project");
      const nested = join(repo, "src", "api");
      mkdirSync(nested, { recursive: true });
      mkdirSync(join(repo, ".behalf"), { recursive: true });
      writeFileSync(join(repo, ".behalf", "context.md"), "# test\n");

      const mods = await loadLaunch(home);
      mods.config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

      const prompt = await import("../packages/cli/src/lib/prompt.js");
      vi.spyOn(prompt, "select")
        .mockResolvedValueOnce("repository")
        .mockResolvedValueOnce("yes");

      const calls: Array<{ cmd: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
      const spawn = vi.fn((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
        calls.push({ cmd, args, env: opts.env });
        return { status: 0 };
      });

      const prev = process.cwd();
      process.chdir(repo);
      try {
        const code = await mods.run.launchTool(
          tool,
          ["--keep", "arg1"],
          {
            spawn: spawn as never,
            stderr: { write: () => true },
            stdout: { write: () => true },
          },
          { egress: "off", interactive: true }
        );

        expect(code).toBe(0);
        expect(calls[0]?.args).toEqual(["--keep", "arg1"]);
        expect(calls[0]?.env?.[mods.protection.ENV_ENABLED]).toBe("1");
        expect(calls[0]?.env?.[mods.protection.ENV_MODE]).toBe("repository");

        const nestedRes = mods.protection.resolveActivation({
          cwd: nested,
          interactive: true,
        });
        expect(nestedRes.shouldPrompt).toBe(false);
        expect(nestedRes.mode).toBe("repository");
        expect(nestedRes.repositoryRoot).toBe(mods.protection.canonicalizePath(repo));
      } finally {
        process.chdir(prev);
      }
    });

    it(`${tool}: not-now then relaunch prompts again`, async () => {
      const home = tempHome();
      seedFakeBinary(home, tool);
      const mods = await loadLaunch(home);
      mods.config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

      const prompt = await import("../packages/cli/src/lib/prompt.js");
      vi.spyOn(prompt, "select").mockResolvedValueOnce("disabled");

      const spawn = vi.fn(() => ({ status: 7 }));
      const code = await mods.run.launchTool(
        tool,
        ["x"],
        {
          spawn: spawn as never,
          stderr: { write: () => true },
          stdout: { write: () => true },
        },
        { egress: "off", interactive: true }
      );
      expect(code).toBe(7);
      expect(spawn).toHaveBeenCalled();

      const again = mods.protection.resolveActivation({
        cwd: home,
        interactive: true,
      });
      expect(again.shouldPrompt).toBe(true);
    });

    it(`${tool}: session choice sets ENABLED + SESSION_ID and does not persist`, async () => {
      const home = tempHome();
      seedFakeBinary(home, tool);
      const mods = await loadLaunch(home);
      mods.config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

      const prompt = await import("../packages/cli/src/lib/prompt.js");
      vi.spyOn(prompt, "select").mockResolvedValueOnce("session");

      let childEnv: NodeJS.ProcessEnv | undefined;
      const spawn = vi.fn((_c: string, _a: string[], opts: { env?: NodeJS.ProcessEnv }) => {
        childEnv = opts.env;
        return { status: 0 };
      });

      await mods.run.launchTool(
        tool,
        [],
        {
          spawn: spawn as never,
          stderr: { write: () => true },
          stdout: { write: () => true },
        },
        { egress: "off", interactive: true }
      );

      expect(childEnv?.[mods.protection.ENV_ENABLED]).toBe("1");
      expect(childEnv?.[mods.protection.ENV_SESSION_ID]).toMatch(/^actsess_/);
      expect(
        mods.protection.isWellFormedSessionId(childEnv?.[mods.protection.ENV_SESSION_ID])
      ).toBe(true);

      const fresh = mods.protection.resolveActivation({
        cwd: home,
        interactive: true,
        env: {},
      });
      expect(fresh.shouldPrompt).toBe(true);
    });

    it(`${tool}: required policy ignores --no-behalf and does not prompt bypass`, async () => {
      const home = tempHome();
      seedFakeBinary(home, tool);
      const mods = await loadLaunch(home);
      mods.config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

      const prompt = await import("../packages/cli/src/lib/prompt.js");
      const selectSpy = vi.spyOn(prompt, "select");

      const resolution = await mods.activation.resolveLaunchActivation({
        cwd: home,
        agent: tool,
        managedPolicyMode: "required",
        flags: { noBehalf: true },
        interactive: true,
        stderr: { write: () => true },
      });
      expect(resolution.enabled).toBe(true);
      expect(resolution.mode).toBe("managed-profile");
      expect(selectSpy).not.toHaveBeenCalled();
    });
  }

  it("timed choice: duration then child env + status expiry", async () => {
    const home = tempHome();
    seedFakeBinary(home, "cursor");
    const mods = await loadLaunch(home);
    mods.config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

    vi.spyOn(await import("../packages/cli/src/lib/prompt.js"), "select")
      .mockResolvedValueOnce("timed")
      .mockResolvedValueOnce("1h");

    let childEnv: NodeJS.ProcessEnv | undefined;
    const spawn = vi.fn((_c: string, _a: string[], opts: { env?: NodeJS.ProcessEnv }) => {
      childEnv = opts.env;
      return { status: 0 };
    });

    await mods.run.launchTool(
      "cursor",
      [],
      {
        spawn: spawn as never,
        stderr: { write: () => true },
        stdout: { write: () => true },
      },
      { egress: "off", interactive: true }
    );

    expect(childEnv?.[mods.protection.ENV_ENABLED]).toBe("1");
    expect(childEnv?.[mods.protection.ENV_MODE]).toBe("timed");

    const status = mods.protection.resolveActivation({
      cwd: home,
      interactive: false,
    });
    expect(status.mode).toBe("timed");
    expect(status.expiresAt).toBeTruthy();
    expect(Date.parse(status.expiresAt!)).toBeGreaterThan(Date.now());
  });
});

describe("symlink containment security", () => {
  it("does not inherit protection when symlink target is outside the root", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);
    const {
      canonicalizePath,
      isPathInsideOrEqual,
      upsertRepositoryDecision,
      resolveActivation,
    } = await import("../packages/cli/src/lib/protection/index.js");

    const project = join(home, "project");
    const outside = join(home, "outside");
    mkdirSync(join(project, "src"), { recursive: true });
    mkdirSync(outside, { recursive: true });

    const linkInside = join(project, "escape-link");
    try {
      symlinkSync(outside, linkInside, process.platform === "win32" ? "junction" : "dir");
    } catch (err) {
      // Windows may require elevated privileges for symlinks.
      const msg = err instanceof Error ? err.message : String(err);
      if (/EPERM|privilege|not permitted/i.test(msg)) {
        // Skip with reason — platform cannot create symlink/junction here.
        return;
      }
      throw err;
    }

    upsertRepositoryDecision(canonicalizePath(project), true, "user");

    // Textual path looks nested, but canonical target is outside.
    const viaLink = join(linkInside, "nested");
    mkdirSync(viaLink, { recursive: true });

    expect(isPathInsideOrEqual(viaLink, project)).toBe(false);
    const res = resolveActivation({ cwd: viaLink, interactive: true });
    expect(res.mode).not.toBe("repository");
    expect(res.shouldPrompt).toBe(true);
  });

  it("inherits when accessing the repo through a symlink to the root", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);
    const {
      canonicalizePath,
      isPathInsideOrEqual,
      upsertRepositoryDecision,
      resolveActivation,
    } = await import("../packages/cli/src/lib/protection/index.js");

    const project = join(home, "project");
    const alias = join(home, "alias-project");
    mkdirSync(join(project, "src", "api"), { recursive: true });
    try {
      symlinkSync(project, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/EPERM|privilege|not permitted/i.test(msg)) {
        return;
      }
      throw err;
    }

    upsertRepositoryDecision(canonicalizePath(project), true, "user");
    const viaAlias = join(alias, "src", "api");
    expect(isPathInsideOrEqual(viaAlias, project)).toBe(true);
    expect(resolveActivation({ cwd: viaAlias, interactive: true }).mode).toBe("repository");
  });

  it("broken symlink does not match as inside", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);
    const { isPathInsideOrEqual, canonicalizePath } = await import(
      "../packages/cli/src/lib/protection/index.js"
    );
    const project = join(home, "project");
    mkdirSync(project, { recursive: true });
    const broken = join(home, "broken-link");
    try {
      symlinkSync(join(home, "does-not-exist-target"), broken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/EPERM|privilege|not permitted/i.test(msg)) {
        return;
      }
      throw err;
    }
    // canonicalize falls back when realpath fails; still must not claim inside project
    expect(isPathInsideOrEqual(broken, canonicalizePath(project))).toBe(false);
  });
});
