#!/usr/bin/env node
/**
 * Stdio MCP fixture that crashes in controlled ways:
 *   --before-init  exit before answering initialize
 *   --after-init   answer initialize then exit
 *   --on-call      answer initialize / tools/list, then exit on tools/call
 */
import { createInterface } from "node:readline";

const mode = process.argv.includes("--before-init")
  ? "before-init"
  : process.argv.includes("--after-init")
    ? "after-init"
    : process.argv.includes("--on-call")
      ? "on-call"
      : "on-call";

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (mode === "before-init") {
  process.exit(1);
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

  if (msg.id === undefined || msg.id === null) {
    return;
  }

  if (msg.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "crash-fixture", version: "0.0.0" },
      },
    });
    if (mode === "after-init") {
      setTimeout(() => process.exit(1), 25);
    }
    return;
  }

  if (msg.method === "tools/list") {
    write({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [{ name: "boom", inputSchema: { type: "object", properties: {} } }],
      },
    });
    return;
  }

  if (msg.method === "tools/call") {
    // Crash before answering so the parent sees a closed stdio pipe.
    process.exit(1);
  }

  write({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  });
});
