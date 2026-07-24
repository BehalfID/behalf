import { PassThrough, Writable } from "node:stream";
import { McpRuntime } from "../../src/McpRuntime.js";
import type { InterceptorConfig } from "../../src/config.js";
import { InterceptorServer } from "../../src/stdio/InterceptorServer.js";
import type { DownstreamMcpClient, DownstreamTool } from "../../src/stdio/DownstreamClient.js";
import type { ApprovalWaiter, McpTransport } from "../../src/types.js";
import { RecordingTransport, ScriptedVerifyClient, type VerifyStep } from "./fakes.js";

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** Minimal stand-in for the spawning downstream client (no child process). */
export class FakeDownstream implements McpTransport {
  readonly serverName: string;
  readonly transport: RecordingTransport;
  listToolsCalls = 0;
  stopped = false;
  private tools: DownstreamTool[];
  private cache: DownstreamTool[] = [];
  private listToolsError: Error | null = null;

  constructor(options: {
    serverName?: string;
    tools?: DownstreamTool[];
    transport?: RecordingTransport;
  } = {}) {
    this.serverName = options.serverName ?? "filesystem";
    this.tools = options.tools ?? [
      {
        name: "read_file",
        description: "Read a file",
        inputSchema: { type: "object", properties: { path: { type: "string" } } },
      },
      { name: "write_file" },
    ];
    this.transport = options.transport ?? new RecordingTransport();
  }

  failListTools(error: Error): void {
    this.listToolsError = error;
  }

  async start(): Promise<void> {}

  async listTools(): Promise<DownstreamTool[]> {
    this.listToolsCalls += 1;
    if (this.listToolsError) {
      throw this.listToolsError;
    }
    this.cache = this.tools;
    return this.tools;
  }

  getCachedTools(): DownstreamTool[] {
    return this.cache;
  }

  async callTool(
    server: string,
    tool: string,
    args?: unknown,
  ): Promise<{ data?: unknown; error?: string }> {
    return this.transport.callTool(server, tool, args);
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  /** Cast helper: InterceptorServer only uses the surface implemented above. */
  asClient(): DownstreamMcpClient {
    return this as unknown as DownstreamMcpClient;
  }
}

export function testConfig(
  overrides: Partial<InterceptorConfig> = {},
): InterceptorConfig {
  return {
    apiKey: "bhf_sk_test",
    agentId: "agent_test",
    baseUrl: "https://behalfid.test",
    verifyUrl: "https://behalfid.test/api/verify",
    verifyTimeoutMs: 1_000,
    provider: "vitest",
    ...overrides,
  };
}

export type StdioHarness = {
  server: InterceptorServer;
  stdin: PassThrough;
  downstream: FakeDownstream;
  verifyClient: ScriptedVerifyClient;
  transport: RecordingTransport;
  lines: string[];
  send(message: unknown): void;
  /** Send a raw stdout line, including deliberately malformed payloads. */
  sendRaw(raw: string): void;
  /** Resolve once a response with `id` is written, or reject on timeout. */
  awaitResponse(id: string | number, timeoutMs?: number): Promise<JsonRpcResponse>;
  responses(): JsonRpcResponse[];
  stop(): Promise<void>;
};

/**
 * Boot an {@link InterceptorServer} over in-memory streams with an injected
 * runtime, so protocol behaviour can be asserted without a child process.
 */
export async function startStdioHarness(
  options: {
    verifySteps?: VerifyStep[];
    downstream?: FakeDownstream | null;
    transport?: RecordingTransport;
    waitForApproval?: ApprovalWaiter;
    config?: Partial<InterceptorConfig>;
    /** Omit the runtime to exercise the zero-tool fail-safe path. */
    withRuntime?: boolean;
  } = {},
): Promise<StdioHarness> {
  const stdin = new PassThrough();
  const lines: string[] = [];
  let buffer = "";
  const waiters: Array<(response: JsonRpcResponse) => void> = [];

  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      buffer += String(chunk);
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          lines.push(line);
          for (const waiter of [...waiters]) {
            waiter(JSON.parse(line) as JsonRpcResponse);
          }
        }
        index = buffer.indexOf("\n");
      }
      callback();
    },
  });

  const transport = options.transport ?? new RecordingTransport();
  const downstream =
    options.downstream === null
      ? null
      : (options.downstream ?? new FakeDownstream({ transport }));
  const verifyClient = new ScriptedVerifyClient(
    options.verifySteps ?? [
      { requestId: "req_default", allowed: true, reason: "ok", risk: "low" },
    ],
  );

  const withRuntime = options.withRuntime !== false && downstream !== null;
  const runtime = withRuntime
    ? new McpRuntime({
        agentId: "agent_test",
        verifyClient,
        transport: downstream!,
        verifyTimeoutMs: 1_000,
        ...(options.waitForApproval
          ? { waitForApproval: options.waitForApproval }
          : {}),
      })
    : undefined;

  const server = new InterceptorServer({
    config: testConfig(options.config),
    stdin,
    stdout,
    downstream: downstream === null ? null : downstream.asClient(),
    ...(runtime ? { runtime } : {}),
  });

  await server.start();

  return {
    server,
    stdin,
    downstream: (downstream ?? new FakeDownstream()) as FakeDownstream,
    verifyClient,
    transport: downstream ? downstream.transport : transport,
    lines,
    send(message) {
      stdin.write(`${JSON.stringify(message)}\n`);
    },
    sendRaw(raw) {
      stdin.write(`${raw}\n`);
    },
    awaitResponse(id, timeoutMs = 3_000) {
      const existing = lines
        .map((line) => JSON.parse(line) as JsonRpcResponse)
        .find((response) => response.id === id);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise<JsonRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          remove();
          reject(new Error(`Timed out waiting for JSON-RPC response id=${String(id)}`));
        }, timeoutMs);

        const waiter = (response: JsonRpcResponse) => {
          if (response.id !== id) return;
          clearTimeout(timer);
          remove();
          resolve(response);
        };
        const remove = () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
        };

        waiters.push(waiter);
      });
    },
    responses() {
      return lines.map((line) => JSON.parse(line) as JsonRpcResponse);
    },
    async stop() {
      await server.stop();
      stdin.end();
    },
  };
}

/** Text payload of an MCP tool result. */
export function resultText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((entry) => entry.text ?? "").join("\n");
}

/** Whether an MCP tool result is flagged as an error. */
export function isErrorResult(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}
