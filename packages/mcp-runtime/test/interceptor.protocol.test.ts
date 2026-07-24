import { afterEach, describe, expect, it } from "vitest";
import {
  allowDecision,
  approvalRequiredDecision,
  denyDecision,
  RecordingTransport,
} from "./helpers/fakes.js";
import {
  FakeDownstream,
  isErrorResult,
  resultText,
  startStdioHarness,
  type StdioHarness,
} from "./helpers/stdioHarness.js";

let harness: StdioHarness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

describe("stdio interceptor — handshake", () => {
  it("answers initialize with the interceptor identity", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    const response = await harness.awaitResponse(1);
    expect(response.error).toBeUndefined();
    expect(response.result).toMatchObject({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "behalfid-mcp-runtime" },
    });
  });

  it("answers ping", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", id: "ping-1", method: "ping" });

    const response = await harness.awaitResponse("ping-1");
    expect(response.result).toEqual({});
  });

  it("rejects unknown methods with JSON-RPC method-not-found", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", id: 9, method: "resources/list" });

    const response = await harness.awaitResponse(9);
    expect(response.error?.code).toBe(-32601);
    expect(response.error?.message).toContain("resources/list");
  });

  it("does not answer notifications", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    harness.send({ jsonrpc: "2.0", id: 2, method: "ping" });

    await harness.awaitResponse(2);
    expect(harness.responses()).toHaveLength(1);
    expect(harness.responses()[0]?.id).toBe(2);
  });
});

describe("stdio interceptor — tools/list", () => {
  it("namespaces downstream tools as server__tool", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", id: 3, method: "tools/list" });

    const response = await harness.awaitResponse(3);
    const tools = (response.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "filesystem__read_file",
      "filesystem__write_file",
    ]);
  });

  it("preserves downstream input schemas and supplies a default when absent", async () => {
    harness = await startStdioHarness();
    harness.send({ jsonrpc: "2.0", id: 4, method: "tools/list" });

    const response = await harness.awaitResponse(4);
    const tools = (
      response.result as {
        tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
      }
    ).tools;

    expect(tools[0]?.inputSchema).toEqual({
      type: "object",
      properties: { path: { type: "string" } },
    });
    expect(tools[1]?.inputSchema).toEqual({ type: "object", properties: {} });
    expect(tools[1]?.description).toContain("authorized by BehalfID");
  });

  it("exposes zero tools when no downstream server is configured", async () => {
    harness = await startStdioHarness({ downstream: null });
    harness.send({ jsonrpc: "2.0", id: 5, method: "tools/list" });

    const response = await harness.awaitResponse(5);
    expect(response.result).toEqual({ tools: [] });
  });

  it("surfaces a downstream listing failure as a JSON-RPC error", async () => {
    const downstream = new FakeDownstream();
    downstream.failListTools(new Error("Downstream MCP timeout on tools/list"));
    harness = await startStdioHarness({ downstream });

    harness.send({ jsonrpc: "2.0", id: 6, method: "tools/list" });

    const response = await harness.awaitResponse(6);
    expect(response.error?.code).toBe(-32603);
    expect(response.error?.message).toContain("tools/list");
  });
});

describe("stdio interceptor — tools/call allow", () => {
  it("passes a downstream MCP result through unchanged", async () => {
    const transport = new RecordingTransport(async () => ({
      data: { content: [{ type: "text", text: "file contents" }] },
    }));
    harness = await startStdioHarness({
      verifySteps: [allowDecision()],
      downstream: new FakeDownstream({ transport }),
    });

    harness.send({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "filesystem__read_file",
        arguments: { path: "/tmp/a.txt" },
      },
    });

    const response = await harness.awaitResponse(10);
    expect(isErrorResult(response.result)).toBe(false);
    expect(resultText(response.result)).toBe("file contents");
    expect(transport.calls).toEqual([
      { server: "filesystem", tool: "read_file", args: { path: "/tmp/a.txt" } },
    ]);
  });

  it("defaults missing arguments to an empty object", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });

    harness.send({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "filesystem__write_file" },
    });

    await harness.awaitResponse(11);
    expect(harness.transport.calls[0]?.args).toEqual({});
  });

  it("serializes a non-MCP-shaped downstream payload as JSON text", async () => {
    const transport = new RecordingTransport(async () => ({
      data: { rows: 2 },
    }));
    harness = await startStdioHarness({
      verifySteps: [allowDecision()],
      downstream: new FakeDownstream({ transport }),
    });

    harness.send({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    const response = await harness.awaitResponse(12);
    expect(JSON.parse(resultText(response.result))).toEqual({ rows: 2 });
  });
});

describe("stdio interceptor — tools/call blocked", () => {
  it("returns a structured denial and never dispatches downstream", async () => {
    harness = await startStdioHarness({
      verifySteps: [denyDecision({ reason: "writes are blocked" })],
    });

    harness.send({
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "filesystem__write_file", arguments: { path: "/etc/passwd" } },
    });

    const response = await harness.awaitResponse(20);
    const text = resultText(response.result);
    expect(isErrorResult(response.result)).toBe(true);
    expect(text).toContain("DENIED — tool was not executed.");
    expect(text).toContain("writes are blocked");
    expect(text).toContain("filesystem/write_file");
    expect(harness.transport.callCount).toBe(0);
  });

  it("returns approval instructions with the dashboard URL and does not execute", async () => {
    harness = await startStdioHarness({
      verifySteps: [approvalRequiredDecision()],
      config: { baseUrl: "https://behalfid.test" },
    });

    harness.send({
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "filesystem__write_file" },
    });

    const response = await harness.awaitResponse(21);
    const text = resultText(response.result);
    expect(isErrorResult(response.result)).toBe(true);
    expect(text).toContain("APPROVAL REQUIRED — tool was not executed.");
    expect(text).toContain("https://behalfid.test/dashboard/approvals");
    expect(text).toContain("apr_123");
    expect(text).toContain("retry the same tool call");
    expect(harness.transport.callCount).toBe(0);
  });

  it("executes after an approval grant is consumed", async () => {
    harness = await startStdioHarness({
      verifySteps: [approvalRequiredDecision(), allowDecision()],
      waitForApproval: async () => "granted",
    });

    harness.send({
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "filesystem__write_file" },
    });

    const response = await harness.awaitResponse(22);
    expect(isErrorResult(response.result)).toBe(false);
    expect(harness.transport.callCount).toBe(1);
  });

  it("blocks when the approver denies", async () => {
    harness = await startStdioHarness({
      verifySteps: [approvalRequiredDecision()],
      waitForApproval: async () => "denied",
    });

    harness.send({
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: { name: "filesystem__write_file" },
    });

    const response = await harness.awaitResponse(23);
    expect(isErrorResult(response.result)).toBe(true);
    expect(resultText(response.result)).toContain("approval-denied");
    expect(harness.transport.callCount).toBe(0);
  });

  it("blocks when BehalfID is unreachable", async () => {
    harness = await startStdioHarness({
      verifySteps: [{ throws: new Error("connect ECONNREFUSED 127.0.0.1:443") }],
    });

    harness.send({
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    const response = await harness.awaitResponse(24);
    const text = resultText(response.result);
    expect(isErrorResult(response.result)).toBe(true);
    expect(text).toContain("verify-unavailable");
    expect(harness.transport.callCount).toBe(0);
  });

  it("blocks when verify exceeds its deadline", async () => {
    harness = await startStdioHarness({ verifySteps: [{ hangs: true }] });

    harness.send({
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    const response = await harness.awaitResponse(25, 5_000);
    expect(isErrorResult(response.result)).toBe(true);
    expect(resultText(response.result)).toContain("verify-timeout");
    expect(harness.transport.callCount).toBe(0);
  });

  it("blocks when verify returns a malformed decision", async () => {
    harness = await startStdioHarness({
      verifySteps: [{ raw: { allowed: true } }],
    });

    harness.send({
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    const response = await harness.awaitResponse(26);
    expect(isErrorResult(response.result)).toBe(true);
    expect(resultText(response.result)).toContain("verify-malformed");
    expect(harness.transport.callCount).toBe(0);
  });
});

describe("stdio interceptor — unknown tools", () => {
  const cases: Array<[string, string]> = [
    ["an unnamespaced tool", "read_file"],
    ["an empty server segment", "__read_file"],
    ["an empty tool segment", "filesystem__"],
    ["a different downstream server", "github__create_issue"],
    ["a look-alike server prefix", "filesystem2__read_file"],
  ];

  for (const [label, toolName] of cases) {
    it(`rejects ${label} without verifying or dispatching`, async () => {
      harness = await startStdioHarness({ verifySteps: [allowDecision()] });

      harness.send({
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: { name: toolName },
      });

      const response = await harness.awaitResponse(30);
      expect(isErrorResult(response.result)).toBe(true);
      expect(resultText(response.result)).toContain(
        "Unknown or malformed tool name",
      );
      expect(harness.verifyClient.callCount).toBe(0);
      expect(harness.transport.callCount).toBe(0);
    });
  }

  it("rejects a tools/call with no name", async () => {
    harness = await startStdioHarness();

    harness.send({ jsonrpc: "2.0", id: 31, method: "tools/call", params: {} });

    const response = await harness.awaitResponse(31);
    expect(isErrorResult(response.result)).toBe(true);
    expect(resultText(response.result)).toBe("Missing tool name");
    expect(harness.transport.callCount).toBe(0);
  });

  it("refuses to execute when no downstream server is configured", async () => {
    harness = await startStdioHarness({ downstream: null });

    harness.send({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    const response = await harness.awaitResponse(32);
    expect(isErrorResult(response.result)).toBe(true);
    expect(resultText(response.result)).toContain(
      "no downstream MCP server configured",
    );
  });
});

describe("stdio interceptor — malformed messages", () => {
  it("ignores malformed lines and keeps serving subsequent requests", async () => {
    harness = await startStdioHarness();

    harness.sendRaw("not json at all");
    harness.sendRaw("{ \"jsonrpc\": \"2.0\", ");
    harness.sendRaw("[1,2,3]");
    harness.sendRaw("");
    harness.sendRaw("   ");
    harness.send({ jsonrpc: "2.0", id: 40, method: "ping" });

    const response = await harness.awaitResponse(40);
    expect(response.result).toEqual({});
    // Only the well-formed request produced output.
    expect(harness.responses()).toHaveLength(1);
  });

  it("does not execute tools for a malformed params payload", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });

    harness.sendRaw(
      JSON.stringify({ jsonrpc: "2.0", id: 41, method: "tools/call", params: [] }),
    );

    const response = await harness.awaitResponse(41);
    expect(isErrorResult(response.result)).toBe(true);
    expect(harness.transport.callCount).toBe(0);
  });

  it("keeps stdout framed as one JSON object per line", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });

    harness.send({ jsonrpc: "2.0", id: 42, method: "initialize" });
    harness.send({ jsonrpc: "2.0", id: 43, method: "tools/list" });
    harness.send({
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    });

    await harness.awaitResponse(44);
    for (const line of harness.lines) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
      expect(line.includes("\n")).toBe(false);
    }
  });
});

describe("stdio interceptor — duplicate and replayed requests", () => {
  it("verifies every repeated tools/call rather than reusing a decision", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });
    const call = {
      jsonrpc: "2.0" as const,
      method: "tools/call",
      params: { name: "filesystem__read_file", arguments: { path: "/tmp/a" } },
    };

    harness.send({ ...call, id: 50 });
    harness.send({ ...call, id: 51 });
    await harness.awaitResponse(50);
    await harness.awaitResponse(51);

    expect(harness.verifyClient.callCount).toBe(2);
    expect(harness.transport.callCount).toBe(2);
  });

  it("blocks a replay once the platform revokes permission", async () => {
    harness = await startStdioHarness({
      verifySteps: [allowDecision(), denyDecision({ reason: "revoked" })],
    });
    const call = {
      jsonrpc: "2.0" as const,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    };

    harness.send({ ...call, id: 52 });
    await harness.awaitResponse(52);
    harness.send({ ...call, id: 53 });
    const second = await harness.awaitResponse(53);

    expect(isErrorResult(second.result)).toBe(true);
    expect(resultText(second.result)).toContain("revoked");
    expect(harness.transport.callCount).toBe(1);
  });

  it("assigns a distinct verify requestId to each duplicate invocation", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });
    const call = {
      jsonrpc: "2.0" as const,
      method: "tools/call",
      params: { name: "filesystem__read_file" },
    };

    harness.send({ ...call, id: 54 });
    await harness.awaitResponse(54);
    harness.send({ ...call, id: 55 });
    await harness.awaitResponse(55);

    const requestIds = harness.verifyClient.requests.map(
      (request) => request.metadata?.requestId,
    );
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it("answers each duplicate JSON-RPC id separately", async () => {
    harness = await startStdioHarness({ verifySteps: [allowDecision()] });

    harness.send({ jsonrpc: "2.0", id: 56, method: "ping" });
    harness.send({ jsonrpc: "2.0", id: 56, method: "ping" });

    await harness.awaitResponse(56);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      harness.responses().filter((response) => response.id === 56),
    ).toHaveLength(2);
  });
});
