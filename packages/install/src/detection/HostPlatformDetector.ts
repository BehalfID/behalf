import { homedir } from "node:os";
import type { PlatformDetector } from "../interfaces/PlatformDetector.js";
import { InstallerException } from "../installer/errors.js";
import type {
  DetectedClient,
  DetectedEnvironment,
  OperatingSystemId,
  PackageManagerId,
} from "../types/index.js";
import { detectAllClients } from "./clients/index.js";
import {
  createCommandExists,
  pathExists as defaultPathExists,
  type CommandExistsFn,
  type PathExistsFn,
} from "./fs.js";
import { detectPackageManagers, resolveOperatingSystem } from "./packageManagers.js";
import type { DetectionPathContext } from "./paths.js";

export interface HostPlatformDetectorOptions {
  homeDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  nodeVersion?: string;
  pathEnv?: string;
  pathExists?: PathExistsFn;
  commandExists?: CommandExistsFn;
}

/**
 * Read-only host detector for OS, package managers, and AI coding clients.
 * Never modifies configuration files.
 */
export class HostPlatformDetector implements PlatformDetector {
  private readonly homeDir: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly nodeVersion: string;
  private readonly pathExists: PathExistsFn;
  private readonly commandExists: CommandExistsFn;

  constructor(options: HostPlatformDetectorOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.nodeVersion = options.nodeVersion ?? process.version;
    this.pathExists = options.pathExists ?? defaultPathExists;
    this.commandExists =
      options.commandExists ??
      createCommandExists({
        ...(options.pathEnv !== undefined
          ? { pathEnv: options.pathEnv }
          : this.env.PATH !== undefined
            ? { pathEnv: this.env.PATH }
            : {}),
        platform: this.platform,
        pathExists: this.pathExists,
      });
  }

  detectOs(): OperatingSystemId {
    try {
      return resolveOperatingSystem(this.platform);
    } catch (error) {
      throw new InstallerException({
        code: "UNSUPPORTED_PLATFORM",
        message: error instanceof Error ? error.message : String(error),
        remediation: "BehalfID install currently supports macOS, Linux, and Windows.",
        details: { platform: this.platform },
      });
    }
  }

  async detectPackageManagers(): Promise<PackageManagerId[]> {
    return detectPackageManagers(this.commandExists);
  }

  async detectClients(): Promise<DetectedClient[]> {
    const ctx = this.createPathContext();
    return detectAllClients({
      ctx,
      pathExists: this.pathExists,
      commandExists: this.commandExists,
    });
  }

  async detectEnvironment(): Promise<DetectedEnvironment> {
    const os = this.detectOs();
    const [packageManagers, clients] = await Promise.all([
      this.detectPackageManagers(),
      this.detectClients(),
    ]);

    return {
      os,
      arch: this.arch,
      nodeVersion: this.nodeVersion,
      packageManagers,
      clients,
      homeDir: this.homeDir,
      cwd: this.cwd,
    };
  }

  private createPathContext(): DetectionPathContext {
    return {
      homeDir: this.homeDir,
      cwd: this.cwd,
      os: this.detectOs(),
      env: this.env,
    };
  }
}

export function createHostPlatformDetector(
  options: HostPlatformDetectorOptions = {},
): HostPlatformDetector {
  return new HostPlatformDetector(options);
}
