import type { McpConfigManager } from "../interfaces/McpConfigManager.js";
import type { ConfigBackup, InstallerError, OperationWarning } from "../types/index.js";
import { createInstallerError, InstallerException } from "./errors.js";

export interface RollbackResult {
  restored: string[];
  errors: InstallerError[];
  warnings: OperationWarning[];
}

/**
 * Tracks configuration backups taken during an install/upgrade/uninstall
 * so failures can restore prior state without corrupting user config.
 */
export class InstallTransaction {
  private readonly backups: ConfigBackup[] = [];

  constructor(private readonly configManager: McpConfigManager) {}

  /** Backups captured so far, in capture order. */
  get capturedBackups(): readonly ConfigBackup[] {
    return this.backups;
  }

  /**
   * Create and record a backup for `configPath` before mutation.
   * If the path was already backed up in this transaction, returns the existing backup.
   */
  async backup(configPath: string): Promise<ConfigBackup> {
    const existing = this.backups.find((backup) => backup.originalPath === configPath);
    if (existing) {
      return existing;
    }

    try {
      const backup = await this.configManager.backup(configPath);
      this.backups.push(backup);
      return backup;
    } catch (error) {
      throw new InstallerException({
        code: "CONFIG_BACKUP_FAILED",
        message: `Failed to back up configuration at ${configPath}`,
        cause: error,
        remediation: "Ensure the configuration path is readable and the backup directory is writable.",
        details: { configPath },
      });
    }
  }

  /**
   * Restore captured backups in reverse order.
   * Continues restoring remaining backups if one restore fails.
   */
  async rollback(): Promise<RollbackResult> {
    const restored: string[] = [];
    const errors: InstallerError[] = [];
    const warnings: OperationWarning[] = [];

    for (const backup of [...this.backups].reverse()) {
      try {
        await this.configManager.restore(backup);
        restored.push(backup.originalPath);
      } catch (error) {
        const installerError = createInstallerError(
          "ROLLBACK_FAILED",
          `Failed to restore configuration backup for ${backup.originalPath}`,
          {
            cause: error instanceof Error ? error.message : String(error),
            remediation:
              "Manually restore the configuration from the backup file listed in details.",
            details: {
              originalPath: backup.originalPath,
              backupPath: backup.backupPath,
            },
          },
        );
        errors.push(installerError);
      }
    }

    return { restored, errors, warnings };
  }
}
