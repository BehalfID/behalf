import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcMessage = JsonRpcSuccess | JsonRpcFailure;

/** Write a JSON-RPC success line to a writable stream. */
export function writeResult(
  out: Writable,
  id: JsonRpcId,
  result: unknown
): void {
  out.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

/** Write a JSON-RPC error line to a writable stream. */
export function writeError(
  out: Writable,
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): void {
  const error: { code: number; message: string; data?: unknown } = {
    code,
    message,
  };
  if (data !== undefined) error.data = data;
  out.write(JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n");
}

/**
 * Line-delimited JSON-RPC reader (MCP stdio framing).
 */
export function createJsonRpcLineReader(
  input: Readable,
  onMessage: (msg: JsonRpcRequest) => void | Promise<void>
): Interface {
  const rl = createInterface({ input, terminal: false });
  rl.on("line", (line) => {
    const raw = line.trim();
    if (!raw) return;
    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(raw) as JsonRpcRequest;
    } catch {
      return;
    }
    void Promise.resolve(onMessage(msg)).catch(() => {
      // Handler errors must not crash the reader loop.
    });
  });
  return rl;
}

/**
 * Minimal JSON-RPC client over a child process stdio pair.
 */
export class JsonRpcStdioClient {
  private nextId = 1;
  private readonly pending = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
    }
  >();
  private readonly rl: Interface;
  private closed = false;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable
  ) {
    this.rl = createInterface({ input: stdout, terminal: false });
    this.rl.on("line", (line) => this.onLine(line));
    this.rl.on("close", () => this.rejectAll(new Error("Downstream MCP stdio closed")));
  }

  async request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 30_000
  ): Promise<unknown> {
    if (this.closed) {
      throw new Error("Downstream MCP client is closed");
    }
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Downstream MCP timeout on ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        ...(params !== undefined ? { params } : {}),
      }) + "\n"
    );
  }

  close(): void {
    this.closed = true;
    this.rl.close();
    this.rejectAll(new Error("Downstream MCP client closed"));
  }

  private onLine(line: string): void {
    const raw = line.trim();
    if (!raw) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return;
    }
    if (msg.id === undefined || msg.id === null) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if ("error" in msg && msg.error) {
      pending.reject(
        new Error(msg.error.message || `JSON-RPC error ${msg.error.code}`)
      );
      return;
    }
    pending.resolve((msg as JsonRpcSuccess).result);
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }
}
