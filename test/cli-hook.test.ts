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
  // Node's os.homedir() reads USERPROFILE on Windows; stub both so config and
  // hook install paths stay inside the per-test temp directory.
  vi.stubEnv("USERPROFILE", home);
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
    expect(hook.mapToolToAction("NotebookEdit")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapToolToAction("Read")).toEqual({ action: "read_file", resource: "filesystem" });
    expect(hook.mapToolToAction("Bash")).toEqual({ action: "execute_command", resource: "shell" });
    expect(hook.mapToolToAction("PowerShell")).toEqual({ action: "execute_command", resource: "shell" });
    expect(hook.mapToolToAction("Agent")).toEqual({ action: "spawn_agent", resource: "agent" });
    expect(hook.mapToolToAction("Task")).toEqual({ action: "spawn_agent", resource: "agent" });
  });

  it("maps Monitor to execute_command only when a shell command is present", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapToolToAction("Monitor", { command: "npm test" })).toEqual({
      action: "execute_command",
      resource: "shell",
    });
    // WebSocket-only / non-command Monitor shapes stay intentionally unmapped.
    expect(hook.mapToolToAction("Monitor", {})).toBeNull();
    expect(hook.mapToolToAction("Monitor", { url: "ws://localhost" })).toBeNull();
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

    expect(hook.mapToolToAction("   ")).toBeNull();
    expect(hook.mapToolToAction("Glob")).toBeNull();
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

  it("Write forwards the file path in sanitized policy context", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_w" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          cwd: "/workspace/project",
          tool_name: "Write",
          tool_input: { file_path: "/workspace/project/src/index.ts", content: "SECRET_FILE_BODY" },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write_file",
        vendor: "filesystem",
        policyContext: expect.objectContaining({
          source: "claude_code",
          cwd: "/workspace/project",
          toolInput: { filePath: "/workspace/project/src/index.ts" },
        }),
      })
    );
    const body = verify.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("SECRET_FILE_BODY");
  });

  it("Edit forwards the file path but not old_string or new_string", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_e" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "Edit",
          tool_input: {
            file_path: "/repo/a.ts",
            old_string: "OLD_SECRET",
            new_string: "NEW_SECRET",
          },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    const body = verify.mock.calls[0][0] as Record<string, unknown>;
    expect(body.policyContext).toEqual(
      expect.objectContaining({
        toolInput: { filePath: "/repo/a.ts" },
      })
    );
    expect(JSON.stringify(body)).not.toContain("OLD_SECRET");
    expect(JSON.stringify(body)).not.toContain("NEW_SECRET");
  });

  it("NotebookEdit maps to write_file and forwards only its path", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_nb" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "NotebookEdit",
          tool_input: {
            notebook_path: "/repo/n.ipynb",
            new_source: "print('CELL_SECRET')",
          },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write_file",
        policyContext: expect.objectContaining({
          toolInput: { filePath: "/repo/n.ipynb" },
        }),
      })
    );
    expect(JSON.stringify(verify.mock.calls[0][0])).not.toContain("CELL_SECRET");
  });

  it("Read forwards its file path", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_r" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "Read",
          tool_input: { file_path: "/workspace/project/README.md" },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "read_file",
        policyContext: expect.objectContaining({
          toolInput: { filePath: "/workspace/project/README.md" },
        }),
      })
    );
  });

  it("Bash forwards its command", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_b" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: "npm test" },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "execute_command",
        vendor: "shell",
        policyContext: expect.objectContaining({
          toolInput: { command: "npm test" },
        }),
      })
    );
  });

  it("PowerShell maps to execute_command and forwards its command", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_ps" }));

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "PowerShell",
          tool_input: { command: "Get-ChildItem" },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "execute_command",
        policyContext: expect.objectContaining({
          toolInput: { command: "Get-ChildItem" },
        }),
      })
    );
  });

  it("Agent maps to spawn_agent", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_a" }));

    await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Agent", tool_input: { prompt: "do stuff" } }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "spawn_agent", vendor: "agent" })
    );
  });

  it("legacy Task still maps to spawn_agent", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_t" }));

    await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Task", tool_input: {} }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "spawn_agent", vendor: "agent" })
    );
  });

  it("malformed or non-object tool_input does not crash", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_m" }));

    const code = await hook.runPreToolUse({
      stdin: async () => JSON.stringify({ tool_name: "Write", tool_input: "not-an-object" }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(code).toBe(0);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "write_file", vendor: "filesystem" })
    );
  });

  it("oversized local policy input fails closed with exit 2", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn();
    const err = stderrCollector();
    const hugePath = "/repo/" + "a".repeat(hook.POLICY_CONTEXT_MAX_BYTES);

    const code = await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          tool_name: "Write",
          tool_input: { file_path: hugePath, content: "x" },
        }),
      verify,
      stderr: err.sink,
    });

    expect(code).toBe(2);
    expect(verify).not.toHaveBeenCalled();
    expect(err.text).toContain("policy context too large");
  });

  it("debug tracing does not contain raw command text or file contents", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    vi.stubEnv("BEHALFID_DEBUG", "1");
    const err = stderrCollector();

    await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          cwd: "/workspace/secret-cwd",
          tool_name: "Bash",
          tool_input: { command: "rm -rf /SECRET_COMMAND_TOKEN" },
        }),
      verify: async () => ({ allowed: true, reason: "ok", requestId: "req_dbg" }),
      stderr: err.sink,
    });

    expect(err.text).toContain("policy context: command present");
    expect(err.text).not.toContain("SECRET_COMMAND_TOKEN");
    expect(err.text).not.toContain("rm -rf");
    expect(err.text).not.toContain("secret-cwd");
  });

  it("a real Claude-shaped payload reaches verify with action, vendor, and policy context", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config, home);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok", requestId: "req_real" }));

    const code = await hook.runPreToolUse({
      stdin: async () =>
        JSON.stringify({
          session_id: "sess_1",
          cwd: "/workspace/project",
          tool_name: "Bash",
          tool_input: { command: "npm test && echo done" },
        }),
      verify,
      stderr: stderrCollector().sink,
    });

    expect(code).toBe(0);
    expect(verify).toHaveBeenCalledWith({
      agentId: "agent_test123",
      action: "execute_command",
      vendor: "shell",
      policyContext: {
        source: "claude_code",
        toolName: "Bash",
        cwd: "/workspace/project",
        toolInput: { command: "npm test && echo done" },
      },
    });
  });
});

describe("installClaudePreToolUseHook", () => {
  it("writes the PreToolUse hook and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    expect(run.hasClaudePreToolUseHook(home)).toBe(false);

    const first = run.installClaudePreToolUseHook(home);
    expect(first.ok).toBe(true);
    expect(first.changed).toBe(true);
    expect(run.hasClaudePreToolUseHook(home)).toBe(true);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(settings.hooks.PreToolUse).toEqual([
      { matcher: ".*", hooks: [{ type: "command", command: "behalf hook pre-tool-use" }] },
    ]);

    const second = run.installClaudePreToolUseHook(home);
    expect(second.ok).toBe(true);
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

    const result = run.installClaudePreToolUseHook(home);
    expect(result.ok).toBe(true);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(settings.model).toBe("claude-opus");
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("behalf hook pre-tool-use");
  });

  it("refuses to overwrite malformed settings.json", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");
    const settingsPath = join(home, ".claude", "settings.json");
    mkdirSync(join(home, ".claude"), { recursive: true });
    const original = "{ not-valid-json ";
    writeFileSync(settingsPath, original);

    const result = run.installClaudePreToolUseHook(home);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("malformed");
    expect(readFileSync(settingsPath, "utf-8")).toBe(original);
    expect(run.hasClaudePreToolUseHook(home)).toBe(false);
    expect(run.getClaudePreToolUseHookStatus(home).status).toBe("malformed");
  });

  it("reports unreadable settings without mutating them", async () => {
    if (process.platform === "win32") return; // chmod semantics differ on Windows
    if (typeof process.getuid === "function" && process.getuid() === 0) return; // root bypasses file modes
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const { chmodSync, mkdirSync } = await import("node:fs");
    const settingsPath = join(home, ".claude", "settings.json");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));
    chmodSync(settingsPath, 0);

    try {
      const result = run.installClaudePreToolUseHook(home);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("unreadable");
      expect(run.getClaudePreToolUseHookStatus(home).status).toBe("unreadable");
    } finally {
      chmodSync(settingsPath, 0o644);
    }
  });
});

describe("behalf claude refuses launch without verified hook", () => {
  it("does not spawn Claude when settings.json is malformed", async () => {
    const home = tempDir("behalf-home-");
    const { run, config } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{ broken");
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      agent: { agentId: "agent_test123", name: "t", status: "active" },
      permissions: [],
    }), { status: 200 })));

    const err = stderrCollector();
    const out = stderrCollector();
    let spawned = false;
    const code = await run.launchTool("claude", [], {
      spawn: ((..._args: unknown[]) => {
        spawned = true;
        return { status: 0, signal: null, output: [], pid: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }) as typeof import("node:child_process").spawnSync,
      stderr: err.sink,
      stdout: out.sink,
    });

    expect(code).toBe(1);
    expect(spawned).toBe(false);
    expect(err.text).toContain("not valid JSON");
    expect(err.text).toContain("Claude was not launched");
    expect(err.text).toContain(join(home, ".claude", "settings.json"));
    expect(err.text).not.toMatch(/bhf_sk_/);
    expect(err.text).not.toContain("{ broken");
    expect(out.text).not.toMatch(/Launching claude/);
  });

  it("launches when settings are valid and preserves unrelated hooks", async () => {
    const home = tempDir("behalf-home-");
    const { run, config } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PostToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "other-hook" }] }],
        },
      })
    );
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      agent: { agentId: "agent_test123", name: "t", status: "active" },
      permissions: [],
    }), { status: 200 })));

    const err = stderrCollector();
    const out = stderrCollector();
    let spawnedBinary: string | undefined;
    const code = await run.launchTool("claude", [], {
      spawn: ((binary: string) => {
        spawnedBinary = binary;
        return { status: 0, signal: null, output: [], pid: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }) as typeof import("node:child_process").spawnSync,
      stderr: err.sink,
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(spawnedBinary).toBe("claude");
    expect(out.text).toMatch(/Launching claude with BehalfID enforcement/);
    expect(out.text).not.toMatch(/MCP enforcement/);
    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("other-hook");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("behalf hook pre-tool-use");
  });

  it("treats an existing valid BehalfID hook as success without rewriting", async () => {
    const home = tempDir("behalf-home-");
    const { run, config } = await loadHookModules(home);
    run.installClaudePreToolUseHook(home);
    const before = readFileSync(join(home, ".claude", "settings.json"), "utf-8");
    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      agent: { agentId: "agent_test123", name: "t", status: "active" },
      permissions: [],
    }), { status: 200 })));

    const err = stderrCollector();
    const out = stderrCollector();
    let spawned = false;
    const code = await run.launchTool("claude", [], {
      spawn: ((..._args: unknown[]) => {
        spawned = true;
        return { status: 0, signal: null, output: [], pid: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }) as typeof import("node:child_process").spawnSync,
      stderr: err.sink,
      stdout: out.sink,
    });

    expect(code).toBe(0);
    expect(spawned).toBe(true);
    expect(err.text).not.toMatch(/Installed BehalfID PreToolUse hook/);
    expect(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).toBe(before);
  });
});

describe("Windows Claude settings path behavior", () => {
  it("uses USERPROFILE-style home with backslash paths and is idempotent", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);

    const first = run.installClaudePreToolUseHook(home);
    expect(first.ok).toBe(true);
    expect(first.changed).toBe(true);
    expect(first.path.toLowerCase()).toContain(".claude");
    expect(first.path.toLowerCase()).toContain("settings.json");

    const second = run.installClaudePreToolUseHook(home);
    expect(second.ok).toBe(true);
    expect(second.changed).toBe(false);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    settings.hooks.PostToolUse = [{ matcher: ".*", hooks: [{ type: "command", command: "other" }] }];
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(settings, null, 2));
    const third = run.installClaudePreToolUseHook(home);
    expect(third.ok).toBe(true);
    expect(third.changed).toBe(false);
    const after = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    expect(after.hooks.PostToolUse[0].hooks[0].command).toBe("other");
    expect(after.hooks.PreToolUse).toHaveLength(1);
  });

  it("keeps Claude settings under the stubbed USERPROFILE home", async () => {
    const home = tempDir("behalf-home-");
    const { run } = await loadHookModules(home);
    const status = run.getClaudePreToolUseHookStatus(home);
    expect(status.path.startsWith(home)).toBe(true);
    if (process.platform === "win32") {
      expect(/^[a-zA-Z]:[\\/]/.test(home) || home.includes("\\")).toBe(true);
    }
  });
});

describe("doctor Claude hook check", () => {
  it("errors when the hook is missing and reports ok once installed", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { run, doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const before = await doctor.runDoctorChecks(project);
    const hookCheck = before.find(c => c.name === "Claude hook");
    expect(hookCheck?.status).toBe("error");
    expect(hookCheck?.fix).toBe("Run `behalf claude` to install it.");

    run.installClaudePreToolUseHook(home);

    const after = await doctor.runDoctorChecks(project);
    expect(after.find(c => c.name === "Claude hook")?.status).toBe("ok");
  });

  it("errors when settings.json is malformed", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { doctor } = await loadHookModules(home);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{ nope");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const checks = await doctor.runDoctorChecks(project);
    const hookCheck = checks.find(c => c.name === "Claude hook");
    expect(hookCheck?.status).toBe("error");
    expect(hookCheck?.detail).toMatch(/not valid JSON/);
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

describe("doctor Cursor CLI (PATH) check", () => {
  it("warns with the install-in-PATH fix when cursor is not on PATH", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubEnv("PATH", "");

    const checks = await doctor.runDoctorChecks(project);
    const cliCheck = checks.find(c => c.name === "Cursor CLI");
    expect(cliCheck?.status).toBe("warn");
    expect(cliCheck?.fix).toBe(
      "cursor is not in PATH. Open Cursor, press Cmd+Shift+P, and run 'Install cursor command in PATH', then re-run behalf cursor."
    );
  });

  it("reports ok when a cursor executable is found on PATH", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const bin = tempDir("behalf-bin-");
    const { chmodSync } = await import("node:fs");
    const exe = process.platform === "win32" ? "cursor.exe" : "cursor";
    writeFileSync(join(bin, exe), "#!/bin/sh\n");
    chmodSync(join(bin, exe), 0o755);

    const { doctor } = await loadHookModules(home);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubEnv("PATH", bin);

    const checks = await doctor.runDoctorChecks(project);
    expect(checks.find(c => c.name === "Cursor CLI")?.status).toBe("ok");
  });
});
