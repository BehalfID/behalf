import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HostPlatformDetector } from "../../src/detection/HostPlatformDetector.js";
import {
  claudeDesktopPaths,
  cursorPaths,
  vscodePaths,
  windsurfPaths,
} from "../../src/detection/paths.js";
import { resolveOperatingSystem } from "../../src/detection/packageManagers.js";
import { InstallerException } from "../../src/installer/errors.js";

function createFakeFs(existing: Set<string>) {
  return async (path: string) => existing.has(path);
}

function createFakeCommands(commands: Set<string>) {
  return async (command: string) => commands.has(command);
}

describe("resolveOperatingSystem", () => {
  it("maps supported platforms", () => {
    expect(resolveOperatingSystem("darwin")).toBe("darwin");
    expect(resolveOperatingSystem("linux")).toBe("linux");
    expect(resolveOperatingSystem("win32")).toBe("win32");
  });

  it("rejects unsupported platforms", () => {
    expect(() => resolveOperatingSystem("freebsd")).toThrow(/Unsupported platform/);
  });
});

describe("path helpers", () => {
  it("resolves Claude Desktop paths per OS", () => {
    expect(
      claudeDesktopPaths({
        homeDir: "/Users/me",
        cwd: "/Users/me/project",
        os: "darwin",
        env: {},
      }).mcpConfigPath,
    ).toBe(join("/Users/me", "Library", "Application Support", "Claude", "claude_desktop_config.json"));

    expect(
      claudeDesktopPaths({
        homeDir: "C:\\Users\\me",
        cwd: "C:\\Users\\me\\project",
        os: "win32",
        env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
      }).mcpConfigPath,
    ).toBe(join("C:\\Users\\me\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));

    expect(
      claudeDesktopPaths({
        homeDir: "/home/me",
        cwd: "/home/me/project",
        os: "linux",
        env: {},
      }).mcpConfigPath,
    ).toBe(join("/home/me", ".config", "Claude", "claude_desktop_config.json"));
  });

  it("resolves Cursor and Windsurf canonical MCP paths", () => {
    const ctx = {
      homeDir: "/home/me",
      cwd: "/home/me/project",
      os: "linux" as const,
      env: {},
    };
    expect(cursorPaths(ctx).mcpConfigPath).toBe(join("/home/me", ".cursor", "mcp.json"));
    expect(windsurfPaths(ctx).mcpConfigPath).toBe(
      join("/home/me", ".codeium", "windsurf", "mcp_config.json"),
    );
    expect(vscodePaths(ctx).mcpConfigPath).toBe(
      join("/home/me/project", ".vscode", "mcp.json"),
    );
  });
});

describe("HostPlatformDetector", () => {
  it("detects package managers present on PATH", async () => {
    const detector = new HostPlatformDetector({
      homeDir: "/home/me",
      cwd: "/home/me/project",
      platform: "linux",
      pathExists: createFakeFs(new Set()),
      commandExists: createFakeCommands(new Set(["npm", "pnpm"])),
    });

    await expect(detector.detectPackageManagers()).resolves.toEqual(["npm", "pnpm"]);
  });

  it("detects installed clients and reports MCP paths", async () => {
    const homeDir = "/home/me";
    const cwd = "/home/me/project";
    const existing = new Set([
      join(homeDir, ".cursor"),
      join(homeDir, ".claude"),
      join(homeDir, ".codex"),
      join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
      join(homeDir, ".config", "Code"),
      join(homeDir, ".config", "Claude", "claude_desktop_config.json"),
    ]);

    const detector = new HostPlatformDetector({
      homeDir,
      cwd,
      platform: "linux",
      env: {},
      pathExists: createFakeFs(existing),
      commandExists: createFakeCommands(new Set(["claude", "codex", "code"])),
    });

    const clients = await detector.detectClients();
    const byId = Object.fromEntries(clients.map((client) => [client.id, client]));

    expect(clients).toHaveLength(6);
    expect(byId.cursor?.installed).toBe(true);
    expect(byId.cursor?.configPaths.mcpConfigPath).toBe(join(homeDir, ".cursor", "mcp.json"));

    expect(byId["claude-code"]?.installed).toBe(true);
    expect(byId["claude-code"]?.configPaths.mcpConfigPath).toBe(
      join(homeDir, ".claude.json"),
    );

    expect(byId["claude-desktop"]?.installed).toBe(true);
    expect(byId["claude-desktop"]?.configPaths.mcpConfigPath).toBe(
      join(homeDir, ".config", "Claude", "claude_desktop_config.json"),
    );

    expect(byId.codex?.installed).toBe(true);
    expect(byId.codex?.configPaths.mcpConfigPath).toBe(
      join(homeDir, ".codex", "config.toml"),
    );

    expect(byId.vscode?.installed).toBe(true);
    expect(byId.vscode?.configPaths.mcpConfigPath).toBe(join(cwd, ".vscode", "mcp.json"));

    expect(byId.windsurf?.installed).toBe(true);
    expect(byId.windsurf?.configPaths.mcpConfigPath).toBe(
      join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
    );
  });

  it("prefers Claude Code project .mcp.json when present", async () => {
    const homeDir = "/home/me";
    const cwd = "/home/me/project";
    const existing = new Set([
      join(homeDir, ".claude"),
      join(cwd, ".mcp.json"),
    ]);

    const detector = new HostPlatformDetector({
      homeDir,
      cwd,
      platform: "linux",
      pathExists: createFakeFs(existing),
      commandExists: createFakeCommands(new Set()),
    });

    const clients = await detector.detectClients();
    const claudeCode = clients.find((client) => client.id === "claude-code");
    expect(claudeCode?.configPaths.mcpConfigPath).toBe(join(cwd, ".mcp.json"));
  });

  it("marks missing clients as not installed without MCP paths", async () => {
    const detector = new HostPlatformDetector({
      homeDir: "/home/me",
      cwd: "/home/me/project",
      platform: "linux",
      pathExists: createFakeFs(new Set()),
      commandExists: createFakeCommands(new Set()),
    });

    const clients = await detector.detectClients();
    expect(clients.every((client) => client.installed === false)).toBe(true);
    expect(clients.every((client) => client.configPaths.mcpConfigPath === undefined)).toBe(
      true,
    );
  });

  it("builds a full environment snapshot", async () => {
    const detector = new HostPlatformDetector({
      homeDir: "/home/me",
      cwd: "/work",
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v22.0.0",
      pathExists: createFakeFs(new Set([join("/home/me", ".cursor")])),
      commandExists: createFakeCommands(new Set(["npm", "bun"])),
    });

    const env = await detector.detectEnvironment();
    expect(env).toMatchObject({
      os: "darwin",
      arch: "arm64",
      nodeVersion: "v22.0.0",
      packageManagers: ["npm", "bun"],
      homeDir: "/home/me",
      cwd: "/work",
    });
    expect(env.clients.find((client) => client.id === "cursor")?.installed).toBe(true);
  });

  it("throws UNSUPPORTED_PLATFORM for unknown OS", () => {
    const detector = new HostPlatformDetector({
      platform: "freebsd",
      pathExists: createFakeFs(new Set()),
      commandExists: createFakeCommands(new Set()),
    });

    expect(() => detector.detectOs()).toThrow(InstallerException);
    try {
      detector.detectOs();
    } catch (error) {
      expect(error).toMatchObject({ code: "UNSUPPORTED_PLATFORM" });
    }
  });

  it("supports multiple installed clients on one machine", async () => {
    const homeDir = "C:\\Users\\me";
    const cwd = "C:\\Users\\me\\project";
    const appData = "C:\\Users\\me\\AppData\\Roaming";
    const localAppData = "C:\\Users\\me\\AppData\\Local";

    const detector = new HostPlatformDetector({
      homeDir,
      cwd,
      platform: "win32",
      env: { APPDATA: appData, LOCALAPPDATA: localAppData },
      pathExists: createFakeFs(
        new Set([
          join(homeDir, ".cursor"),
          join(appData, "Claude"),
          join(localAppData, "Programs", "Microsoft VS Code"),
          join(homeDir, ".codeium", "windsurf"),
        ]),
      ),
      commandExists: createFakeCommands(new Set(["codex"])),
    });

    const installed = (await detector.detectClients())
      .filter((client) => client.installed)
      .map((client) => client.id)
      .sort();

    expect(installed).toEqual([
      "claude-desktop",
      "codex",
      "cursor",
      "vscode",
      "windsurf",
    ]);
  });
});
