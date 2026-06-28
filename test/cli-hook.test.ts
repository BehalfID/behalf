import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadHookModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  return {
    hook: await import("../packages/cli/src/commands/hook"),
    run: await import("../packages/cli/src/commands/run"),
    doctor: await import("../packages/cli/src/commands/doctor"),
    config: await import("../packages/cli/src/lib/config"),
  };
}

function stderrCollector() {
  let text = "";
  return {
    sink: { write: (chunk: string | Uint8Array) => { text += String(chunk); return true; } },
    get text() { return text; },
  };
}

beforeEach(() => {
  process.chdir(originalCwd);
});

describe("mapToolToAction", () => {
  it("maps file, shell, web, mcp, and agent tools to BehalfID actions", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapToolToAction("Write")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("Edit")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("MultiEdit")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("Read")).toEqual({ action: "read_file", resource: "filesystem" });
    expect(hook.mapToolToAction("Bash")).toEqual({ action: "execute_command", resource: "shell" });
    expect(hook.mapToolToAction("Task")).toEqual({ action: "spawn_agent", resource: "agent" });
  });

  it("derives the browse_web resource from a request URL, falling back to web", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapToolToAction("WebFetch", { url: "https://api.stripe.com/v1/charges" }))
      .toEqual({ action: "browse_web", resource: "api.stripe.com" });
    expect(hook.mapToolToAction("WebSearch", { query: "weather" }))
      .toEqual({ action: "browse_web", resource: "web" });
    expect(hook.mapToolToAction("WebFetch", { url: "not a url" }))
      .toEqual({ action: "browse_web", resource: "web" });
  });

  it("extracts the MCP server name from mcp__<server>__<tool>", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapToolToAction("mcp__github__search_issues"))
      .toEqual({ action: "mcp_tool", resource: "github" });
  });

  it("returns null for tools with no BehalfID-gated equivalent", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapToolToAction("Glob")).toBeNull();
    expect(hook.mapToolToAction("TodoWrite")).toBeNull();
  });

  it("tolerates casing, whitespace, and namespace/prefix wrappers on the tool name", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    // lowercase / mixed case
    expect(hook.mapToolToAction("write")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("MULTIEDIT")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("read")).toEqual({ action: "read_file", resource: "filesystem" });
    // surrounding whitespace
    expect(hook.mapToolToAction("  Write  ")).toEqual({ action: "write_file", resource: "filesystem" });
    // namespace / prefix wrappers
    expect(hook.mapToolToAction("tool:Write")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("anthropic.Edit")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("core/MultiEdit")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("ns__Read")).toEqual({ action: "read_file", resource: "filesystem" });
  });

  it("still does not over-match distinct tools or empty input", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    // NotebookEdit is its own tool — its final segment is not exactly "edit".
    expect(hook.mapToolToAction("NotebookEdit")).toBeNull();
    expect(hook.mapToolToAction("   ")).toBeNull();
    expect(hook.mapToolToAction("mcp__github__search_issues"))
      .toEqual({ action: "mcp_tool", resource: "github" });
  });
});

describe("runPreToolUse", () => {
  function configured(config: typeof import("../packages/cli/src/lib/config"), home: string) {
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });
    return home;
  }

  it("exits 0 when BehalfID allows the action", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/tmp/x" } }),
      verify: async () => ({ allowed: true, reason: "ok", requestId: "req_1" }),
      stderr: err.sink,
    });

    expect(code).toBe(0);
    expect(err.text).toBe("");
  });

  it("exits 2 and prints the blocked reason when denied", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf /" } }),
      verify: async () => ({ allowed: false, reason: "Action is blocked by this permission.", requestId: "req_2" }),
      stderr: err.sink,
    });

    expect(code).toBe(2);
    expect(err.text).toContain("BehalfID: blocked — Action is blocked by this permission.");
  });

  it("exits 2 with the Action Inbox message when approval is required", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Bash", tool_input: { command: "vercel deploy --prod" } }),
      verify: async () => ({ allowed: false, approvalRequired: true, reason: "Permission requires approval before execution.", requestId: "req_3" }),
      stderr: err.sink,
    });

    expect(code).toBe(2);
    expect(err.text).toContain("BehalfID: approval required. Visit your Action Inbox to approve.");
  });

  it("fails open (exit 0) on a verification error", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Write", tool_input: {} }),
      verify: async () => { throw new Error("Network request failed."); },
      stderr: err.sink,
    });

    expect(code).toBe(0);
    expect(err.text).toContain("verification unavailable");
  });

  it("fails open (exit 0) when the CLI is not configured", async () => {
    const home = tempDir("behalf-home-");
    const { hook } = await loadHookModules(home);
    const verify = vi.fn();
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Write", tool_input: {} }),
      verify,
      stderr: err.sink,
    });

    expect(code).toBe(0);
    expect(verify).not.toHaveBeenCalled();
    expect(err.text).toContain("not configured");
  });

  it("allows unmapped tools without calling verify", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Glob", tool_input: { pattern: "**/*.ts" } }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(code).toBe(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it("still verifies (and thus logs) a non-canonical tool_name like lowercase 'write'", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_w" }));

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "write", tool_input: { file_path: "/tmp/hello.txt" } }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(code).toBe(0);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "write_file", vendor: "filesystem" })
    );
  });

  it("traces the received tool_name and gate decisions to stderr when BEHALFID_DEBUG=1", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    vi.stubEnv("BEHALFID_DEBUG", "1");
    const err = stderrCollector();

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/tmp/x" } }),
      verify: async () => ({ allowed: true, reason: "ok", requestId: "req_d" }),
      stderr: err.sink,
    });

    expect(code).toBe(0);
    expect(err.text).toContain("BehalfID[debug]: received tool_name=\"Write\"");
    expect(err.text).toContain("write_file on filesystem");
    expect(err.text).toContain("verify → allowed=true");
  });
});

describe("installClaudePreToolUseHook", () => {
  it("writes the PreToolUse hook and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    expect(run.hasClaudePreToolUseHook(home)).toBe(false);

    const first = run.installClaudePreToolUseHook(home);
    expect(first.changed).toBe(true);
    expect(run.hasClaudePreToolUseHook(home)).toBe(true);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(settings.hooks.PreToolUse).toEqual([
      { matcher: ".*", hooks: [{ type: "command", command: "behalf hook pre-tool-use" }] },
    ]);

    const second = run.installClaudePreToolUseHook(home);
    expect(second.changed).toBe(false);
    expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).hooks.PreToolUse).toHaveLength(1);
  });

  it("preserves existing settings and hooks", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");

    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ model: "claude-opus", hooks: { PostToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "echo done" }] }] } }, null, 2)
    );

    run.installClaudePreToolUseHook(home);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(settings.model).toBe("claude-opus");
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("behalf hook pre-tool-use");
  });
});

describe("doctor Claude hook check", () => {
  it("warns when the hook is missing and reports ok once installed", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { run, doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const before = await doctor.runDoctorChecks(project);
    const hookCheck = before.find(c => c.name === "Claude hook");
    expect(hookCheck?.status).toBe("warn");
    expect(hookCheck?.fix).toBe("Run `behalf claude` to install it.");

    run.installClaudePreToolUseHook(home);

    const after = await doctor.runDoctorChecks(project);
    expect(after.find(c => c.name === "Claude hook")?.status).toBe("ok");
  });
});

describe("installCodexPreToolUseHook", () => {
  it("writes ~/.codex/hooks.json in the expected format and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    expect(run.hasCodexPreToolUseHook(home)).toBe(false);

    const first = run.installCodexPreToolUseHook(home);
    expect(first.changed).toBe(true);
    expect(run.hasCodexPreToolUseHook(home)).toBe(true);

    const hooks = JSON.parse(readFileSync(join(home, ".codex", "hooks.json"), "utf-8"));
    expect(hooks.hooks.PreToolUse).toEqual([
      { matcher: ".*", hooks: [{ type: "command", command: "behalf hook pre-tool-use" }] },
    ]);

    const second = run.installCodexPreToolUseHook(home);
    expect(second.changed).toBe(false);
    expect(JSON.parse(readFileSync(join(home, ".codex", "hooks.json"), "utf-8")).hooks.PreToolUse).toHaveLength(1);
  });

  it("preserves existing hooks when merging", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");

    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "existing" }] }] } }, null, 2)
    );

    run.installCodexPreToolUseHook(home);

    const hooks = JSON.parse(readFileSync(join(home, ".codex", "hooks.json"), "utf-8"));
    expect(hooks.hooks.PreToolUse).toHaveLength(2);
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toBe("existing");
    expect(hooks.hooks.PreToolUse[1].hooks[0].command).toBe("behalf hook pre-tool-use");
  });
});

describe("installCodexMcpServer", () => {
  it("appends the [mcp_servers.behalfid] block and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    const first = run.installCodexMcpServer(home);
    expect(first.changed).toBe(true);

    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain("[mcp_servers.behalfid]");
    expect(toml).toContain('command = "behalf"');
    expect(toml).toContain('args = ["mcp", "start"]');

    const second = run.installCodexMcpServer(home);
    expect(second.changed).toBe(false);
  });

  it("preserves an existing config.toml", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");

    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers.other]\ncommand = "foo"\n');

    run.installCodexMcpServer(home);

    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain("[mcp_servers.other]");
    expect(toml).toContain("[mcp_servers.behalfid]");
  });
});

describe("doctor Codex hook check", () => {
  it("warns when the hook is missing and reports ok once installed", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { run, doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const before = await doctor.runDoctorChecks(project);
    const codexCheck = before.find(c => c.name === "Codex hook");
    expect(codexCheck?.status).toBe("warn");
    expect(codexCheck?.fix).toBe("Run `behalf codex` to install it.");

    run.installCodexPreToolUseHook(home);

    const after = await doctor.runDoctorChecks(project);
    expect(after.find(c => c.name === "Codex hook")?.status).toBe("ok");
  });
});

describe("runCursorHook", () => {
  function configured(config: typeof import("../packages/cli/src/lib/config"), home: string) {
    config.writeConfig({ apiKey: "bhf_sk_testsecret12345", agentId: "agent_test123", baseUrl: "http://localhost:3000" });
    return home;
  }

  it("prints Cursor's deny JSON and exits 0 when denied", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const out = stderrCollector();

    const code = await hook.runCursorHook({
      stdin: async () => JSON.stringify({ command: "rm -rf /" }),
      verify: async () => ({ allowed: false, reason: "Blocked by policy." }),
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(JSON.parse(out.text)).toEqual({ permission: "deny", reason: "Blocked by policy." });
  });

  it("prints nothing and exits 0 when allowed", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const out = stderrCollector();

    const code = await hook.runCursorHook({
      stdin: async () => JSON.stringify({ command: "ls" }),
      verify: async () => ({ allowed: true }),
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(out.text).toBe("");
  });

  it("maps approval-required to a deny decision", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const out = stderrCollector();

    await hook.runCursorHook({
      stdin: async () => JSON.stringify({ command: "deploy" }),
      verify: async () => ({ allowed: false, approvalRequired: true }),
      stdout: out.sink,
    });

    const decision = JSON.parse(out.text);
    expect(decision.permission).toBe("deny");
    expect(decision.reason).toMatch(/approval/i);
  });

  it("fails open (allow, no output) when verification errors", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const out = stderrCollector();

    const code = await hook.runCursorHook({
      stdin: async () => JSON.stringify({ command: "ls" }),
      verify: async () => { throw new Error("network down"); },
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(out.text).toBe("");
  });

  it("fails open when not configured", async () => {
    const home = tempDir("behalf-home-");
    const { hook } = await loadHookModules(home);
    const out = stderrCollector();

    const code = await hook.runCursorHook({
      stdin: async () => JSON.stringify({ command: "ls" }),
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(out.text).toBe("");
  });
});

describe("installCursorBeforeShellHook", () => {
  it("writes ~/.cursor/hooks.json in Cursor's format and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    expect(run.hasCursorBeforeShellHook(home)).toBe(false);

    const first = run.installCursorBeforeShellHook(home);
    expect(first.changed).toBe(true);
    expect(run.hasCursorBeforeShellHook(home)).toBe(true);

    const file = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf-8"));
    expect(file).toEqual({
      version: 1,
      hooks: { beforeShellExecution: [{ command: "behalf hook cursor", matcher: ".*" }] },
    });

    const second = run.installCursorBeforeShellHook(home);
    expect(second.changed).toBe(false);
    expect(JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf-8")).hooks.beforeShellExecution).toHaveLength(1);
  });

  it("preserves existing hooks when merging", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");

    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "hooks.json"),
      JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: "existing", matcher: "git.*" }], afterEdit: [{ command: "x" }] } }, null, 2)
    );

    run.installCursorBeforeShellHook(home);

    const file = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf-8"));
    expect(file.hooks.beforeShellExecution).toHaveLength(2);
    expect(file.hooks.beforeShellExecution[0].command).toBe("existing");
    expect(file.hooks.beforeShellExecution[1].command).toBe("behalf hook cursor");
    expect(file.hooks.afterEdit).toEqual([{ command: "x" }]);
  });
});

describe("doctor Cursor hook check", () => {
  it("warns when the hook is missing and reports ok once installed", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { run, doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const before = await doctor.runDoctorChecks(project);
    const cursorCheck = before.find(c => c.name === "Cursor hook");
    expect(cursorCheck?.status).toBe("warn");
    expect(cursorCheck?.fix).toBe("Run `behalf cursor` to install it.");

    run.installCursorBeforeShellHook(home);

    const after = await doctor.runDoctorChecks(project);
    expect(after.find(c => c.name === "Cursor hook")?.status).toBe("ok");
  });
});
