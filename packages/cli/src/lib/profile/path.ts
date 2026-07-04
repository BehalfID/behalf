import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import { CONFIG_DIR_PATH } from "../config.js";
import { BIN_DIR_NAME } from "./constants.js";

export function getBinDir(): string {
  return join(CONFIG_DIR_PATH, BIN_DIR_NAME);
}

export type PathCheck = {
  binDir: string;
  binDirInPath: boolean;
  binDirPrecedesRealTool: boolean;
  realToolPath: string | null;
  pathHint: string | null;
};

function pathEntries(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter(Boolean);
}

/** Resolve an executable on PATH, optionally skipping one directory. */
export function resolveOnPath(
  binary: string,
  skipDir?: string
): string | null {
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of pathEntries()) {
    if (skipDir && dir === skipDir) continue;
    for (const ext of exts) {
      const candidate = join(dir, binary + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function checkPathOrdering(tool: string, skipDir?: string): PathCheck {
  if (!skipDir) skipDir = getBinDir();
  const binDir = skipDir;
  const entries = pathEntries();
  const binIndex = entries.indexOf(binDir);
  const realToolPath = resolveOnPath(tool, binDir);
  const realDir = realToolPath ? join(realToolPath, "..") : null;
  const realIndex = realDir ? entries.indexOf(realDir) : -1;

  const binDirInPath = binIndex >= 0;
  const binDirPrecedesRealTool =
    binDirInPath && (realIndex < 0 || binIndex < realIndex);

  const shellRc =
    process.env.SHELL?.includes("zsh") ? "~/.zshrc" :
    process.env.SHELL?.includes("fish") ? "~/.config/fish/config.fish" :
    "~/.bashrc";

  const pathHint = binDirPrecedesRealTool
    ? null
    : `Add this to ${shellRc} and restart your shell:\n  export PATH="${binDir}:$PATH"`;

  return {
    binDir,
    binDirInPath,
    binDirPrecedesRealTool,
    realToolPath,
    pathHint,
  };
}

export function shellPathExportLine(binDir: string): string {
  return `export PATH="${binDir}:$PATH"`;
}
