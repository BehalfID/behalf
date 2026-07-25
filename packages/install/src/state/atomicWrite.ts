import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Atomically write a UTF-8 file by writing to a temp file in the same directory
 * and renaming into place. On Windows, replaces an existing destination explicitly.
 */
export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await writeFile(tempPath, contents, "utf8");
    try {
      await rename(tempPath, filePath);
    } catch (error) {
      if (process.platform === "win32") {
        await unlink(filePath).catch(() => undefined);
        await rename(tempPath, filePath);
        return;
      }
      throw error;
    }
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
