import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Google Antigravity configuration management.
 *
 * Antigravity (the IDE and the `agy` CLI) shares configuration under
 * `~/.gemini/` — its CLI is the successor to Gemini CLI and kept that config
 * root:
 *
 *   ~/.gemini/config/hooks.json            global hooks (shared IDE + CLI)
 *   ~/.gemini/config/mcp_config.json       shared MCP server config
 *   ~/.gemini/antigravity/mcp_config.json  earlier per-product MCP config path
 *   <workspace>/.agents/hooks.json         workspace-local hooks (trust-gated,
 *                                          not managed by BehalfID)
 *
 * hooks.json maps a top-level namespace to event configurations. BehalfID
 * installs a single PreToolUse entry under the `behalfid` namespace and never
 * touches other namespaces:
 *
 *   {
 *     "behalfid": {
 *       "PreToolUse": [
 *         { "matcher": ".*",
 *           "hooks": [ { "type": "command", "command": "behalf hook antigravity" } ] }
 *       ]
 *     }
 *   }
 *
 * The hook command reads its credentials and enforcement mode from
 * ~/.behalf/config.json — Antigravity executes hooks with a sanitized
 * environment, so env-var configuration does not reach the hook process.
 */

export const ANTIGRAVITY_HOOK_COMMAND = "behalf hook antigravity";
export const ANTIGRAVITY_HOOK_NAMESPACE = "behalfid";

type AntigravityHookSpec = { type?: string; command?: string; name?: string; timeout?: number };
type AntigravityHookMatcher = { matcher?: string; hooks?: AntigravityHookSpec[] };
type AntigravityNamespace = Record<string, unknown> & { PreToolUse?: AntigravityHookMatcher[] };
type AntigravityHooksFile = Record<string, unknown>;

type McpServerEntry = Record<string, unknown> & {
  command?: string;
  args?: unknown;
  serverUrl?: string;
};
type McpConfigFile = Record<string, unknown> & {
  mcpServers?: Record<string, McpServerEntry>;
};

export function antigravityHooksPath(home = homedir()): string {
  return join(home, ".gemini", "config", "hooks.json");
}

/**
 * Candidate MCP config locations, in write-preference order. The shared
 * `config/` path is the Antigravity 2.0 central config; the `antigravity/`
 * path is the earlier per-product location that existing installs may still
 * read. Install merges into every file that exists and creates the shared one
 * when neither does.
 */
export function antigravityMcpConfigPaths(home = homedir()): string[] {
  return [
    join(home, ".gemini", "config", "mcp_config.json"),
    join(home, ".gemini", "antigravity", "mcp_config.json"),
  ];
}

export type AntigravityInstallFailureCode = "malformed" | "unreadable" | "unwritable" | "unverified";

export type AntigravityInstallResult =
  | { path: string; ok: true; changed: boolean }
  | { path: string; ok: false; changed: false; code: AntigravityInstallFailureCode };

type ReadJsonOk<T> = { ok: true; data: T };
type ReadJsonErr = { ok: false; code: "malformed" | "unreadable" };

function readJsonFile<T extends Record<string, unknown>>(path: string): ReadJsonOk<T> | ReadJsonErr {
  if (!existsSync(path)) return { ok: true, data: {} as T };
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { ok: false, code: "unreadable" };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, code: "malformed" };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, code: "malformed" };
  }
}

/** Suffix for the pre-change backup written next to each modified config file. */
export const ANTIGRAVITY_BACKUP_SUFFIX = ".behalfid.bak";

/**
 * Atomically replace a JSON config file: write to a temp file in the same
 * directory, then rename over the target, so an interruption can never leave
 * a truncated file. When the target already exists, its permissions are
 * preserved and a backup copy is written to `<path>.behalfid.bak` first
 * (manual rollback: move the backup over the file).
 */
function writeJsonFile(path: string, data: Record<string, unknown>): boolean {
  const tmp = `${path}.behalfid-tmp-${process.pid}-${Date.now()}`;
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let mode: number | undefined;
    if (existsSync(path)) {
      mode = statSync(path).mode & 0o777;
      const backup = path + ANTIGRAVITY_BACKUP_SUFFIX;
      copyFileSync(path, backup);
      try {
        chmodSync(backup, mode);
      } catch {
        // Backup exists with default mode; not worth failing the write over.
      }
    }

    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", mode !== undefined ? { mode } : {});
    renameSync(tmp, path);
    return true;
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // Leave the temp file behind rather than mask the original failure.
    }
    return false;
  }
}

function namespaceOf(file: AntigravityHooksFile): AntigravityNamespace | undefined {
  const ns = file[ANTIGRAVITY_HOOK_NAMESPACE];
  if (typeof ns === "object" && ns !== null && !Array.isArray(ns)) {
    return ns as AntigravityNamespace;
  }
  return undefined;
}

function hooksFileHasBehalfEntry(file: AntigravityHooksFile): boolean {
  const pre = namespaceOf(file)?.PreToolUse;
  if (!Array.isArray(pre)) return false;
  return pre.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => h?.type === "command" && h?.command === ANTIGRAVITY_HOOK_COMMAND)
  );
}

export type AntigravityHookStatus =
  | { path: string; status: "ok" }
  | { path: string; status: "missing" }
  | { path: string; status: "malformed" }
  | { path: string; status: "unreadable" };

/** Inspect the global Antigravity hooks file without mutating it. */
export function getAntigravityHookStatus(home = homedir()): AntigravityHookStatus {
  const path = antigravityHooksPath(home);
  const read = readJsonFile<AntigravityHooksFile>(path);
  if (!read.ok) return { path, status: read.code };
  if (hooksFileHasBehalfEntry(read.data)) return { path, status: "ok" };
  return { path, status: "missing" };
}

export function hasAntigravityHook(home = homedir()): boolean {
  return getAntigravityHookStatus(home).status === "ok";
}

/**
 * Merge the BehalfID PreToolUse entry into ~/.gemini/config/hooks.json,
 * preserving all other namespaces and any other events under `behalfid`.
 * Idempotent. Malformed / unreadable / unwritable files are left untouched
 * and reported so callers can refuse to claim enforcement.
 */
export function installAntigravityHook(home = homedir()): AntigravityInstallResult {
  const path = antigravityHooksPath(home);
  const read = readJsonFile<AntigravityHooksFile>(path);
  if (!read.ok) return { path, ok: false, changed: false, code: read.code };

  if (hooksFileHasBehalfEntry(read.data)) {
    return { path, ok: true, changed: false };
  }

  const file = read.data;
  const ns: AntigravityNamespace = namespaceOf(file) ?? {};
  const pre: AntigravityHookMatcher[] = Array.isArray(ns.PreToolUse) ? ns.PreToolUse : [];
  pre.push({
    matcher: ".*",
    hooks: [{ type: "command", command: ANTIGRAVITY_HOOK_COMMAND }],
  });
  ns.PreToolUse = pre;
  file[ANTIGRAVITY_HOOK_NAMESPACE] = ns;

  if (!writeJsonFile(path, file)) {
    return { path, ok: false, changed: false, code: "unwritable" };
  }

  const verify = readJsonFile<AntigravityHooksFile>(path);
  if (!verify.ok || !hooksFileHasBehalfEntry(verify.data)) {
    return { path, ok: false, changed: false, code: "unverified" };
  }

  return { path, ok: true, changed: true };
}

export type AntigravityUninstallResult = {
  path: string;
  status: "removed" | "not_found" | "malformed" | "unreadable" | "unwritable";
};

/**
 * Remove the BehalfID PreToolUse entry from the global hooks file. Other
 * namespaces and any non-BehalfID entries are preserved; the `behalfid`
 * namespace is dropped when it becomes empty.
 */
export function uninstallAntigravityHook(home = homedir()): AntigravityUninstallResult {
  const path = antigravityHooksPath(home);
  if (!existsSync(path)) return { path, status: "not_found" };
  const read = readJsonFile<AntigravityHooksFile>(path);
  if (!read.ok) return { path, status: read.code };
  if (!hooksFileHasBehalfEntry(read.data)) return { path, status: "not_found" };

  const file = read.data;
  const ns = namespaceOf(file);
  if (ns && Array.isArray(ns.PreToolUse)) {
    const remaining = ns.PreToolUse.map((entry) => ({
      ...entry,
      hooks: Array.isArray(entry.hooks)
        ? entry.hooks.filter((h) => !(h?.type === "command" && h?.command === ANTIGRAVITY_HOOK_COMMAND))
        : entry.hooks,
    })).filter((entry) => !Array.isArray(entry.hooks) || entry.hooks.length > 0);

    if (remaining.length > 0) {
      ns.PreToolUse = remaining;
    } else {
      delete ns.PreToolUse;
    }
    if (Object.keys(ns).length === 0) {
      delete file[ANTIGRAVITY_HOOK_NAMESPACE];
    } else {
      file[ANTIGRAVITY_HOOK_NAMESPACE] = ns;
    }
  }

  if (!writeJsonFile(path, file)) return { path, status: "unwritable" };
  const verify = readJsonFile<AntigravityHooksFile>(path);
  if (!verify.ok || hooksFileHasBehalfEntry(verify.data)) {
    return { path, status: "unwritable" };
  }
  return { path, status: "removed" };
}

// ── MCP server registration ───────────────────────────────────────────────────

const BEHALF_MCP_SERVER_NAME = "behalfid";

function mcpFileHasBehalfServer(file: McpConfigFile): boolean {
  const servers = file.mcpServers;
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) return false;
  return BEHALF_MCP_SERVER_NAME in servers;
}

export type AntigravityMcpStatus = {
  path: string;
  status: "ok" | "missing" | "malformed" | "unreadable";
};

export function getAntigravityMcpStatus(home = homedir()): AntigravityMcpStatus[] {
  return antigravityMcpConfigPaths(home).map((path) => {
    if (!existsSync(path)) return { path, status: "missing" as const };
    const read = readJsonFile<McpConfigFile>(path);
    if (!read.ok) return { path, status: read.code };
    return { path, status: mcpFileHasBehalfServer(read.data) ? ("ok" as const) : ("missing" as const) };
  });
}

export function hasAntigravityMcpServer(home = homedir()): boolean {
  return getAntigravityMcpStatus(home).some((s) => s.status === "ok");
}

/**
 * Register the advisory BehalfID MCP server (`behalf mcp start`, stdio) in
 * Antigravity's MCP config. Merges into every candidate file that already
 * exists; creates the shared config when none does. Existing server entries
 * are preserved; unparseable files are left untouched and reported.
 */
export function installAntigravityMcpServer(home = homedir()): AntigravityInstallResult[] {
  const paths = antigravityMcpConfigPaths(home);
  const targets = paths.filter((p) => existsSync(p));
  if (targets.length === 0) targets.push(paths[0]);

  return targets.map((path): AntigravityInstallResult => {
    const read = readJsonFile<McpConfigFile>(path);
    if (!read.ok) return { path, ok: false, changed: false, code: read.code };
    if (mcpFileHasBehalfServer(read.data)) return { path, ok: true, changed: false };

    const file = read.data;
    const servers =
      typeof file.mcpServers === "object" && file.mcpServers !== null && !Array.isArray(file.mcpServers)
        ? file.mcpServers
        : {};
    servers[BEHALF_MCP_SERVER_NAME] = { command: "behalf", args: ["mcp", "start"] };
    file.mcpServers = servers;

    if (!writeJsonFile(path, file)) return { path, ok: false, changed: false, code: "unwritable" };

    const verify = readJsonFile<McpConfigFile>(path);
    if (!verify.ok || !mcpFileHasBehalfServer(verify.data)) {
      return { path, ok: false, changed: false, code: "unverified" };
    }
    return { path, ok: true, changed: true };
  });
}

/** Remove the BehalfID MCP server entry from every Antigravity MCP config file. */
export function uninstallAntigravityMcpServer(home = homedir()): AntigravityUninstallResult[] {
  return antigravityMcpConfigPaths(home).map((path): AntigravityUninstallResult => {
    if (!existsSync(path)) return { path, status: "not_found" };
    const read = readJsonFile<McpConfigFile>(path);
    if (!read.ok) return { path, status: read.code };
    if (!mcpFileHasBehalfServer(read.data)) return { path, status: "not_found" };

    const file = read.data;
    const servers = file.mcpServers as Record<string, McpServerEntry>;
    delete servers[BEHALF_MCP_SERVER_NAME];
    file.mcpServers = servers;

    if (!writeJsonFile(path, file)) return { path, status: "unwritable" };
    const verify = readJsonFile<McpConfigFile>(path);
    if (!verify.ok || mcpFileHasBehalfServer(verify.data)) {
      return { path, status: "unwritable" };
    }
    return { path, status: "removed" };
  });
}
