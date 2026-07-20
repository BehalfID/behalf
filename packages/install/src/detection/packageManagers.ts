import type { OperatingSystemId, PackageManagerId } from "../types/index.js";
import type { CommandExistsFn } from "./fs.js";

const PACKAGE_MANAGERS: PackageManagerId[] = ["npm", "pnpm", "yarn", "bun"];

/** Detect which supported package managers are available on PATH. */
export async function detectPackageManagers(
  commandExists: CommandExistsFn,
): Promise<PackageManagerId[]> {
  const found: PackageManagerId[] = [];
  for (const manager of PACKAGE_MANAGERS) {
    if (await commandExists(manager)) {
      found.push(manager);
    }
  }
  return found;
}

/** Map Node's process.platform to the installer OS id. */
export function resolveOperatingSystem(
  platform: NodeJS.Platform = process.platform,
): OperatingSystemId {
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
