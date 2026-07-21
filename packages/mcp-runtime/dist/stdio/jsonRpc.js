import { createInterface } from "node:readline";
/** Write a JSON-RPC success line to a writable stream. */
export function writeResult(out, id, result) {
    out.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
/** Write a JSON-RPC error line to a writable stream. */
export function writeError(out, id, code, message, data) {
    const error = {
        code,
        message,
    };
    if (data !== undefined)
        error.data = data;
    out.write(JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n");
}
/**
 * Line-delimited JSON-RPC reader (MCP stdio framing).
 */
export function createJsonRpcLineReader(input, onMessage) {
    const rl = createInterface({ input, terminal: false });
    rl.on("line", (line) => {
        const raw = line.trim();
        if (!raw)
            return;
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
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
    stdin;
    nextId = 1;
    pending = new Map();
    rl;
    closed = false;
    constructor(stdin, stdout) {
        this.stdin = stdin;
        this.rl = createInterface({ input: stdout, terminal: false });
        this.rl.on("line", (line) => this.onLine(line));
        this.rl.on("close", () => this.rejectAll(new Error("Downstream MCP stdio closed")));
    }
    async request(method, params, timeoutMs = 30_000) {
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
    notify(method, params) {
        this.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method,
            ...(params !== undefined ? { params } : {}),
        }) + "\n");
    }
    close() {
        this.closed = true;
        this.rl.close();
        this.rejectAll(new Error("Downstream MCP client closed"));
    }
    onLine(line) {
        const raw = line.trim();
        if (!raw)
            return;
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (msg.id === undefined || msg.id === null)
            return;
        const pending = this.pending.get(msg.id);
        if (!pending)
            return;
        this.pending.delete(msg.id);
        if ("error" in msg && msg.error) {
            pending.reject(new Error(msg.error.message || `JSON-RPC error ${msg.error.code}`));
            return;
        }
        pending.resolve(msg.result);
    }
    rejectAll(err) {
        for (const [, p] of this.pending) {
            p.reject(err);
        }
        this.pending.clear();
    }
}
