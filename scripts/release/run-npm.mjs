/**
 * Argv-safe npm invocation without shell:true.
 *
 * On Windows, `spawnSync("npm.cmd", …, { shell: false })` fails with EINVAL
 * because cmd shims cannot be launched without a shell. Resolve npm's JS CLI
 * and run it with `process.execPath` instead (same discipline as unix `npm`).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

/** Platform npm shim name (fallback only when npm-cli.js cannot be resolved). */
export const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export function resolveNpmSpawn() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
  ].filter(Boolean);

  for (const cli of candidates) {
    if (typeof cli === "string" && existsSync(cli)) {
      return { command: process.execPath, argsPrefix: [cli] };
    }
  }

  return { command: NPM_COMMAND, argsPrefix: [] };
}

export function spawnNpm(args, opts = {}) {
  const { command, argsPrefix } = resolveNpmSpawn();
  return spawnSync(command, [...argsPrefix, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    ...opts,
  });
}
