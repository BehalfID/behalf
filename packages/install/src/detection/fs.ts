import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter, join } from "node:path";

export type PathExistsFn = (path: string) => Promise<boolean>;
export type CommandExistsFn = (command: string) => Promise<boolean>;

/** Default existence check using fs.access. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve whether an executable name is present on PATH.
 * Honors PATHEXT on Windows.
 */
export function createCommandExists(options: {
  pathEnv?: string;
  platform?: NodeJS.Platform;
  pathExists?: PathExistsFn;
}): CommandExistsFn {
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const platform = options.platform ?? process.platform;
  const exists = options.pathExists ?? pathExists;

  return async (command: string): Promise<boolean> => {
    if (!pathEnv) {
      return false;
    }

    const extensions =
      platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
        : [""];

    for (const dir of pathEnv.split(delimiter)) {
      if (!dir) {
        continue;
      }
      for (const ext of extensions) {
        if (await exists(join(dir, command + ext))) {
          return true;
        }
      }
    }

    return false;
  };
}
