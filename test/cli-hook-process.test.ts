import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type VerifyDecision = {
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  requestId: string;
};

type ChildResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

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

function runBuiltHook(baseUrl: string, payload: Record<string, unknown>): Promise<ChildResult> {
  const home = mkdtempSync(join(tmpdir(), "behalf-built-hook-home-"));
  return new Promise((resolveChild, reject) => {
    const child = spawn(process.execPath, [cliEntry, "hook", "pre-tool-use"], {
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
    child.once("close", (code) => resolveChild({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

describe("built CLI Claude PreToolUse process", () => {
  let server: Server;
  let baseUrl: string;
  const decisions: VerifyDecision[] = [];
  const requests: Array<Record<string, unknown>> = [];

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
        response.writeHead(decision ? 200 : 500, { "Content-Type": "application/json" });
        response.end(JSON.stringify(decision ?? { error: "missing test decision" }));
      });
    });
    baseUrl = `http://127.0.0.1:${await listen(server)}`;
  });

  afterAll(async () => {
    if (server) await close(server);
  });

  it("preserves stdout, stderr, and exit-code contracts for safe Claude shell payloads", async () => {
    decisions.push(
      { allowed: true, reason: "allowed", requestId: "req_child_allow" },
      { allowed: false, reason: "command_blocked", requestId: "req_child_deny" },
      {
        allowed: false,
        approvalRequired: true,
        reason: "Permission requires approval before execution.",
        requestId: "req_child_approval",
      }
    );

    const allowed = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo behalfid-child-allowed" },
    });
    const denied = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo behalfid-child-denied" },
    });
    const approval = await runBuiltHook(baseUrl, {
      hook_event_name: "PreToolUse",
      tool_name: "PowerShell",
      tool_input: { command: "echo behalfid-child-approval" },
    });

    expect(allowed).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(denied).toEqual({
      code: 2,
      stdout: "",
      stderr: "BehalfID: blocked by policy.\n",
    });
    expect(approval).toEqual({
      code: 2,
      stdout: "",
      stderr: "BehalfID: approval required. Visit your Action Inbox to approve.\n",
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      agentId: "agent_child_process_test",
      action: "execute_command",
      vendor: "shell",
      policyContext: { toolInput: { command: "echo behalfid-child-allowed" } },
    });
    expect(requests[1]).toMatchObject({
      policyContext: { toolInput: { command: "echo behalfid-child-denied" } },
    });
    expect(requests[2]).toMatchObject({
      policyContext: { toolInput: { command: "echo behalfid-child-approval" } },
    });
  });
});
