import { type Interface } from "node:readline";
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
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
};
export type JsonRpcMessage = JsonRpcSuccess | JsonRpcFailure;
/** Write a JSON-RPC success line to a writable stream. */
export declare function writeResult(out: Writable, id: JsonRpcId, result: unknown): void;
/** Write a JSON-RPC error line to a writable stream. */
export declare function writeError(out: Writable, id: JsonRpcId, code: number, message: string, data?: unknown): void;
/**
 * Line-delimited JSON-RPC reader (MCP stdio framing).
 */
export declare function createJsonRpcLineReader(input: Readable, onMessage: (msg: JsonRpcRequest) => void | Promise<void>): Interface;
/**
 * Minimal JSON-RPC client over a child process stdio pair.
 */
export declare class JsonRpcStdioClient {
    private readonly stdin;
    private nextId;
    private readonly pending;
    private readonly rl;
    private closed;
    constructor(stdin: Writable, stdout: Readable);
    request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    notify(method: string, params?: Record<string, unknown>): void;
    close(): void;
    private onLine;
    private rejectAll;
}
