#!/usr/bin/env node
/**
 * Capture sanitized interactive-prompt transcripts for scoped activation.
 * Uses a fake TTY (no native PTY) so Windows CI can record arrow-key UX.
 *
 * Writes under artifacts/scoped-activation/pty/
 */
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "artifacts/scoped-activation/pty");
mkdirSync(outDir, { recursive: true });

class FakeTtyStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setEncoding() {
    return this;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
  resume() {
    return this;
  }
  pause() {
    return this;
  }
}

class FakeTtyStdout extends EventEmitter {
  isTTY = true;
  chunks = [];
  write(chunk) {
    this.chunks.push(String(chunk));
    return true;
  }
  get text() {
    return this.chunks.join("");
  }
}

function sanitize(text) {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "~")
    .replace(/\/Users\/[^/\s]+/g, "~")
    .replace(/\/home\/[^/\s]+/g, "~");
}

async function main() {
  const stdin = new FakeTtyStdin();
  const stdout = new FakeTtyStdout();
  const realStdin = process.stdin;
  const realStdout = process.stdout;
  Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
  Object.defineProperty(process, "stdout", { value: stdout, configurable: true });

  try {
    const { select } = await import(
      pathToFileURL(join(root, "packages/cli/dist/lib/prompt.js")).href
    );

    const pending = select("Enable BehalfID protection?", [
      { value: "session", label: "For this session" },
      { value: "timed", label: "For a limited time" },
      { value: "repository", label: "For this repository" },
      { value: "always", label: "Always enable" },
      { value: "disabled", label: "Not now" },
    ], {
      body:
        "BehalfID verifies AI-agent actions against your permissions and can require approval before sensitive actions execute.",
    });

    await new Promise((r) => setTimeout(r, 20));
    stdin.emit("data", "\x1b[B\x1b[B\r");
    const value = await pending;

    const transcript = [
      "# Scoped activation interactive prompt transcript",
      `# choice=${value}`,
      "# method=fake-tty-arrow-keys (fixture; not live Cursor/Claude/Codex GUI)",
      "",
      sanitize(stdout.text),
      "",
    ].join("\n");

    for (const agent of ["cursor", "claude", "codex"]) {
      writeFileSync(join(outDir, `${agent}-prompt-repository.txt`), transcript, "utf8");
    }
    writeFileSync(join(outDir, "README.md"), [
      "# PTY / interactive prompt evidence",
      "",
      "These transcripts exercise the real `select()` arrow-key renderer via a fake TTY.",
      "Underlying agent binaries are not launched here; see `test/cli-protection-pty.test.ts`",
      "for fixture-binary `launchTool` coverage per Cursor / Claude / Codex.",
      "",
      "Method: fake-TTY (no native node-pty). Safe on Windows without admin symlink/PTY privileges.",
      "",
    ].join("\n"));

    console.log(`Wrote transcripts to ${outDir} (choice=${value})`);
  } finally {
    Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
    Object.defineProperty(process, "stdout", { value: realStdout, configurable: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
