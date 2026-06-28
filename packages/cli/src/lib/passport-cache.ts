import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { apiRequest } from "./client.js";

const CACHE_DIR = join(homedir(), ".behalf", "cache");
const TTL_MS = 30 * 60 * 1000;

export type PermissionEntry = {
  permissionId: string;
  action: string;
  description?: string | null;
  resource?: string | null;
  scope?: string | null;
  allowedActions?: string[] | null;
  blockedActions?: string[] | null;
  requiresApproval?: boolean | null;
  template?: string | null;
  constraints?: {
    maxAmount?: number | null;
    allowedVendors?: string[] | null;
    expiresAt?: string | null;
  } | null;
  status: string;
};

export type AgentDetail = {
  agent: {
    agentId: string;
    name: string;
    status: string;
    agentType?: string | null;
    provider?: string | null;
    description?: string | null;
    guidelines?: string[];
  };
  permissions: PermissionEntry[];
};

type CacheEntry = {
  agentId: string;
  fetchedAt: string;
  data: AgentDetail;
};

function cacheFile(agentId: string) {
  return join(CACHE_DIR, `${agentId}.json`);
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function readCachedDetail(agentId: string): AgentDetail | null {
  const cached = readAnyCachedDetail(agentId);
  return cached && cached.fresh ? cached.data : null;
}

/**
 * Read the cached detail regardless of age. Returns the data along with a
 * `fresh` flag indicating whether it is still within the TTL. Returns null only
 * when there is no usable cache entry at all (absent or unparseable). Callers
 * that can tolerate stale data use this to launch immediately and refresh in
 * the background.
 */
export function readAnyCachedDetail(
  agentId: string
): { data: AgentDetail; fresh: boolean } | null {
  const path = cacheFile(agentId);
  if (!existsSync(path)) return null;
  try {
    const entry = JSON.parse(readFileSync(path, "utf-8")) as CacheEntry;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    return { data: entry.data, fresh: age <= TTL_MS };
  } catch {
    return null;
  }
}

export function writeCachedDetail(agentId: string, data: AgentDetail) {
  ensureCacheDir();
  const entry: CacheEntry = { agentId, fetchedAt: new Date().toISOString(), data };
  writeFileSync(cacheFile(agentId), JSON.stringify(entry, null, 2) + "\n");
}

export async function fetchAndCacheDetail(
  agentId: string,
  baseUrl?: string,
  forceRefresh = false,
  apiKey?: string,
  timeoutMs?: number
): Promise<AgentDetail> {
  if (!forceRefresh) {
    const cached = readCachedDetail(agentId);
    if (cached) return cached;
  }

  const data = await apiRequest<AgentDetail>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    { baseUrl, apiKey, timeoutMs }
  );

  writeCachedDetail(agentId, data);
  return data;
}
