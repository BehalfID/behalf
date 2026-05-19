import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DemoEnv = {
  apiKey: string;
  agentId: string;
  baseUrl: string;
  allowInsecureHttp: boolean;
};

export function loadDotEnv(filePath = resolve(process.cwd(), ".env")) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readDemoEnv(): DemoEnv {
  loadDotEnv();

  const apiKey = process.env.BEHALFID_API_KEY;
  const agentId = process.env.BEHALFID_AGENT_ID;
  const baseUrl = (process.env.BEHALFID_BASE_URL || "https://behalfid.com").replace(/\/+$/, "");

  if (!apiKey || !agentId) {
    throw new Error(
      [
        "Missing required environment variables.",
        "Set BEHALFID_API_KEY and BEHALFID_AGENT_ID in .env.",
        "Copy .env.example to .env, then fill in the agent API key and ID."
      ].join("\n")
    );
  }

  return {
    apiKey,
    agentId,
    baseUrl,
    allowInsecureHttp: baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1")
  };
}
