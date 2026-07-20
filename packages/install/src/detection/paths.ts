import { join } from "node:path";
import type { OperatingSystemId } from "../types/index.js";

export interface DetectionPathContext {
  homeDir: string;
  cwd: string;
  os: OperatingSystemId;
  /** process.env-like map for APPDATA / XDG resolution. */
  env: NodeJS.ProcessEnv;
}

function appData(env: NodeJS.ProcessEnv, homeDir: string): string {
  return env.APPDATA?.trim() || join(homeDir, "AppData", "Roaming");
}

function localAppData(env: NodeJS.ProcessEnv, homeDir: string): string {
  return env.LOCALAPPDATA?.trim() || join(homeDir, "AppData", "Local");
}

function xdgConfigHome(env: NodeJS.ProcessEnv, homeDir: string): string {
  return env.XDG_CONFIG_HOME?.trim() || join(homeDir, ".config");
}

/** Cursor user config directory and MCP file. */
export function cursorPaths(ctx: DetectionPathContext) {
  const userConfigDir = join(ctx.homeDir, ".cursor");
  return {
    userConfigDir,
    mcpConfigPath: join(userConfigDir, "mcp.json"),
    workspaceConfigDir: join(ctx.cwd, ".cursor"),
    workspaceMcpConfigPath: join(ctx.cwd, ".cursor", "mcp.json"),
  };
}

/** Claude Code user/project config locations. */
export function claudeCodePaths(ctx: DetectionPathContext) {
  const userConfigDir = join(ctx.homeDir, ".claude");
  return {
    userConfigDir,
    /** Global MCP servers managed by `claude mcp add`. */
    mcpConfigPath: join(ctx.homeDir, ".claude.json"),
    settingsPath: join(userConfigDir, "settings.json"),
    workspaceConfigDir: ctx.cwd,
    workspaceMcpConfigPath: join(ctx.cwd, ".mcp.json"),
  };
}

/** Claude Desktop application config locations. */
export function claudeDesktopPaths(ctx: DetectionPathContext) {
  let userConfigDir: string;
  if (ctx.os === "darwin") {
    userConfigDir = join(ctx.homeDir, "Library", "Application Support", "Claude");
  } else if (ctx.os === "win32") {
    userConfigDir = join(appData(ctx.env, ctx.homeDir), "Claude");
  } else {
    userConfigDir = join(xdgConfigHome(ctx.env, ctx.homeDir), "Claude");
  }

  return {
    userConfigDir,
    mcpConfigPath: join(userConfigDir, "claude_desktop_config.json"),
  };
}

/** Codex CLI config locations (TOML). */
export function codexPaths(ctx: DetectionPathContext) {
  const userConfigDir = join(ctx.homeDir, ".codex");
  return {
    userConfigDir,
    mcpConfigPath: join(userConfigDir, "config.toml"),
    workspaceConfigDir: join(ctx.cwd, ".codex"),
  };
}

/** VS Code / Copilot MCP locations. */
export function vscodePaths(ctx: DetectionPathContext) {
  let userConfigDir: string;
  if (ctx.os === "darwin") {
    userConfigDir = join(ctx.homeDir, "Library", "Application Support", "Code");
  } else if (ctx.os === "win32") {
    userConfigDir = join(appData(ctx.env, ctx.homeDir), "Code");
  } else {
    userConfigDir = join(xdgConfigHome(ctx.env, ctx.homeDir), "Code");
  }

  const workspaceConfigDir = join(ctx.cwd, ".vscode");
  return {
    userConfigDir,
    /** Workspace MCP config is the supported VS Code surface today. */
    mcpConfigPath: join(workspaceConfigDir, "mcp.json"),
    workspaceConfigDir,
    userMcpConfigPath: join(userConfigDir, "User", "mcp.json"),
  };
}

/** Windsurf / Codeium MCP locations. */
export function windsurfPaths(ctx: DetectionPathContext) {
  const userConfigDir = join(ctx.homeDir, ".codeium", "windsurf");
  const alternateConfigDir = join(ctx.homeDir, ".windsurf");
  return {
    userConfigDir,
    mcpConfigPath: join(userConfigDir, "mcp_config.json"),
    alternateConfigDir,
    alternateMcpConfigPath: join(alternateConfigDir, "mcp.json"),
    workspaceConfigDir: join(ctx.cwd, ".windsurf"),
    /** Common Windows install location used as an install signal. */
    windowsInstallDir: join(localAppData(ctx.env, ctx.homeDir), "Programs", "Windsurf"),
  };
}

/** Common Windows Cursor install location. */
export function cursorWindowsInstallDir(ctx: DetectionPathContext): string {
  return join(localAppData(ctx.env, ctx.homeDir), "Programs", "cursor");
}

/** Common Windows VS Code install location. */
export function vscodeWindowsInstallDir(ctx: DetectionPathContext): string {
  return join(localAppData(ctx.env, ctx.homeDir), "Programs", "Microsoft VS Code");
}
