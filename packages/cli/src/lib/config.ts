import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".behalf");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SESSION_FILE = join(CONFIG_DIR, "session");

export type Config = {
  apiKey?: string;
  agentId?: string;
  baseUrl?: string;
};

export type ExtendedConfig = Config & {
  deviceId?: string;
  workspaceId?: string;
  accountId?: string;
  realBinaryPaths?: Record<string, string>;
  lastPolicyCacheKey?: string;
  pauseLeaseId?: string;
  policyCache?: unknown;
  /**
   * Enforcement posture for the Antigravity PreToolUse gate. Read from disk
   * (not env) because Antigravity runs hooks with a sanitized environment.
   */
  antigravityEnforcement?: "advisory" | "required";
};

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function readExtendedConfig(): ExtendedConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ExtendedConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  ensureDir();
  const existing = readExtendedConfig();
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...existing, ...config }, null, 2) + "\n",
    { mode: 0o600 }
  );
}

export function writeExtendedConfig(patch: Partial<ExtendedConfig>): void {
  ensureDir();
  const next = { ...readExtendedConfig(), ...patch };
  for (const key of Object.keys(next) as (keyof ExtendedConfig)[]) {
    if (next[key] === undefined) delete next[key];
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export function patchConfig(patch: Partial<Config>): void {
  writeExtendedConfig(patch);
}

export function readSession(): string | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const val = readFileSync(SESSION_FILE, "utf-8").trim();
    return val || null;
  } catch {
    return null;
  }
}

export function writeSession(cookie: string): void {
  ensureDir();
  writeFileSync(SESSION_FILE, cookie, { mode: 0o600 });
}

export function clearSession(): void {
  if (existsSync(SESSION_FILE)) writeFileSync(SESSION_FILE, "", { mode: 0o600 });
}

export const CONFIG_FILE_PATH = CONFIG_FILE;
export const CONFIG_DIR_PATH = CONFIG_DIR;
