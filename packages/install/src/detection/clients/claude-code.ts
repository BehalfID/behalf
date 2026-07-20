import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import { claudeCodePaths, type DetectionPathContext } from "../paths.js";

export async function detectClaudeCode(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = claudeCodePaths(input.ctx);
  const installed =
    (await input.pathExists(paths.userConfigDir)) ||
    (await input.pathExists(paths.mcpConfigPath)) ||
    (await input.pathExists(paths.settingsPath)) ||
    (await input.commandExists("claude"));

  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
    workspaceConfigDir: paths.workspaceConfigDir,
  };

  if (installed) {
    // Prefer project `.mcp.json` when present; otherwise use global `~/.claude.json`.
    configPaths.mcpConfigPath = (await input.pathExists(paths.workspaceMcpConfigPath))
      ? paths.workspaceMcpConfigPath
      : paths.mcpConfigPath;
  }

  return {
    id: "claude-code",
    name: "Claude Code",
    installed,
    configPaths,
  };
}
