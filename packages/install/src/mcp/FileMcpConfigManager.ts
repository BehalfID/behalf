import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpConfigManager } from "../interfaces/McpConfigManager.js";
import { InstallerException } from "../installer/errors.js";
import { atomicWriteFile } from "../state/atomicWrite.js";
import { pathExists } from "../detection/fs.js";
import type {
  ConfigBackup,
  McpConfiguration,
  RuntimeRegistrationInput,
} from "../types/index.js";
import {
  parseMcpConfigContents,
  runtimeToServerEntry,
  serializeMcpConfig,
} from "./codec.js";
import { detectMcpConfigFormat, refineMcpConfigFormat, type McpConfigFormat } from "./format.js";
import { getServerMap, removeServerEntry, upsertServerEntry } from "./servers.js";

const MISSING_BACKUP_SUFFIX = ".behalf-bak.missing";

export interface FileMcpConfigManagerOptions {
  /** Override format detection (useful in tests). */
  formatForPath?: (configPath: string) => McpConfigFormat;
}

/**
 * File-backed MCP configuration manager.
 * Preserves unrelated settings, avoids duplicate server entries, and supports rollback.
 */
export class FileMcpConfigManager implements McpConfigManager {
  private readonly formatForPath: (configPath: string) => McpConfigFormat;

  constructor(options: FileMcpConfigManagerOptions = {}) {
    this.formatForPath = options.formatForPath ?? detectMcpConfigFormat;
  }

  async read(configPath: string): Promise<McpConfiguration> {
    if (!(await pathExists(configPath))) {
      return {};
    }

    let raw: string;
    try {
      raw = await readFile(configPath, "utf8");
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_READ_FAILED",
        message: `Failed to read MCP configuration at ${configPath}`,
        cause: error,
        details: { configPath },
      });
    }

    const pathFormat = this.formatForPath(configPath);
    try {
      return parseMcpConfigContents(raw, pathFormat);
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_INVALID",
        message: `MCP configuration at ${configPath} is invalid`,
        cause: error,
        remediation: "Fix or move the configuration file, then retry installation.",
        details: { configPath },
      });
    }
  }

  async write(configPath: string, config: McpConfiguration): Promise<void> {
    const format = await this.resolveFormat(configPath, config);
    const payload = serializeMcpConfig(config, format);

    try {
      await atomicWriteFile(configPath, payload);
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_WRITE_FAILED",
        message: `Failed to write MCP configuration at ${configPath}`,
        cause: error,
        details: { configPath, format },
      });
    }
  }

  async backup(configPath: string): Promise<ConfigBackup> {
    const createdAt = new Date().toISOString();
    const stamp = createdAt.replace(/[:.]/g, "-");

    try {
      await mkdir(dirname(configPath), { recursive: true });

      if (!(await pathExists(configPath))) {
        const backupPath = `${configPath}.${stamp}${MISSING_BACKUP_SUFFIX}`;
        await atomicWriteFile(
          backupPath,
          `${JSON.stringify({ missing: true, originalPath: configPath })}\n`,
        );
        return { originalPath: configPath, backupPath, createdAt };
      }

      const backupPath = `${configPath}.${stamp}.behalf-bak`;
      await copyFile(configPath, backupPath);
      return { originalPath: configPath, backupPath, createdAt };
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_BACKUP_FAILED",
        message: `Failed to back up MCP configuration at ${configPath}`,
        cause: error,
        details: { configPath },
      });
    }
  }

  async restore(backup: ConfigBackup): Promise<void> {
    try {
      if (backup.backupPath.includes(MISSING_BACKUP_SUFFIX)) {
        if (await pathExists(backup.originalPath)) {
          await unlink(backup.originalPath);
        }
        return;
      }

      if (!(await pathExists(backup.backupPath))) {
        throw new Error(`Backup file does not exist: ${backup.backupPath}`);
      }

      await mkdir(dirname(backup.originalPath), { recursive: true });
      await copyFile(backup.backupPath, backup.originalPath);
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_WRITE_FAILED",
        message: `Failed to restore MCP configuration backup for ${backup.originalPath}`,
        cause: error,
        remediation: "Manually copy the backup file back into place if needed.",
        details: {
          originalPath: backup.originalPath,
          backupPath: backup.backupPath,
        },
      });
    }
  }

  async registerRuntime(
    configPath: string,
    runtime: RuntimeRegistrationInput,
  ): Promise<void> {
    const existing = await this.read(configPath);
    const format = await this.resolveFormat(configPath, existing);
    const entry = runtimeToServerEntry(runtime, format);
    const next = upsertServerEntry(existing, format, runtime.serverName, entry);
    await this.write(configPath, next);
  }

  async unregisterRuntime(configPath: string, serverName: string): Promise<void> {
    if (!(await pathExists(configPath))) {
      return;
    }

    const existing = await this.read(configPath);
    const format = await this.resolveFormat(configPath, existing);
    if (!(serverName in getServerMap(existing, format))) {
      return;
    }

    const next = removeServerEntry(existing, format, serverName);
    await this.write(configPath, next);
  }

  async hasRuntime(configPath: string, serverName: string): Promise<boolean> {
    if (!(await pathExists(configPath))) {
      return false;
    }

    const existing = await this.read(configPath);
    const format = await this.resolveFormat(configPath, existing);
    return Object.prototype.hasOwnProperty.call(
      getServerMap(existing, format),
      serverName,
    );
  }

  private async resolveFormat(
    configPath: string,
    config: McpConfiguration,
  ): Promise<McpConfigFormat> {
    const pathFormat = this.formatForPath(configPath);
    if (pathFormat === "codex-toml") {
      return "codex-toml";
    }

    if (await pathExists(configPath)) {
      return refineMcpConfigFormat(pathFormat, config);
    }

    return pathFormat;
  }
}

export function createFileMcpConfigManager(
  options: FileMcpConfigManagerOptions = {},
): FileMcpConfigManager {
  return new FileMcpConfigManager(options);
}
