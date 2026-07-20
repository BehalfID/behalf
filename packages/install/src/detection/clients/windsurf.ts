import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import { type DetectionPathContext, windsurfPaths } from "../paths.js";

export async function detectWindsurf(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = windsurfPaths(input.ctx);
  const signals = [
    await input.pathExists(paths.userConfigDir),
    await input.pathExists(paths.mcpConfigPath),
    await input.pathExists(paths.alternateConfigDir),
    await input.pathExists(paths.alternateMcpConfigPath),
    await input.commandExists("windsurf"),
  ];

  if (input.ctx.os === "win32") {
    signals.push(await input.pathExists(paths.windowsInstallDir));
  }

  const installed = signals.some(Boolean);
  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
    workspaceConfigDir: paths.workspaceConfigDir,
  };

  if (installed) {
    // Prefer the Codeium path; fall back to ~/.windsurf/mcp.json when that is what exists.
    const hasPrimary = await input.pathExists(paths.mcpConfigPath);
    const hasAlternate = await input.pathExists(paths.alternateMcpConfigPath);
    if (hasPrimary || !hasAlternate) {
      configPaths.mcpConfigPath = paths.mcpConfigPath;
    } else {
      configPaths.mcpConfigPath = paths.alternateMcpConfigPath;
    }
  }

  return {
    id: "windsurf",
    name: "Windsurf",
    installed,
    configPaths,
  };
}
