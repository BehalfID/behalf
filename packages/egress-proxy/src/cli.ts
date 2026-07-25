#!/usr/bin/env node
import { createEgressProxyServer, listenLoopback } from "./server.js";
import type { EgressMode } from "./types.js";

function readMode(value: string | undefined): Exclude<EgressMode, "off"> {
  if (value === "advise" || value === "enforce") return value;
  return "enforce";
}

async function main() {
  const mode = readMode(process.env.BEHALFID_EGRESS_MODE);
  const baseUrl = (process.env.BEHALFID_BASE_URL ?? "https://behalfid.com").replace(/\/$/, "");
  const apiKey = process.env.BEHALFID_API_KEY;
  const agentId = process.env.BEHALFID_AGENT_ID;
  const preferredPort = Number(process.env.BEHALFID_EGRESS_PROXY_PORT ?? "0");

  if (!apiKey || !agentId) {
    console.error("BEHALFID_API_KEY and BEHALFID_AGENT_ID are required for egress-proxy.");
    process.exit(1);
  }

  const server = createEgressProxyServer({
    mode,
    authorize: { baseUrl, apiKey, agentId },
    onDecision: ({ target, decision, forwarded }) => {
      const flag = decision.allowed ? "allow" : forwarded ? "advise-forward" : "deny";
      console.error(
        `[egress-proxy] ${flag} ${target.method} ${target.host}:${target.port} — ${decision.reason}`
      );
    }
  });

  const { port, host } = await listenLoopback(server, Number.isFinite(preferredPort) ? preferredPort : 0);
  console.log(JSON.stringify({ ready: true, host, port, mode, proxyUrl: `http://${host}:${port}` }));

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
