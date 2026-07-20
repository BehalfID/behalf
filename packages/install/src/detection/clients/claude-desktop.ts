import type { DetectedClient } from "../../types/index.js";
import type { PathExistsFn } from "../fs.js";
import { claudeDesktopPaths, type DetectionPathContext } from "../paths.js";

export async function detectClaudeDesktop(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
}): Promise<DetectedClient> {
  const paths = claudeDesktopPaths(input.ctx);
  const installed =
    (await input.pathExists(paths.userConfigDir)) ||
    (await input.pathExists(paths.mcpConfigPath));

  const configPaths: DetectedClient["configPaths"] = {
    userConfigDir: paths.userConfigDir,
  };

  if (installed) {
    configPaths.mcpConfigPath = paths.mcpConfigPath;
  }

  return {
    id: "claude-desktop",
    name: "Claude Desktop",
    installed,
    configPaths,
  };
}
