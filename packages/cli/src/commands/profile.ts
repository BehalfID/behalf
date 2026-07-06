import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { readConfig, readExtendedConfig, readSession } from "../lib/config.js";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printError, printJson, printKv, printSuccess, runAction } from "../lib/output.js";
import { MANAGED_TOOLS, isManagedTool, type ManagedTool } from "../lib/profile/constants.js";
import { checkPathOrdering, shellPathExportLine } from "../lib/profile/path.js";
import {
  getBinDir,
  generateShimContent,
  installShims,
  isBehalfManagedShim,
  readShimsManifest,
  resolveRealBinaryPath,
  uninstallShims,
} from "../lib/profile/shims.js";
import {
  clearPauseLease,
  getProfileStatus,
  readLocalPauseLease,
  requestPauseLease,
  resolveSessionPolicy,
  simulateSessionPolicy,
  type RequestPauseInput,
} from "../lib/profile/policy.js";
import {
  DEFAULT_PAUSE_WAIT_TIMEOUT_MS,
  fetchPauseApprovalStatus,
  formatApprovalRequiredLines,
  formatPauseApprovalStatusMessage,
  PauseApprovalWaitError,
  parseWaitTimeout,
  waitForPauseApprovalGrant,
} from "../lib/profile/pause-approval.js";
import { detectRepoContext, isGitRepo } from "../lib/profile/repo.js";
import { getOrCreateDeviceId } from "../lib/profile/device.js";
import type { DoctorCheck as Check } from "./doctor.js";

function cliVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const pkg = JSON.parse(
      readFileSync(join(dirname(__filename), "../../package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseTools(value: string): ManagedTool[] {
  const tools = value.split(",").map((t) => t.trim()).filter(Boolean);
  for (const tool of tools) {
    if (!isManagedTool(tool)) {
      throw new Error(`Unknown tool: ${tool}. Valid tools: ${MANAGED_TOOLS.join(", ")}`);
    }
  }
  return tools as ManagedTool[];
}

export async function runProfileDoctorChecks(cwd = process.cwd()): Promise<Check[]> {
  const checks: Check[] = [];
  const version = cliVersion();
  const baseUrl = resolveBaseUrl();
  const config = readConfig();
  const ext = readExtendedConfig();
  const session = readSession();
  const binDir = getBinDir();
  const manifest = readShimsManifest();

  checks.push({
    name: "CLI version",
    status: "ok",
    detail: version,
  });

  checks.push({
    name: "API URL",
    status: baseUrl.startsWith("http") ? "ok" : "error",
    detail: baseUrl,
    fix: "Run `behalf config set base-url <url>`.",
  });

  checks.push({
    name: "Auth",
    status: session || resolveApiKey() ? "ok" : "warn",
    detail: session ? "Session cookie present" : resolveApiKey() ? "API key configured" : "Not authenticated",
    fix: "Run `behalf login` or configure an API key.",
  });

  checks.push({
    name: "Workspace context",
    status: ext.workspaceId || ext.accountId ? "ok" : "warn",
    detail: ext.workspaceId ?? ext.accountId ?? "Unknown",
    fix: "Log in and complete account setup.",
  });

  checks.push({
    name: "Shim directory",
    status: existsSync(binDir) ? "ok" : "warn",
    detail: binDir,
    fix: "Run `behalf profile install`.",
  });

  for (const tool of MANAGED_TOOLS) {
    const shimPath = manifest.shims[tool]?.shimPath ?? join(binDir, tool);
    const installed = existsSync(shimPath);
    checks.push({
      name: `${tool} shim`,
      status: !installed ? "warn" : isBehalfManagedShim(shimPath) ? "ok" : "error",
      detail: installed
        ? isBehalfManagedShim(shimPath)
          ? shimPath
          : `${shimPath} (not managed shim)`
        : "Not installed",
      fix: installed && !isBehalfManagedShim(shimPath)
        ? "Remove the conflicting file or rename it, then run `behalf profile install`."
        : "Run `behalf profile install --tools " + tool + "`.",
    });

    const realPath = resolveRealBinaryPath(tool);
    checks.push({
      name: `${tool} real binary`,
      status: realPath ? "ok" : "warn",
      detail: realPath ?? "Not resolved",
      fix: `Install ${tool} and ensure it is on PATH before ${binDir}.`,
    });
  }

  const pathSample = manifest.shims.claude?.tool ?? "claude";
  const pathCheck = checkPathOrdering(pathSample as ManagedTool);
  checks.push({
    name: "PATH ordering",
    status: pathCheck.binDirPrecedesRealTool ? "ok" : "warn",
    detail: pathCheck.binDirPrecedesRealTool
      ? `${binDir} precedes real ${pathSample}`
      : `${binDir} is missing or after real ${pathSample} on PATH`,
    fix: pathCheck.pathHint ?? undefined,
  });

  const repoContext = detectRepoContext(cwd);
  checks.push({
    name: "Repo detection",
    status: isGitRepo(cwd) ? "ok" : "warn",
    detail: isGitRepo(cwd)
      ? `${repoContext.repoRoot ?? cwd} (policy hash: ${repoContext.policyRepoHash ?? "none"})`
      : "Not a git repository",
  });

  if (session || resolveApiKey()) {
    try {
      await apiRequest("/api/cli/session-policy", {
        method: "POST",
        body: {
          tool: "claude",
          cwd: "doctor",
          branch: "main",
          deviceId: getOrCreateDeviceId(),
          cliVersion: version,
        },
      });
      checks.push({ name: "Session policy API", status: "ok", detail: `${baseUrl}/api/cli/session-policy` });
    } catch (err) {
      checks.push({
        name: "Session policy API",
        status: "error",
        detail: err instanceof Error ? err.message : "Request failed",
      });
    }

    try {
      await apiRequest("/api/cli/pause", {
        method: "POST",
        body: { durationMinutes: 30 },
      });
      checks.push({ name: "Pause lease API", status: "error", detail: "Expected validation error" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      checks.push({
        name: "Pause lease API",
        status: message.toLowerCase().includes("reason") ? "ok" : "warn",
        detail: `${baseUrl}/api/cli/pause`,
      });
    }
  }

  return checks;
}

function profileInstallCommand() {
  return new Command("install")
    .description("install managed shims for claude, codex, and cursor")
    .option("--dry-run", "show what would be installed without writing files")
    .option("--tools <tools>", "comma-separated tools (claude,codex,cursor)", parseTools)
    .action(
      runAction(async (opts: { dryRun?: boolean; tools?: ManagedTool[] }) => {
        const results = installShims({ dryRun: opts.dryRun, tools: opts.tools });
        const binDir = getBinDir();

        if (isJsonMode()) {
          printJson({ binDir, results, pathLine: shellPathExportLine(binDir) });
          return;
        }

        for (const r of results) {
          if (r.status === "installed") {
            printSuccess(`  installed  ${r.tool}  →  ${r.shimPath}  (real: ${r.realPath})`);
          } else if (r.status === "refused") {
            printSuccess(`  refused    ${r.tool}  —  ${r.message}`);
          } else if (r.status === "missing_binary") {
            printSuccess(`  skipped    ${r.tool}  —  ${r.message}`);
          } else if (opts.dryRun) {
            printSuccess(`  dry-run    ${r.tool}  →  ${r.shimPath}  (real: ${r.realPath})`);
          }
        }

        const pathCheck = checkPathOrdering((opts.tools?.[0] ?? "claude") as ManagedTool);
        if (!pathCheck.binDirPrecedesRealTool) {
          console.log();
          console.log("Add managed profile shims to your PATH:");
          console.log(`  ${shellPathExportLine(binDir)}`);
          if (pathCheck.pathHint) console.log(pathCheck.pathHint);
        } else {
          console.log();
          console.log("Shims installed. PATH ordering looks correct.");
        }
      })
    );
}

function profileStatusCommand() {
  return new Command("status")
    .description("show managed profile shim and policy status")
    .option("--tool <tool>", "tool to evaluate policy for (claude, codex, cursor)")
    .action(
      runAction(async (opts: { tool?: string }) => {
        const tool = opts.tool && isManagedTool(opts.tool) ? opts.tool : undefined;
        const status = await getProfileStatus({ tool, cwd: process.cwd() });

        if (isJsonMode()) {
          printJson(status);
          return;
        }

        console.log();
        printKv({
          "shims installed": status.shimsInstalled ? status.installedTools.join(", ") : "no",
          "bin directory": getBinDir(),
          "PATH ordering": status.pathCheck?.binDirPrecedesRealTool ? "ok" : "needs attention",
          workspace: status.workspaceId ?? status.accountId ?? "(unknown)",
          "repo root": status.repo.repoRoot ?? "(not in git repo)",
          branch: status.repo.branch ?? "(unknown)",
          "git remote": status.repo.gitRemote ? "(detected)" : "(none)",
          "policy repo hash": status.repo.policyRepoHash ?? "(none)",
        });

        if (status.policy) {
          console.log();
          console.log("Policy");
          printKv({
            mode: status.policy.mode,
            profile: status.policy.profileName ?? status.policy.profileId ?? "(none)",
            reason: status.policy.reason,
            "session id": status.policy.sessionId,
            "cache ttl": `${status.policy.cacheTtlSeconds}s`,
            expires: status.policy.expiresAt ?? "(none)",
          });
        }

        if (status.pauseLease) {
          console.log();
          console.log("Pause lease (local mirror)");
          printKv({
            id: status.pauseLease.leaseId,
            scope: status.pauseLease.scope ?? "(unknown)",
            tool: status.pauseLease.tool ?? "(any)",
            repo: status.pauseLease.repo ?? "(none)",
            branch: status.pauseLease.branch ?? "(none)",
            device: status.pauseLease.deviceId ?? "(none)",
            expires: status.pauseLease.expiresAt,
            reason: status.pauseLease.reason,
          });
        }

        if (status.pathCheck && !status.pathCheck.binDirPrecedesRealTool) {
          console.log();
          console.log(status.pathCheck.pathHint ?? shellPathExportLine(getBinDir()));
        }
        console.log();
      })
    );
}

function profileDoctorCommand() {
  return new Command("doctor")
    .description("check managed profile shim installation and policy connectivity")
    .action(
      runAction(async () => {
        const checks = await runProfileDoctorChecks();

        if (isJsonMode()) {
          printJson(checks);
          return;
        }

        console.log();
        for (const c of checks) {
          const prefix = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
          const color =
            c.status === "ok" ? "\x1b[32m" :
            c.status === "warn" ? "\x1b[33m" :
            "\x1b[31m";
          console.log(`  ${color}${prefix}\x1b[0m  ${c.name.padEnd(22)}  ${c.detail}`);
          if (c.status !== "ok" && c.fix) console.log(`      fix: ${c.fix}`);
        }
        console.log();

        const errors = checks.filter((c) => c.status === "error");
        if (errors.length) process.exitCode = 1;
      })
    );
}

function profileSimulateCommand() {
  return new Command("simulate")
    .description("dry-run managed profile policy resolution without launching a tool")
    .option("--tool <tool>", "tool to simulate (claude, codex, cursor)", "claude")
    .option("--repo <hash>", "policy repo hash (defaults to detected repo hash)")
    .option("--branch <branch>", "git branch (defaults to detected branch)")
    .action(
      runAction(async (opts: { tool: string; repo?: string; branch?: string }) => {
        if (!isManagedTool(opts.tool)) {
          throw new Error(`Unknown tool: ${opts.tool}. Valid tools: ${MANAGED_TOOLS.join(", ")}`);
        }

        const cwd = process.cwd();
        const repoContext = detectRepoContext(cwd);
        const simulation = await simulateSessionPolicy({
          tool: opts.tool,
          cwd,
          repo: opts.repo ?? repoContext.policyRepoHash,
          branch: opts.branch ?? repoContext.branch,
        });

        if (isJsonMode()) {
          printJson(simulation);
          return;
        }

        const repoDisplay = opts.repo ?? repoContext.policyRepoHash ?? "none detected";
        const branchDisplay = opts.branch ?? repoContext.branch ?? "(unknown)";
        const pauseApprovalRequired =
          simulation.mode === "required" &&
          simulation.pausePolicy.requireApprovalForRequiredMode === true
            ? "yes"
            : "no";

        console.log();
        console.log("Managed profile simulation");
        printKv({
          tool: opts.tool,
          repo: repoDisplay,
          branch: branchDisplay,
          mode: simulation.mode,
          reason: simulation.reason,
          "matched rule": simulation.matchedRule?.type ?? "(none)",
          "pause approval required": pauseApprovalRequired,
        });
        console.log();
      })
    );
}

function profileUninstallCommand() {
  return new Command("uninstall")
    .description("remove managed profile shims")
    .option("--tools <tools>", "comma-separated tools to remove", parseTools)
    .option("--purge", "also clear shim metadata from config")
    .action(
      runAction(async (opts: { tools?: ManagedTool[]; purge?: boolean }) => {
        const results = uninstallShims({ tools: opts.tools, purge: opts.purge });
        const binDir = getBinDir();

        if (isJsonMode()) {
          printJson({ results, pathLine: shellPathExportLine(binDir) });
          return;
        }

        for (const r of results) {
          printSuccess(`  ${r.status.padEnd(8)}  ${r.tool}  (${r.shimPath})`);
        }
        console.log();
        console.log("You may remove this line from your shell config:");
        console.log(`  ${shellPathExportLine(binDir)}`);
        console.log();
      })
    );
}

export function profileCommand() {
  const cmd = new Command("profile")
    .description("install and manage CLI shims for automatic agent session policy");

  cmd.addCommand(profileInstallCommand());
  cmd.addCommand(profileStatusCommand());
  cmd.addCommand(profileSimulateCommand());
  cmd.addCommand(profileDoctorCommand());
  cmd.addCommand(profileUninstallCommand());

  return cmd;
}

export function shimLaunchCommand() {
  return new Command("__shim-launch")
    .description("internal: launch a tool through managed profile policy")
    .argument("<tool>", "tool name")
    .allowUnknownOption(true)
    .action(
      runAction(async (tool: string) => {
        if (!isManagedTool(tool)) {
          throw new Error(`Unknown tool: ${tool}`);
        }
        const args = process.argv.slice(process.argv.indexOf(tool) + 1);
        const { launchManagedTool } = await import("../lib/profile/policy.js");
        const code = await launchManagedTool({ tool, args });
        process.exit(code);
      })
    );
}

export function pauseCommand() {
  const cmd = new Command("pause")
    .description("request a server-approved pause lease (not a local bypass)");

  cmd
    .command("status <approvalRequestId>")
    .description("check the status of a pause approval request")
    .action(
      runAction(async (approvalRequestId: string) => {
        const status = await fetchPauseApprovalStatus(approvalRequestId);

        if (isJsonMode()) {
          printJson(status);
          if (status.status === "denied" || status.status === "expired") {
            process.exitCode = 1;
          }
          return;
        }

        console.log(formatPauseApprovalStatusMessage(status.status));
        if (status.status === "denied" || status.status === "expired") {
          process.exitCode = 1;
        }
      })
    );

  cmd
    .option("--duration <duration>", "pause duration, e.g. 30m or 2h")
    .option("--reason <reason>", "reason for the pause")
    .option("--scope <scope>", "pause scope: current_repo or all", "current_repo")
    .option("--tool <tool>", "tool to pause (claude, codex, cursor)")
    .option("--wait", "wait for dashboard approval and retry the same pause request once")
    .option(
      "--wait-timeout <duration>",
      "max time to wait for approval (default 10m, max 30m)"
    )
    .action(
      runAction(
        async (opts: {
          duration?: string;
          reason?: string;
          scope: string;
          tool?: string;
          wait?: boolean;
          waitTimeout?: string;
        }) => {
          if (!opts.duration) throw new Error("--duration is required.");
          if (!opts.reason) throw new Error("--reason is required.");

          const durationMinutes = parseDuration(opts.duration);
          const tool = opts.tool && isManagedTool(opts.tool) ? opts.tool : undefined;
          const pauseInput: RequestPauseInput = {
            durationMinutes,
            reason: opts.reason,
            scope: opts.scope === "all" ? "all" : "current_repo",
            tool,
          };

          const lease = await requestPauseLease(pauseInput);

          if (lease.granted) {
            if (isJsonMode()) {
              printJson(lease);
              return;
            }
            printSuccess(`Pause granted until ${lease.expiresAt}.`);
            printSuccess(lease.reason);
            return;
          }

          if (lease.approvalRequired) {
            if (opts.wait && lease.approvalRequestId) {
              const waitTimeoutMs = opts.waitTimeout
                ? parseWaitTimeout(opts.waitTimeout)
                : DEFAULT_PAUSE_WAIT_TIMEOUT_MS;

              if (!isJsonMode()) {
                for (const line of formatApprovalRequiredLines(lease)) {
                  printError(line);
                }
                printError("Waiting for approval...");
              }

              try {
                const granted = await waitForPauseApprovalGrant(
                  lease.approvalRequestId,
                  pauseInput,
                  waitTimeoutMs
                );
                if (isJsonMode()) {
                  printJson(granted);
                  return;
                }
                printSuccess(`Pause granted until ${granted.expiresAt}.`);
                printSuccess(granted.reason);
                return;
              } catch (err) {
                if (err instanceof PauseApprovalWaitError) {
                  if (isJsonMode()) {
                    printJson({ error: err.message, code: err.code });
                  } else {
                    printError(err.message);
                  }
                  process.exitCode = 1;
                  return;
                }
                throw err;
              }
            }

            if (isJsonMode()) {
              printJson(lease);
              process.exitCode = 1;
              return;
            }

            for (const line of formatApprovalRequiredLines(lease)) {
              printError(line);
            }
            process.exitCode = 1;
            return;
          }

          if (isJsonMode()) {
            printJson(lease);
            process.exitCode = 1;
            return;
          }

          throw new Error(lease.reason || "Pause denied by workspace policy.");
        }
      )
    );

  return cmd;
}

export function resumeCommand() {
  return new Command("resume")
    .description("clear an active local pause lease")
    .action(
      runAction(async () => {
        const active = readLocalPauseLease();
        await clearPauseLease();

        if (isJsonMode()) {
          printJson({ cleared: !!active, previousLeaseId: active?.leaseId ?? null });
          return;
        }

        if (active) {
          printSuccess(`Cleared pause lease ${active.leaseId}.`);
        } else {
          printSuccess("No active pause lease.");
        }
      })
    );
}

function parseDuration(value: string): number {
  const match = /^(\d+)(m|h)?$/i.exec(value.trim());
  if (!match) throw new Error("Duration must look like 30m or 2h.");
  const amount = Number(match[1]);
  const unit = (match[2] ?? "m").toLowerCase();
  const minutes = unit === "h" ? amount * 60 : amount;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Duration must be a positive number.");
  }
  return minutes;
}

export {
  installShims,
  uninstallShims,
  resolveRealBinaryPath,
  isBehalfManagedShim,
  generateShimContent,
  checkPathOrdering,
  parseDuration,
  resolveSessionPolicy,
  simulateSessionPolicy,
  requestPauseLease,
};
export {
  dashboardApprovalsUrl,
  fetchPauseApprovalStatus,
  formatApprovalRequiredLines,
  formatPauseApprovalStatusMessage,
  parseWaitTimeout,
  waitForPauseApprovalGrant,
  PauseApprovalWaitError,
  DEFAULT_PAUSE_WAIT_TIMEOUT_MS,
  MAX_PAUSE_WAIT_TIMEOUT_MS,
  PAUSE_APPROVAL_POLL_INTERVAL_MS,
} from "../lib/profile/pause-approval.js";

