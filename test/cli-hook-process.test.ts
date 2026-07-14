import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

type VerifyDecision = {
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  requestId: string;
};

type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

type HookSubcommand = "pre-tool-use" | "cursor";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(repoRoot, "packages", "cli", "dist", "index.js");

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("loopback test server did not expose a TCP port"));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

function runBuiltHook(
  baseUrl: string,
  payload: Record<string, unknown>,
  subcommand: HookSubcommand = "pre-tool-use"
): Promise<ChildResult> {
  const home = mkdtempSync(join(tmpdir(), "behalf-built-hook-home-"));
  return new Promise((resolveChild, reject) => {
    const child = spawn(process.execPath, [cliEntry, "hook", subcommand], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        BEHALFID_AGENT_ID: "agent_child_process_test",
        BEHALFID_API_KEY: "test-agent-key",
        BEHALFID_BASE_URL: baseUrl,
        BEHALFID_DEBUG: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolveChild({ code, signal, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

const WINDOWS_LIBUV_ASSERTION = /Assertion failed|UV_HANDLE_CLOSING|src[\\/]win[\\/]async\.c/i;

function expectCleanExit(result: ChildResult, expectedCode: number): void {
  expect(result.code).toBe(expectedCode);
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toMatch(WINDOWS_LIBUV_ASSERTION);
  expect(result.stderr).not.toMatch(WINDOWS_LIBUV_ASSERTION);
}

describe("built CLI Claude PreToolUse process", () => {
  let server: Server;
  let baseUrl: string;
  const decisions: VerifyDecision[] = [];
  const requests: Array<Record<string, unknown>> = [];
  const completedResponseIds: string[] = [];

  beforeAll(async () => {
    const npmExecPath = process.env.npm_execpath;
    if (!npmExecPath) throw new Error("npm_execpath is required to build the CLI regression fixture");
    const build = spawnSync(process.execPath, [npmExecPath, "--prefix", "packages/cli", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (build.status !== 0) {
      throw new Error(
        `CLI build failed: ${build.error?.message ?? "non-zero exit"}\n${build.stdout ?? ""}\n${build.stderr ?? ""}`
      );
    }

    server = createServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { raw += chunk; });
      request.on("end", () => {
        requests.push(JSON.parse(raw) as Record<string, unknown>);
        const decision = decisions.shift();
        const responseBody = JSON.stringify(decision ?? { error: "missing test decision" });
        const splitAt = Math.max(1, Math.floor(responseBody.length / 2));
        response.writeHead(decision ? 200 : 500, { "Content-Type": "application/json" });
        // Keep the first chunk invalid as standalone JSON. The hook can act on
        // the decision only after fetch has completed the full body read.
        response.write(responseBody.slice(0, splitAt));
        response.end(responseBody.slice(splitAt), () => {
          completedResponseIds.push(decision?.requestId ?? "missing-test-decision");
        });
      });
    });
    baseUrl = `http://127.0.0.1:${await listen(server)}`;
  });

  afterAll(async () => {
    if (server) await close(server);
  });

  beforeEach(() => {
    decisions.length = 0;
    requests.length = 0;
    completedResponseIds.length = 0;
  });

  it("exits normally after a completed allowed Claude verification response", async () => {
    decisions.push({ allowed: true, reason: "allowed", requestId: "req_child_allow" });

    const result = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo behalfid-child-allowed" },
    });

    expectCleanExit(result, 0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.stderr).not.toContain("blocked");
    expect(completedResponseIds).toEqual(["req_child_allow"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      agentId: "agent_child_process_test",
      action: "execute_command",
      vendor: "shell",
      policyContext: { toolInput: { command: "echo behalfid-child-allowed" } },
    });
  });

  it("exits 2 without a Windows crash after a completed denied Claude response", async () => {
    decisions.push({ allowed: false, reason: "command_blocked", requestId: "req_child_deny" });

    const result = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo behalfid-child-denied" },
    });

    expectCleanExit(result, 2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("BehalfID: blocked by policy.\n");
    expect(completedResponseIds).toEqual(["req_child_deny"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      action: "execute_command",
      vendor: "shell",
      policyContext: { toolInput: { command: "echo behalfid-child-denied" } },
    });
  });

  it("exits 2 without a Windows crash after a completed approval-required Claude response", async () => {
    decisions.push({
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      requestId: "req_child_approval",
    });

    const result = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "PowerShell",
      tool_input: { command: "echo behalfid-child-approval" },
    });

    expectCleanExit(result, 2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "BehalfID: approval required. Visit your Action Inbox to approve.\n"
    );
    expect(completedResponseIds).toEqual(["req_child_approval"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      action: "execute_command",
      vendor: "shell",
      policyContext: { toolInput: { command: "echo behalfid-child-approval" } },
    });
  });

  it("lets the identical Cursor hook wrapper drain completed verification work", async () => {
    decisions.push({
      allowed: false,
      reason: "cursor_test_denied",
      requestId: "req_child_cursor",
    });

    const result = await runBuiltHook(
      baseUrl,
      { command: "echo behalfid-child-cursor" },
      "cursor"
    );

    expectCleanExit(result, 0);
    expect(result.stdout).toBe('{"permission":"deny","reason":"cursor_test_denied"}\n');
    expect(result.stderr).toBe("");
    expect(completedResponseIds).toEqual(["req_child_cursor"]);
    expect(requests).toEqual([
      expect.objectContaining({
        agentId: "agent_child_process_test",
        action: "execute_command",
        vendor: "shell",
      }),
    ]);
  });
});
