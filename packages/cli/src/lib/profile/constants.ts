export const SHIM_MARKER = "BEHALF" + "ID_SHIM_v1";
export const BIN_DIR_NAME = "bin";
export const SHIMS_FILE_NAME = "shims.json";
export const POLICY_CACHE_FILE_NAME = "policy-cache.json";
export const PAUSE_LEASE_FILE_NAME = "pause-lease.json";

export const MANAGED_TOOLS = ["claude", "codex", "cursor"] as const;
export type ManagedTool = (typeof MANAGED_TOOLS)[number];

export const DEFAULT_POLICY_CACHE_TTL_SECONDS = 300;
export const MAX_PAUSE_DURATION_MINUTES = 240;
export const DEFAULT_PAUSE_DURATION_MINUTES = 30;

export function isManagedTool(value: string): value is ManagedTool {
  return (MANAGED_TOOLS as readonly string[]).includes(value);
}
