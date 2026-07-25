import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import {
  type DetectionPathContext,
  vscodePaths,
  vscodeWindowsInstallDir,
} from "../paths.js";

export async function detectVscode(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = vscodePaths(input.ctx);
  const signals = [
    await input.pathExists(paths.userConfigDir),
    await input.pathExists(paths.workspaceConfigDir),
    await input.pathExists(paths.mcpConfigPath),
    await input.commandExists("code"),
    await input.commandExists("code-insiders"),
  ];

  if (input.ctx.os === "win32") {
    signals.push(await input.pathExists(vscodeWindowsInstallDir(input.ctx)));
  }

  const installed = signals.some(Boolean);
  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
    workspaceConfigDir: paths.workspaceConfigDir,
  };

  if (installed) {
    // Prefer an existing user MCP file when present; otherwise use workspace mcp.json.
    configPaths.mcpConfigPath = (await input.pathExists(paths.userMcpConfigPath))
      ? paths.userMcpConfigPath
      : paths.mcpConfigPath;
  }

  return {
    id: "vscode",
    name: "VS Code",
    installed,
    configPaths,
  };
}
