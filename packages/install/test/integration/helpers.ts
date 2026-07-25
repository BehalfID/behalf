import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostPlatformDetector } from "../../src/detection/HostPlatformDetector.js";
import type { CommandExistsFn } from "../../src/detection/fs.js";
import type { McpConfigManager } from "../../src/interfaces/McpConfigManager.js";
import type { BehalfInstallerDependencies } from "../../src/installer/BehalfInstaller.js";
import { BehalfInstaller } from "../../src/installer/BehalfInstaller.js";
import { FileMcpConfigManager } from "../../src/mcp/FileMcpConfigManager.js";
import type {
  McpConfiguration,
  RuntimeRegistrationInput,
} from "../../src/types/index.js";
import { MemoryRuntimeRegistrar } from "../../src/runtime/MemoryRuntimeRegistrar.js";
import { createDefaultRuntimeCatalog } from "../../src/runtime/catalog.js";
import { FileStateManager } from "../../src/state/FileStateManager.js";
import { InstallationVerifier } from "../../src/verification/InstallationVerifier.js";
import type { FetchLike } from "../../src/verification/endpoint.js";

export interface IntegrationPaths {
  homeDir: string;
  cwd: string;
  stateFile: string;
  cursorMcp: string;
  vscodeMcp: string;
  codexConfig: string;
  windsurfMcp: string;
  claudeCodeMcp: string;
  claudeDesktopMcp: string;
}

export interface IntegrationFixture {
  root: string;
  paths: IntegrationPaths;
  installer: BehalfInstaller;
  configManager: FileMcpConfigManager;
  stateManager: FileStateManager;
  detector: HostPlatformDetector;
  cleanup(): Promise<void>;
}

export interface CreateIntegrationFixtureOptions {
  /** Package managers reported by the detector. */
  packageManagers?: Array<"npm" | "pnpm" | "yarn" | "bun">;
  runtimeVersion?: string;
  installerVersion?: string;
  fetchImpl?: FetchLike;
  configManager?: McpConfigManager;
}

const tempRoots: string[] = [];

/** Remove all integration fixture roots created during the test run. */
export async function cleanupAllIntegrationFixtures(): Promise<void> {
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

/**
 * Create a temp host layout with real MCP config files and a production installer stack.
 */
export async function createIntegrationFixture(
  options: CreateIntegrationFixtureOptions = {},
): Promise<IntegrationFixture> {
  const root = await mkdtemp(join(tmpdir(), "behalf-install-int-"));
  tempRoots.push(root);

  const homeDir = join(root, "home");
  const cwd = join(root, "project");
  const paths: IntegrationPaths = {
    homeDir,
    cwd,
    stateFile: join(homeDir, ".behalfid", "install-state.json"),
    cursorMcp: join(homeDir, ".cursor", "mcp.json"),
    vscodeMcp: join(cwd, ".vscode", "mcp.json"),
    codexConfig: join(homeDir, ".codex", "config.toml"),
    windsurfMcp: join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
    claudeCodeMcp: join(homeDir, ".claude.json"),
    claudeDesktopMcp: join(homeDir, ".config", "Claude", "claude_desktop_config.json"),
  };

  await mkdir(join(homeDir, ".cursor"), { recursive: true });
  await mkdir(join(cwd, ".vscode"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await mkdir(join(homeDir, ".codeium", "windsurf"), { recursive: true });
  await mkdir(join(homeDir, ".config", "Claude"), { recursive: true });

  await writeFile(
    paths.cursorMcp,
    `${JSON.stringify({ mcpServers: { filesystem: { command: "npx", args: ["-y", "fs"] } } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    paths.vscodeMcp,
    `${JSON.stringify({ servers: { github: { type: "stdio", command: "gh" } } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    paths.codexConfig,
    'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "echo"\n',
    "utf8",
  );
  await writeFile(
    paths.windsurfMcp,
    `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    paths.claudeCodeMcp,
    `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    paths.claudeDesktopMcp,
    `${JSON.stringify({ mcpServers: { desktop: { command: "echo" } } }, null, 2)}\n`,
    "utf8",
  );

  const packageManagers = new Set(options.packageManagers ?? ["npm", "pnpm"]);
  const commandExists: CommandExistsFn = async (command) =>
    packageManagers.has(command as "npm" | "pnpm" | "yarn" | "bun");

  const detector = new HostPlatformDetector({
    homeDir,
    cwd,
    platform: "linux",
    env: {},
    commandExists,
  });

  const configManager =
    options.configManager instanceof FileMcpConfigManager
      ? options.configManager
      : new FileMcpConfigManager();

  const stateManager = new FileStateManager({ stateFilePath: paths.stateFile });
  const runtimeRegistrar = new MemoryRuntimeRegistrar();
  const catalog = createDefaultRuntimeCatalog();

  const verifier = new InstallationVerifier({
    stateManager,
    configManager,
    installerVersion: options.installerVersion ?? "0.1.0",
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

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
  };

  const installer = new BehalfInstaller(deps);

  return {
    root,
    paths,
    installer,
    configManager,
    stateManager,
    detector,
    async cleanup() {
      const index = tempRoots.indexOf(root);
      if (index >= 0) {
        tempRoots.splice(index, 1);
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** MCP config manager wrapper that fails registration for specific paths. */
export class FailOnRegisterMcpConfigManager implements McpConfigManager {
  constructor(
    private readonly inner: FileMcpConfigManager,
    private readonly failPaths: Set<string>,
  ) {}

  read(configPath: string): Promise<McpConfiguration> {
    return this.inner.read(configPath);
  }
  write(configPath: string, config: McpConfiguration): Promise<void> {
    return this.inner.write(configPath, config);
  }
  backup(configPath: string) {
    return this.inner.backup(configPath);
  }
  restore(backup: Parameters<FileMcpConfigManager["restore"]>[0]) {
    return this.inner.restore(backup);
  }
  async registerRuntime(
    configPath: string,
    runtime: RuntimeRegistrationInput,
  ): Promise<void> {
    if (this.failPaths.has(configPath)) {
      throw new Error(`forced register failure for ${configPath}`);
    }
    return this.inner.registerRuntime(configPath, runtime);
  }
  unregisterRuntime(configPath: string, serverName: string): Promise<void> {
    return this.inner.unregisterRuntime(configPath, serverName);
  }
  hasRuntime(configPath: string, serverName: string): Promise<boolean> {
    return this.inner.hasRuntime(configPath, serverName);
  }
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export const mockFetchOk: FetchLike = async () => ({ status: 200, ok: true });
