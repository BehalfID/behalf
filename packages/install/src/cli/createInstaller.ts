import { HostPlatformDetector } from "../detection/HostPlatformDetector.js";
import { BehalfInstaller } from "../installer/BehalfInstaller.js";
import type { BehalfInstallerDependencies } from "../installer/BehalfInstaller.js";
import { FileMcpConfigManager } from "../mcp/FileMcpConfigManager.js";
import { createDefaultRuntimeCatalog } from "../runtime/catalog.js";
import { MemoryRuntimeRegistrar } from "../runtime/MemoryRuntimeRegistrar.js";
import { FileStateManager } from "../state/FileStateManager.js";
import type { FileStateManagerOptions } from "../state/FileStateManager.js";
import { InstallationVerifier } from "../verification/InstallationVerifier.js";

export interface CreateDefaultInstallerOptions {
  stateManager?: FileStateManagerOptions;
  homeDir?: string;
  cwd?: string;
  runtimeVersion?: string;
  installerVersion?: string;
  /** Override dependencies entirely (tests). */
  overrides?: Partial<BehalfInstallerDependencies>;
}

/**
 * Build a production {@link BehalfInstaller} wired with the default collaborators
 * implemented in phases 3–6.
 */
export function createDefaultInstaller(
  options: CreateDefaultInstallerOptions = {},
): BehalfInstaller {
  const stateManager = new FileStateManager(options.stateManager);
  const configManager = new FileMcpConfigManager();
  const detector = new HostPlatformDetector({
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
  const runtimeRegistrar = new MemoryRuntimeRegistrar();
  const verifier = new InstallationVerifier({ stateManager, configManager });
  const catalog = createDefaultRuntimeCatalog();

  const deps: BehalfInstallerDependencies = {
    detector,
    configManager,
    runtimeRegistrar,
    stateManager,
    verifier,
    createRuntimeRegistration: (input) =>
      catalog.get("mcp-runtime")!.createRegistration(input),
    ...(options.runtimeVersion !== undefined ? { runtimeVersion: options.runtimeVersion } : {}),
    ...(options.installerVersion !== undefined
      ? { installerVersion: options.installerVersion }
      : {}),
    ...options.overrides,
  };

  return new BehalfInstaller(deps);
}
