import type { DetectedClient } from "../../types/index.js";
import type { CommandExistsFn, PathExistsFn } from "../fs.js";
import type { DetectionPathContext } from "../paths.js";
import { detectClaudeCode } from "./claude-code.js";
import { detectClaudeDesktop } from "./claude-desktop.js";
import { detectCodex } from "./codex.js";
import { detectCursor } from "./cursor.js";
import { detectVscode } from "./vscode.js";
import { detectWindsurf } from "./windsurf.js";

/** Detect all supported AI clients on the host. */
export async function detectAllClients(input: {
  ctx: DetectionPathContext;
  pathExists: PathExistsFn;
  commandExists: CommandExistsFn;
}): Promise<DetectedClient[]> {
  return Promise.all([
    detectCursor(input),
    detectClaudeCode(input),
    detectClaudeDesktop(input),
    detectCodex(input),
    detectVscode(input),
    detectWindsurf(input),
  ]);
}

export {
  detectCursor,
  detectClaudeCode,
  detectClaudeDesktop,
  detectCodex,
  detectVscode,
  detectWindsurf,
};
