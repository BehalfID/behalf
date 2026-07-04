import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_PATH, readExtendedConfig, writeExtendedConfig } from "../config.js";
import { SHIM_MARKER, SHIMS_FILE_NAME, type ManagedTool } from "./constants.js";
import { getBinDir, resolveOnPath } from "./path.js";

export type ShimRecord = {
  tool: ManagedTool;
  shimPath: string;
  realPath: string;
  installedAt: string;
};

export type ShimsManifest = {
  version: 1;
  shims: Record<string, ShimRecord>;
};

export { getBinDir };

export function getShimsFilePath(): string {
  return join(CONFIG_DIR_PATH, SHIMS_FILE_NAME);
}

export function readShimsManifest(): ShimsManifest {
  const path = getShimsFilePath();
  if (!existsSync(path)) {
    return { version: 1, shims: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ShimsManifest;
  } catch {
    return { version: 1, shims: {} };
  }
}

export function writeShimsManifest(manifest: ShimsManifest): void {
  if (!existsSync(CONFIG_DIR_PATH)) mkdirSync(CONFIG_DIR_PATH, { recursive: true });
  writeFileSync(getShimsFilePath(), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
}

export function isBehalfManagedShim(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.includes(SHIM_MARKER);
  } catch {
    return false;
  }
}

export function resolveRealBinaryPath(tool: ManagedTool, binDir = getBinDir()): string | null {
  const manifest = readShimsManifest();
  const existing = manifest.shims[tool]?.realPath;
  if (existing && existsSync(existing) && !existing.startsWith(binDir)) {
    return existing;
  }

  const resolved = resolveOnPath(tool, binDir);
  if (!resolved) return null;
  if (resolved.startsWith(binDir)) return null;
  return resolved;
}

function resolveBehalfBinary(): string {
  const binDir = getBinDir();
  const onPath = resolveOnPath("behalf", binDir);
  if (onPath) return onPath;
  return "behalf";
}

export function generateShimContent(tool: ManagedTool): string {
  const behalfBin = resolveBehalfBinary();
  if (process.platform === "win32") {
    return `@echo off\r\nREM ${SHIM_MARKER} tool=${tool}\r\n"${behalfBin}" __shim-launch ${tool} %*\r\n`;
  }
  return `#!/usr/bin/env bash
# ${SHIM_MARKER} tool=${tool}
set -euo pipefail
exec "${behalfBin}" __shim-launch ${tool} "$@"
`;
}

export type InstallOptions = {
  tools?: ManagedTool[];
  dryRun?: boolean;
};

export type InstallResult = {
  tool: ManagedTool;
  status: "installed" | "skipped" | "refused" | "missing_binary";
  shimPath: string;
  realPath: string | null;
  message?: string;
};

export function installShims(opts: InstallOptions = {}): InstallResult[] {
  const tools = opts.tools ?? (["claude", "codex", "cursor"] as ManagedTool[]);
  const binDir = getBinDir();
  const results: InstallResult[] = [];

  if (!opts.dryRun && !existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true, mode: 0o700 });
  }

  const manifest = readShimsManifest();

  for (const tool of tools) {
    const ext = process.platform === "win32" ? ".cmd" : "";
    const shimPath = join(binDir, tool + ext);
    const realPath = resolveRealBinaryPath(tool, binDir);

    if (!realPath) {
      results.push({
        tool,
        status: "missing_binary",
        shimPath,
        realPath: null,
        message: `${tool} not found on PATH (excluding ${binDir}). Install ${tool} first.`,
      });
      continue;
    }

    if (existsSync(shimPath) && !isBehalfManagedShim(shimPath)) {
      results.push({
        tool,
        status: "refused",
        shimPath,
        realPath,
        message: `Refusing to overwrite non-managed file: ${shimPath}`,
      });
      continue;
    }

    const content = generateShimContent(tool);
    if (!opts.dryRun) {
      writeFileSync(shimPath, content, { mode: 0o755 });
      if (process.platform !== "win32") {
        try {
          chmodSync(shimPath, 0o755);
        } catch {
          // best effort
        }
      }
      manifest.shims[tool] = {
        tool,
        shimPath,
        realPath,
        installedAt: new Date().toISOString(),
      };
    }

    results.push({
      tool,
      status: existsSync(shimPath) && isBehalfManagedShim(shimPath) && opts.dryRun
        ? "skipped"
        : "installed",
      shimPath,
      realPath,
    });
  }

  if (!opts.dryRun) {
    writeShimsManifest(manifest);
    writeExtendedConfig({
      realBinaryPaths: Object.fromEntries(
        Object.values(manifest.shims).map((s) => [s.tool, s.realPath])
      ),
    });
  }

  return results;
}

export type UninstallOptions = {
  tools?: ManagedTool[];
  purge?: boolean;
};

export type UninstallResult = {
  tool: ManagedTool;
  status: "removed" | "skipped" | "not_found";
  shimPath: string;
};

export function uninstallShims(opts: UninstallOptions = {}): UninstallResult[] {
  const tools = opts.tools ?? (["claude", "codex", "cursor"] as ManagedTool[]);
  const manifest = readShimsManifest();
  const results: UninstallResult[] = [];

  for (const tool of tools) {
    const ext = process.platform === "win32" ? ".cmd" : "";
    const shimPath = join(getBinDir(), tool + ext);

    if (!existsSync(shimPath)) {
      results.push({ tool, status: "not_found", shimPath });
      delete manifest.shims[tool];
      continue;
    }

    if (!isBehalfManagedShim(shimPath)) {
      results.push({ tool, status: "skipped", shimPath });
      continue;
    }

    unlinkSync(shimPath);
    delete manifest.shims[tool];
    results.push({ tool, status: "removed", shimPath });
  }

  writeShimsManifest(manifest);

  if (opts.purge) {
    writeExtendedConfig({
      realBinaryPaths: undefined,
      lastPolicyCacheKey: undefined,
      pauseLeaseId: undefined,
    });
  } else {
    writeExtendedConfig({
      realBinaryPaths: Object.fromEntries(
        Object.values(manifest.shims).map((s) => [s.tool, s.realPath])
      ),
    });
  }

  return results;
}

/** Detect if current process was invoked through a managed shim. */
export function detectShimTool(argv = process.argv): ManagedTool | null {
  const shimLaunchIdx = argv.indexOf("__shim-launch");
  if (shimLaunchIdx >= 0 && argv[shimLaunchIdx + 1]) {
    const tool = argv[shimLaunchIdx + 1];
    if (tool === "claude" || tool === "codex" || tool === "cursor") return tool;
  }
  return null;
}

export function shimContainsSecrets(content: string): boolean {
  return (
    /bhf_sk_/i.test(content) ||
    /bhf_dev_/i.test(content) ||
    /Bearer\s+/i.test(content)
  );
}

export function policyCacheKey(tool: string, repoRoot: string | null, branch: string | null): string {
  const raw = `${tool}|${repoRoot ?? ""}|${branch ?? ""}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function createLocalSessionId(): string {
  return `sess_${randomBytes(12).toString("base64url")}`;
}
