import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  hookCommand,
  type HookCommandRunners,
} from "../packages/cli/src/commands/hook";

const ROOT = process.cwd();
const DIST_INDEX = join(ROOT, "packages", "cli", "dist", "index.js");

beforeAll(() => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required to build the CLI regression fixture.");
  const build = spawnSync(process.execPath, [npmCli, "run", "build:cli"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  expect(build.status, build.error?.message ?? build.stderr + build.stdout).toBe(0);
}, 120_000);

function runBuiltCli(args: string[], home: string) {
  return spawnSync(process.execPath, [DIST_INDEX, "--no-banner", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
    windowsHide: true,
  });
}

function writeTestCredentials(home: string) {
  const configDir = join(home, ".behalf");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), JSON.stringify({
    agentId: "agent_test123",
    apiKey: "bhf_sk_testsecret12345",
  }));
}

describe("Antigravity built CLI and hook process behavior", () => {
  it("assigns exitCode without forcing process.exit for every hook subcommand", async () => {
    const originalExitCode = process.exitCode;
    const exitSpy = vi.spyOn(process, "exit");
    const cases = [
      { args: ["pre-tool-use"], called: "pre-tool-use", code: 2 },
      { args: ["cursor"], called: "cursor", code: 0 },
      { args: ["antigravity"], called: "antigravity", code: 2 },
      { args: ["capture-schema", "--out", "capture.jsonl"], called: "capture:capture.jsonl", code: 0 },
    ];

    try {
      for (const testCase of cases) {
        const calls: string[] = [];
        const runners: HookCommandRunners = {
          preToolUse: async () => { calls.push("pre-tool-use"); return testCase.code; },
          cursor: async () => { calls.push("cursor"); return testCase.code; },
          antigravity: async () => { calls.push("antigravity"); return testCase.code; },
          captureSchema: async (outFile) => { calls.push(`capture:${outFile}`); return testCase.code; },
        };

        process.exitCode = undefined;
        await hookCommand(runners).parseAsync(["node", "hook", ...testCase.args]);

        expect(calls).toEqual([testCase.called]);
        expect(process.exitCode).toBe(testCase.code);
      }
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      process.exitCode = originalExitCode;
      exitSpy.mockRestore();
    }
  });

  it("rejects --enforce before writing Antigravity configuration", () => {
    const home = mkdtempSync(join(tmpdir(), "behalf-antigravity-enforce-"));
    const result = runBuiltCli(["antigravity", "install", "--enforce"], home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--enforce is unsupported");
    expect(result.stderr).toContain("host ignored a valid deny response and clean exit code 2");
    expect(result.stderr).toContain("Denied actions may still execute");
    expect(existsSync(join(home, ".gemini"))).toBe(false);
    expect(existsSync(join(home, ".gemini", "config", "hooks.json"))).toBe(false);

    const help = runBuiltCli(["antigravity", "install", "--help"], home);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("unsupported: agy 1.1.2 ignored a valid live deny");
  });

  it("install and status output identify verification/audit-only behavior", () => {
    const home = mkdtempSync(join(tmpdir(), "behalf-antigravity-status-"));
    writeTestCredentials(home);

    const install = runBuiltCli(["antigravity", "install", "--skip-mcp"], home);
    expect(install.status, install.stderr).toBe(0);
    expect(install.stdout).toContain("Verification and audit logging are active");
    expect(install.stdout).toContain("Enforcement is unsupported on tested Antigravity CLI 1.1.2");
    expect(install.stdout).toContain("Denied actions may still execute");
    expect(install.stdout).toContain("Do not rely on this integration as an execution boundary");

    const jsonInstall = runBuiltCli(["--json", "antigravity", "install", "--skip-mcp"], home);
    expect(jsonInstall.status, jsonInstall.stderr).toBe(0);
    expect(JSON.parse(jsonInstall.stdout)).toMatchObject({
      integration: "verification_and_audit",
      hookMode: "advisory",
      enforcementSupported: false,
      liveEnforcementValidation: "failed",
      testedCliVersion: "1.1.2",
    });

    const status = runBuiltCli(["antigravity", "status"], home);
    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout).toContain("PreToolUse verification hook");
    expect(status.stdout).toContain("Advisory MCP server entries");
    expect(status.stdout).toContain("enforcement");
    expect(status.stdout).toContain("unsupported (tested agy 1.1.2)");
    expect(status.stdout).toContain("Verification and audit logging are active");
    expect(status.stdout).toContain("Denied actions may still execute");
    expect(install.stdout + jsonInstall.stdout + status.stdout + install.stderr + jsonInstall.stderr + status.stderr)
      .not.toContain("bhf_sk_testsecret12345");

    const jsonStatus = runBuiltCli(["--json", "antigravity", "status"], home);
    expect(jsonStatus.status, jsonStatus.stderr).toBe(0);
    expect(JSON.parse(jsonStatus.stdout)).toMatchObject({
      integration: "verification_and_audit",
      hookMode: "advisory",
      enforcementSupported: false,
      liveEnforcementValidation: "failed",
      testedCliVersion: "1.1.2",
      configured: true,
    });
  });

  it("built Antigravity deny hook exits normally with code 2 after verification", async () => {
    let requestBody = "";
    const server = createServer((request, response) => {
      request.setEncoding("utf8");
      request.on("data", (chunk) => { requestBody += chunk; });
      request.on("end", () => {
        response.writeHead(200, {
          "Content-Type": "application/json",
          Connection: "close",
        });
        response.end(JSON.stringify({ allowed: false, reason: "command_blocked" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const home = mkdtempSync(join(tmpdir(), "behalf-hook-process-"));
      const configDir = join(home, ".behalf");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({
          agentId: "agent_test123",
          apiKey: "bhf_sk_testsecret12345",
          baseUrl,
          antigravityEnforcement: "required",
        })
      );

      const child = spawn(
        process.execPath,
        [DIST_INDEX, "--no-banner", "hook", "antigravity"],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            BEHALFID_BASE_URL: baseUrl,
            BEHALFID_API_KEY: "bhf_sk_testsecret12345",
          },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        }
      );

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });

      const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Built Antigravity hook did not exit within 30 seconds."));
        }, 30_000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal });
        });
        child.stdin.end(JSON.stringify({
          tool_name: "run_shell_command",
          tool_input: { command: "echo behalfid-canary" },
          cwd: ROOT,
        }));
      });

      const stdoutLines = stdout.trim().split(/\r?\n/).filter(Boolean);
      expect(stdoutLines).toHaveLength(1);
      expect(JSON.parse(stdoutLines[0])).toEqual({
        decision: "deny",
        reason: "blocked — command_blocked",
      });
      expect(stderr).toContain("BehalfID: blocked — command_blocked");
      expect(requestBody).toContain('"action":"execute_command"');
      expect(result).toEqual({ code: 2, signal: null });
      expect(stdout + stderr).not.toMatch(/UV_HANDLE_CLOSING|Assertion failed|src\\win\\async\.c/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 120_000);
});
