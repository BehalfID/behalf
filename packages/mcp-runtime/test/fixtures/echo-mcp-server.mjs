#!/usr/bin/env node
/**
 * Minimal stdio MCP server used by downstream crash / proxy tests.
 * Speaks line-delimited JSON-RPC. Optional --noisy-stderr emits noise on stderr.
 */
import { createInterface } from "node:readline";

const noisy = process.argv.includes("--noisy-stderr");

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {
  const raw = line.trim();
  if (!raw) return;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (noisy) {
    process.stderr.write("noise-from-child\n");
  }

  if (msg.id === undefined || msg.id === null) {
    return;
  }

  switch (msg.method) {
    case "initialize":
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "echo-fixture", version: "0.0.0" },
        },
      });
      break;
    case "tools/list":
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo a message",
              inputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
              },
            },
          ],
        },
      });
      break;
    case "tools/call": {
      const message =
        msg.params && typeof msg.params.arguments?.message === "string"
          ? msg.params.arguments.message
          : "";
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: `echo:${message}` }],
        },
      });
      break;
    }
    case "ping":
      write({ jsonrpc: "2.0", id: msg.id, result: {} });
      break;
    default:
      write({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
  }
});
