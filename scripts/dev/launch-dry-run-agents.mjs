#!/usr/bin/env node
import { mkdirSync, writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const home = mkdtempSync(join(tmpdir(), "behalf-launch-dry-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.CI = "1";

const bin = join(home, "fakebin");
mkdirSync(bin, { recursive: true });
for (const t of ["cursor", "claude", "codex"]) {
  const p = join(bin, process.platform === "win32" ? `${t}.cmd` : t);
  writeFileSync(
    p,
    process.platform === "win32"
      ? `@echo off\r\necho FAKE_${t} %*\r\nexit /b 0\r\n`
      : `#!/bin/sh\necho FAKE_${t} "$@"\nexit 0\n`
  );
  if (process.platform !== "win32") chmodSync(p, 0o755);
}
process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;

const { launchTool } = await import(
  pathToFileURL(join(root, "packages/cli/dist/commands/run.js")).href
);
const { writeConfig } = await import(
  pathToFileURL(join(root, "packages/cli/dist/lib/config.js")).href
);
writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

const calls = [];
const spawn = (cmd, args, opts) => {
  calls.push({ cmd, args, env: opts.env });
  return { status: 0 };
};

for (const tool of ["cursor", "claude", "codex"]) {
  calls.length = 0;
  const code = await launchTool(
    tool,
    ["--behalf", "--keep-arg", "xyz"],
    { spawn, stderr: process.stderr, stdout: { write: () => true } },
    { egress: "off" }
  );
  const c = calls[0];
  console.log(
    JSON.stringify({
      tool,
      code,
      cmd: c?.cmd,
      args: c?.args,
      enabled: c?.env?.BEHALFID_ENABLED,
      mode: c?.env?.BEHALFID_ACTIVATION_MODE,
      sid: Boolean(c?.env?.BEHALFID_SESSION_ID),
      preserved:
        c?.args?.includes("--keep-arg") &&
        c?.args?.includes("xyz") &&
        !c?.args?.includes("--behalf"),
    })
  );
}
