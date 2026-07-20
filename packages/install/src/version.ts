import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the package version from package.json adjacent to the built output.
 */
export function resolvePackageVersion(importMetaUrl: string = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(importMetaUrl));
  const packageJsonPath = join(moduleDir, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}
