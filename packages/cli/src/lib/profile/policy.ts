import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readFileSync as readPkg } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { apiRequest, resolveBaseUrl } from "../client.js";
import { readExtendedConfig, writeExtendedConfig, CONFIG_DIR_PATH } from "../config.js";
import {
  DEFAULT_POLICY_CACHE_TTL_SECONDS,
  PAUSE_LEASE_FILE_NAME,
  POLICY_CACHE_FILE_NAME,
  type ManagedTool,
} from "./constants.js";
import { getOrCreateDeviceId } from "./device.js";
import { detectRepoContext, hashRepoValue } from "./repo.js";
import { createLocalSessionId, policyCacheKey, readShimsManifest, resolveRealBinaryPath } from "./shims.js";

export type SessionPolicyMode = "unmanaged" | "managed" | "required";

export type SessionPolicy = {
  mode: SessionPolicyMode;
  profileId: string | null;
  profileName: string | null;
  sessionId: string;
  workspaceId: string | null;
  reason: string;
  expiresAt: string | null;
  cacheTtlSeconds: number;
};

export type PolicySimulation = {
  ok: true;
  mode: SessionPolicyMode;
  reason: string;
  profileId: string | null;
  profileName: string | null;
  matchedRule: {
    type: string;
    repoHash?: string;
    tool?: string;
    mode?: SessionPolicyMode;
  } | null;
  pausePolicy: {
    enabled: boolean;
    reasonRequired: boolean;
    maxDurationMinutes: number;
    allowAllRepos: boolean;
    requireApprovalForRequiredMode: boolean;
  };
};

export type PauseLease = {
  leaseId?: string;
  mode: SessionPolicyMode;
  expiresAt?: string;
  reason: string;
  granted: boolean;
  approvalRequired?: boolean;
  approvalRequestId?: string;
  scope?: "current_repo" | "all";
  tool?: string | null;
  repo?: string | null;
  branch?: string | null;
  deviceId?: string | null;
};

type PolicyCacheEntry = SessionPolicy & { cachedAt: string; cacheKey: string };

function getPolicyCachePath(): string {
  return join(CONFIG_DIR_PATH, POLICY_CACHE_FILE_NAME);
}

function getPauseLeasePath(): string {
  return join(CONFIG_DIR_PATH, PAUSE_LEASE_FILE_NAME);
}

function readPolicyCacheFile(): Record<string, PolicyCacheEntry> {
  const path = getPolicyCachePath();
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as { entries?: Record<string, PolicyCacheEntry> };
    return data.entries ?? {};
  } catch {
    return {};
  }
}

function writePolicyCacheFile(entries: Record<string, PolicyCacheEntry>): void {
  if (!existsSync(CONFIG_DIR_PATH)) mkdirSync(CONFIG_DIR_PATH, { recursive: true });
  writeFileSync(
    getPolicyCachePath(),
    JSON.stringify({ entries }, null, 2) + "\n",
    { mode: 0o600 }
  );
}

export function readCachedPolicy(cacheKey: string): SessionPolicy | null {
  const entry = readPolicyCacheFile()[cacheKey];
  if (!entry) return null;
  const ttlMs = (entry.cacheTtlSeconds ?? DEFAULT_POLICY_CACHE_TTL_SECONDS) * 1000;
  const age = Date.now() - new Date(entry.cachedAt).getTime();
  if (age > ttlMs) return null;
  return entry;
}

export function writeCachedPolicy(cacheKey: string, policy: SessionPolicy): void {
  const entries = readPolicyCacheFile();
  entries[cacheKey] = { ...policy, cachedAt: new Date().toISOString(), cacheKey };
  writePolicyCacheFile(entries);
  writeExtendedConfig({ lastPolicyCacheKey: cacheKey });
}

/** Read the local pause lease mirror for display only — never used for policy authority. */
export function readLocalPauseLease(): PauseLease | null {
  const path = getPauseLeasePath();
  if (!existsSync(path)) return null;
  try {
    const lease = JSON.parse(readFileSync(path, "utf-8")) as PauseLease;
    if (!lease.granted || !lease.expiresAt) return null;
    if (new Date(lease.expiresAt).getTime() <= Date.now()) return null;
    return lease;
  } catch {
    return null;
  }
}

export function writeLocalPauseLease(lease: PauseLease | null): void {
  if (!existsSync(CONFIG_DIR_PATH)) mkdirSync(CONFIG_DIR_PATH, { recursive: true });
  if (!lease) {
    if (existsSync(getPauseLeasePath())) writeFileSync(getPauseLeasePath(), "{}\n", { mode: 0o600 });
    writeExtendedConfig({ pauseLeaseId: undefined });
    return;
  }
  writeFileSync(getPauseLeasePath(), JSON.stringify(lease, null, 2) + "\n", { mode: 0o600 });
  writeExtendedConfig({ pauseLeaseId: lease.leaseId });
}

function cliVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const pkgPath = pathJoin(dirname(__filename), "../../../package.json");
    const pkg = JSON.parse(readPkg(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export type ResolvePolicyInput = {
  tool: ManagedTool;
  cwd?: string;
  skipCache?: boolean;
};

export type SimulatePolicyInput = {
  tool: ManagedTool;
  cwd?: string;
  repo?: string | null;
  branch?: string | null;
};

export async function resolveSessionPolicy(input: ResolvePolicyInput): Promise<SessionPolicy> {
  const cwd = input.cwd ?? process.cwd();
  const repo = detectRepoContext(cwd);
  const cacheKey = policyCacheKey(input.tool, repo.repoRoot, repo.branch);

  const baseUrl = resolveBaseUrl();
  const deviceId = getOrCreateDeviceId();
  const ext = readExtendedConfig();

  try {
    const policy = await apiRequest<SessionPolicy>("/api/cli/session-policy", {
      method: "POST",
      baseUrl,
      body: {
        tool: input.tool,
        cwd: hashRepoValue(repo.cwd) ?? repo.cwd,
        gitRemote: hashRepoValue(repo.gitRemote),
        branch: repo.branch,
        repoRoot: repo.policyRepoHash,
        deviceId,
        cliVersion: cliVersion(),
        workspaceId: ext.workspaceId ?? undefined,
      },
    });

    writeCachedPolicy(cacheKey, policy);
    if (policy.workspaceId) {
      writeExtendedConfig({ workspaceId: policy.workspaceId });
    }
    return policy;
  } catch (err) {
    const cached = readCachedPolicy(cacheKey);
    if (cached) {
      if (cached.mode === "required") {
        throw new Error(
          `Managed policy requires a session but the server is unavailable. ${err instanceof Error ? err.message : "Connection failed."}`
        );
      }
      return cached;
    }

    return {
      mode: "unmanaged",
      profileId: null,
      profileName: null,
      sessionId: createLocalSessionId(),
      workspaceId: ext.workspaceId ?? null,
      reason: "Server unavailable; continuing in unmanaged mode.",
      expiresAt: null,
      cacheTtlSeconds: DEFAULT_POLICY_CACHE_TTL_SECONDS,
    };
  }
}

export async function simulateSessionPolicy(input: SimulatePolicyInput): Promise<PolicySimulation> {
  const cwd = input.cwd ?? process.cwd();
  const repo = detectRepoContext(cwd);
  const deviceId = getOrCreateDeviceId();

  return apiRequest<PolicySimulation>("/api/cli/session-policy/simulate", {
    method: "POST",
    baseUrl: resolveBaseUrl(),
    body: {
      tool: input.tool,
      repo: input.repo ?? repo.policyRepoHash,
      branch: input.branch ?? repo.branch,
      deviceId,
    },
  });
}

export type LaunchToolInput = {
  tool: ManagedTool;
  args: string[];
  cwd?: string;
};

export async function launchManagedTool(input: LaunchToolInput): Promise<number> {
  const policy = await resolveSessionPolicy({ tool: input.tool, cwd: input.cwd });

  if (policy.mode === "required") {
    const ext = readExtendedConfig();
    if (!ext.agentId && !process.env["BEHALF" + "ID_AGENT_ID"] && !process.env["BEHALF" + "ID_API_KEY"]) {
      throw new Error(
        "Policy requires a managed session but no agent credentials are configured. Run init or set agent-id and api-key."
      );
    }
    if (!policy.profileId && !policy.sessionId) {
      throw new Error("Policy requires a managed session but the server did not return a valid profile.");
    }
  }

  const realPath = resolveRealBinaryPath(input.tool);
  if (!realPath) {
    throw new Error(`Real ${input.tool} binary not found. Run \`behalf profile install\`.`);
  }

  const baseUrl = resolveBaseUrl();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BEHALF_MODE: policy.mode,
    BEHALF_SESSION_ID: policy.sessionId,
    BEHALF_API_URL: baseUrl,
  };
  if (policy.profileId) env.BEHALF_PROFILE_ID = policy.profileId;
  if (policy.workspaceId) env.BEHALF_WORKSPACE_ID = policy.workspaceId;

  if (policy.mode !== "unmanaged" && policy.reason && process.env.BEHALF_VERBOSE === "1") {
    process.stderr.write(`Managed profile: ${policy.mode} — ${policy.reason}\n`);
  }

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(realPath, input.args, {
      cwd: input.cwd ?? process.cwd(),
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export type RequestPauseInput = {
  durationMinutes: number;
  reason: string;
  scope?: "current_repo" | "all";
  tool?: ManagedTool;
  cwd?: string;
};

export async function requestPauseLease(input: RequestPauseInput): Promise<PauseLease> {
  const repo = detectRepoContext(input.cwd ?? process.cwd());
  const response = await apiRequest<PauseLease>(
    "/api/cli/pause",
    {
      method: "POST",
      body: {
        durationMinutes: input.durationMinutes,
        reason: input.reason,
        scope: input.scope ?? "current_repo",
        tool: input.tool,
        repo: repo.policyRepoHash ?? repo.repoRoot,
        branch: repo.branch,
        deviceId: getOrCreateDeviceId(),
      },
    }
  );

  if (response.granted === true) {
    writeLocalPauseLease(response);
  }

  return response;
}

export async function clearPauseLease(): Promise<void> {
  writeLocalPauseLease(null);
}

export type StatusSnapshot = {
  shimsInstalled: boolean;
  installedTools: string[];
  pathCheck: import("./path.js").PathCheck | null;
  workspaceId: string | null;
  accountId: string | null;
  repo: ReturnType<typeof detectRepoContext>;
  shimTool: ManagedTool | null;
  policy: SessionPolicy | null;
  pauseLease: PauseLease | null;
};

export async function getProfileStatus(opts: {
  tool?: ManagedTool;
  cwd?: string;
} = {}): Promise<StatusSnapshot> {
  const manifest = readShimsManifest();
  const installedTools = Object.keys(manifest.shims);
  const ext = readExtendedConfig();
  const repo = detectRepoContext(opts.cwd ?? process.cwd());
  const shimTool = opts.tool ?? null;
  const pathCheck = installedTools.length
    ? (await import("./path.js")).checkPathOrdering(installedTools[0] as ManagedTool)
    : null;

  let policy: SessionPolicy | null = null;
  if (shimTool) {
    try {
      policy = await resolveSessionPolicy({ tool: shimTool, cwd: opts.cwd });
    } catch {
      policy = null;
    }
  }

  return {
    shimsInstalled: installedTools.length > 0,
    installedTools,
    pathCheck,
    workspaceId: ext.workspaceId ?? null,
    accountId: ext.accountId ?? null,
    repo,
    shimTool,
    policy,
    pauseLease: readLocalPauseLease(),
  };
}
