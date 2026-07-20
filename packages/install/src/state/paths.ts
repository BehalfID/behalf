import { homedir } from "node:os";
import { join } from "node:path";

/** Directory name under the user home directory for BehalfID installer data. */
export const BEHALF_CONFIG_DIR_NAME = ".behalfid";

/** Default installation state file name. */
export const INSTALLATION_STATE_FILE_NAME = "install-state.json";

/**
 * Resolve the BehalfID configuration directory.
 * Honors BEHALF_HOME when set (useful for tests and custom layouts).
 */
export function resolveBehalfConfigDir(homeDir: string = homedir()): string {
  const override = process.env.BEHALF_HOME?.trim();
  if (override) {
    return override;
  }
  return join(homeDir, BEHALF_CONFIG_DIR_NAME);
}

/** Resolve the default installation state file path. */
export function resolveInstallationStatePath(homeDir: string = homedir()): string {
  return join(resolveBehalfConfigDir(homeDir), INSTALLATION_STATE_FILE_NAME);
}
