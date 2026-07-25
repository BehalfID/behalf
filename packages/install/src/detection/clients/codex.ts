import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import { codexPaths, type DetectionPathContext } from "../paths.js";

export async function detectCodex(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient> {
  const paths = codexPaths(input.ctx);
  const installed =
    (await input.pathExists(paths.userConfigDir)) ||
    (await input.pathExists(paths.mcpConfigPath)) ||
    (await input.commandExists("codex"));

  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
    workspaceConfigDir: paths.workspaceConfigDir,
  };

  if (installed) {
    configPaths.mcpConfigPath = paths.mcpConfigPath;
  }

  return {
    id: "codex",
    name: "Codex CLI",
    installed,
    configPaths,
  };
}
