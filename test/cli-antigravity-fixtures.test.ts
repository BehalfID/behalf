import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const FIXTURE_DIR = join(originalCwd, "test", "fixtures", "antigravity");

type AntigravityFixture = {
  description: string;
  provenance: "documented" | "captured-cli" | "captured-ide" | "provisional";
  source: string;
  payload: Record<string, unknown>;
};

function loadFixtures(dir: string): { file: string; fixture: AntigravityFixture }[] {
  const out: { file: string; fixture: AntigravityFixture }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...loadFixtures(path));
    } else if (entry.name.endsWith(".json")) {
      out.push({ file: path, fixture: JSON.parse(readFileSync(path, "utf-8")) as AntigravityFixture });
    }
  }
  return out;
}

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadHookModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  return {
    hook: await import("../packages/cli/src/commands/hook"),
    config: await import("../packages/cli/src/lib/config"),
  };
}

function collector() {
  let text = "";
  return {
    sink: { write: (chunk: string | Uint8Array) => { text += String(chunk); return true; } },
    get text() { return text; },
  };
}

beforeEach(() => {
  process.chdir(originalCwd);
});

describe("Antigravity payload fixtures", () => {
  const fixtures = loadFixtures(FIXTURE_DIR);

  it("declares a valid provenance tier on every fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const { file, fixture } of fixtures) {
      expect(["documented", "captured-cli", "captured-ide", "provisional"], file).toContain(
        fixture.provenance
      );
      expect(fixture.source, file).toBeTruthy();
      expect(fixture.payload, file).toBeTypeOf("object");
    }
  });

  it("contains no secrets, credentials, or personal paths", () => {
    for (const { file } of fixtures) {
      const raw = readFileSync(file, "utf-8");
      expect(raw, file).not.toMatch(/bhf_(sk|dev|pass)_/);
      expect(raw, file).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
      expect(raw, file).not.toMatch(/\/home\/(?!user\b)[a-z]/i);
      expect(raw, file).not.toMatch(/\/Users\//);
    }
  });

  it("every fixture payload is handled by the gate without throwing, in both modes", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });

    for (const { file, fixture } of fixtures) {
      for (const enforcement of ["advisory", "required"] as const) {
        const out = collector();
        const err = collector();
        const code = await hook.runAntigravityHook({
          stdin: async () => JSON.stringify(fixture.payload),
          stdout: out.sink,
          stderr: err.sink,
          verify: async () => ({ allowed: true, reason: "ok" }),
          enforcement,
        });
        expect([0, 2], `${file} (${enforcement})`).toContain(code);
      }
    }
  });

  it("documented fixtures with complete arguments verify and allow in required mode", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });

    for (const { file, fixture } of fixtures.filter((f) => f.fixture.provenance === "documented")) {
      const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));
      const out = collector();
      const code = await hook.runAntigravityHook({
        stdin: async () => JSON.stringify(fixture.payload),
        stdout: out.sink,
        stderr: collector().sink,
        verify,
        enforcement: "required",
      });
      expect(code, file).toBe(0);
      expect(verify, file).toHaveBeenCalledTimes(1);
    }
  });
});

describe("runCaptureSchemaHook", () => {
  it("records schema only — never argument values — and always allows", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));
    const lines: string[] = [];
    const out = collector();
    const err = collector();

    const code = await hook.runCaptureSchemaHook(undefined, {
      stdin: async () =>
        JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: "sess_secret_value",
          cwd: "/home/someone/private-project",
          tool_name: "run_command",
          tool_input: { command: "curl -H 'Authorization: Bearer supersecret' https://x", cwd: "/home/someone" },
          mcp_context: { server_name: "github" },
        }),
      stdout: out.sink,
      stderr: err.sink,
      append: (line) => lines.push(line),
    });

    expect(code).toBe(0);
    expect(out.text.trim()).toBe("{}");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.eventName).toBe("PreToolUse");
    expect(record.toolName).toBe("run_command");
    expect(record.topLevelKeys).toContain("tool_input");
    expect(record.argumentTypes).toEqual({ command: "string", cwd: "string" });
    expect(record.mcpContextKeys).toEqual(["server_name"]);
    // No values anywhere in the capture.
    expect(lines[0]).not.toContain("supersecret");
    expect(lines[0]).not.toContain("curl");
    expect(lines[0]).not.toContain("/home/someone");
    expect(lines[0]).not.toContain("sess_secret_value");
  });

  it("never blocks: malformed stdin still records an error entry and allows", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));
    const lines: string[] = [];
    const out = collector();

    const code = await hook.runCaptureSchemaHook(undefined, {
      stdin: async () => "not json {",
      stdout: out.sink,
      stderr: collector().sink,
      append: (line) => lines.push(line),
    });

    expect(code).toBe(0);
    expect(out.text.trim()).toBe("{}");
    expect(JSON.parse(lines[0]).error).toMatch(/not a JSON object/i);
  });

  it("still allows when the capture sink itself fails", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));
    const out = collector();
    const err = collector();

    const code = await hook.runCaptureSchemaHook(undefined, {
      stdin: async () => JSON.stringify({ tool_name: "run_command", tool_input: {} }),
      stdout: out.sink,
      stderr: err.sink,
      append: () => {
        throw new Error("disk full");
      },
    });

    expect(code).toBe(0);
    expect(out.text.trim()).toBe("{}");
    expect(err.text).toMatch(/capture failed/i);
  });
});
