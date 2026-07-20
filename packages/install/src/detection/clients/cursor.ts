import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import {
  cursorPaths,
  cursorWindowsInstallDir,
  type DetectionPathContext,
} from "../paths.js";

export async function detectCursor(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = cursorPaths(input.ctx);
  const signals = [
    await input.pathExists(paths.userConfigDir),
    await input.pathExists(paths.mcpConfigPath),
    await input.commandExists("cursor"),
    await input.commandExists("cursor-agent"),
  ];

  if (input.ctx.os === "win32") {
    signals.push(await input.pathExists(cursorWindowsInstallDir(input.ctx)));
  }

  const installed = signals.some(Boolean);
  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
    workspaceConfigDir: paths.workspaceConfigDir,
  };

  if (installed) {
    configPaths.mcpConfigPath = paths.mcpConfigPath;
  }

  return {
    id: "cursor",
    name: "Cursor",
    installed,
    configPaths,
  };
}
