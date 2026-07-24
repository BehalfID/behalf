import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DownstreamMcpClient } from "../src/stdio/DownstreamClient.js";
import { McpRuntime } from "../src/McpRuntime.js";
import { allowDecision, ScriptedVerifyClient } from "./helpers/fakes.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const echoServer = join(fixturesDir, "echo-mcp-server.mjs");
const crashServer = join(fixturesDir, "crash-mcp-server.mjs");

afterEach(async () => {
  // Give Windows a beat to release child-process handles between tests.
  await new Promise((resolve) => setTimeout(resolve, 25));
});

describe("DownstreamMcpClient — real child process", () => {
  it("initializes, lists tools, and proxies an authorized tools/call", async () => {
    const client = new DownstreamMcpClient({
      serverName: "echo",
      command: process.execPath,
      args: [echoServer],
      inheritEnv: false,
      env: { PATH: process.env.PATH ?? "" },
    });

    try {
      await client.start();
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["echo"]);

      const runtime = new McpRuntime({
        agentId: "agent_1",
        verifyClient: new ScriptedVerifyClient([allowDecision()]),
        transport: client,
      });

      const result = await runtime.execute({
        requestId: "rq_echo",
        sessionId: "sess",
        userId: "user",
        agentId: "agent_1",
        provider: "vitest",
        server: "echo",
        tool: "echo",
        arguments: { message: "hello" },
      });

      expect(result.outcome).toBe("allowed");
      expect(result.execution?.ok).toBe(true);
      expect(result.execution?.data).toMatchObject({
        content: [{ type: "text", text: "echo:hello" }],
      });
    } finally {
      await client.stop();
    }
  });

  it("surfaces a crash after initialize as a failed tool execution", async () => {
    const client = new DownstreamMcpClient({
      serverName: "crashy",
      command: process.execPath,
      args: [crashServer, "--after-init"],
      inheritEnv: false,
      env: { PATH: process.env.PATH ?? "" },
    });

    try {
      await client.start();
      // Wait for the child to exit after the initialize handshake.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const runtime = new McpRuntime({
        agentId: "agent_1",
        verifyClient: new ScriptedVerifyClient([allowDecision()]),
        transport: client,
      });

      const result = await runtime.execute({
        requestId: "rq_crash",
        sessionId: "sess",
        userId: "user",
        agentId: "agent_1",
        provider: "vitest",
        server: "crashy",
        tool: "boom",
        arguments: {},
      });

      // Authorization succeeded; the crash is an execution failure, not a bypass.
      expect(result.outcome).toBe("allowed");
      expect(result.execution?.ok).toBe(false);
      expect(result.execution?.error).toBeTruthy();
    } finally {
      await client.stop();
    }
  });

  it("fails the call when the child crashes mid tools/call", async () => {
    const client = new DownstreamMcpClient({
      serverName: "crashy",
      command: process.execPath,
      args: [crashServer, "--on-call"],
      inheritEnv: false,
      env: { PATH: process.env.PATH ?? "" },
    });

    try {
      await client.start();
      await client.listTools();

      const result = await client.callTool("crashy", "boom", {});
      expect(result.error).toBeTruthy();
      expect(result.data).toBeUndefined();
    } finally {
      await client.stop();
    }
  });

  it("rejects start when the child exits before initialize responds", async () => {
    const client = new DownstreamMcpClient({
      serverName: "crashy",
      command: process.execPath,
      args: [crashServer, "--before-init"],
      inheritEnv: false,
      env: { PATH: process.env.PATH ?? "" },
    });

    await expect(client.start()).rejects.toThrow();
    await client.stop();
  });
});

describe("DownstreamMcpClient — stderr isolation", () => {
  it("does not leak child stderr into the parent MCP framing stream", async () => {
    // Spawn the echo server ourselves and assert stderr lines stay off stdout.
    const child = spawn(process.execPath, [echoServer, "--noisy-stderr"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
    });

    const stdoutLines: string[] = [];
    const stderrChunks: string[] = [];
    createInterface({ input: child.stdout }).on("line", (line) => {
      stdoutLines.push(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(String(chunk));
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      })}\n`,
    );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("initialize timed out")),
        3_000,
      );
      const check = setInterval(() => {
        if (stdoutLines.length > 0) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 10);
    });

    expect(stdoutLines).toHaveLength(1);
    expect(() => JSON.parse(stdoutLines[0]!) as unknown).not.toThrow();
    expect(stderrChunks.join("")).toContain("noise-from-child");

    child.kill();
  });
});
