#!/usr/bin/env node
/**
 * Stdio entrypoint for `@behalfid/mcp-runtime`.
 *
 * Usage (via npx / MCP client config):
 *   BEHALFID_API_KEY=... BEHALFID_AGENT_ID=... \
 *   BEHALFID_DOWNSTREAM_COMMAND=npx \
 *   BEHALFID_DOWNSTREAM_ARGS='["-y","@modelcontextprotocol/server-filesystem","/tmp"]' \
 *   node dist/cli.js
 */

import { ConfigError, loadInterceptorConfig } from "./config.js";
import { InterceptorServer } from "./stdio/InterceptorServer.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadInterceptorConfig();
  } catch (err) {
    const message =
      err instanceof ConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    // Log to stderr only — stdout is reserved for MCP JSON-RPC.
    console.error(`[behalfid-mcp-runtime] ${message}`);
    process.exit(1);
  }

  const server = new InterceptorServer({ config });
  const shutdown = async () => {
    try {
      await server.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await server.start();
}

main().catch((err) => {
  console.error(
    "[behalfid-mcp-runtime]",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
