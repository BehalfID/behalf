import { mkdtempSync } from "node:fs";
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

function configured(config: typeof import("../packages/cli/src/lib/config")) {
  config.writeConfig({
    apiKey: "bhf_sk_testsecret12345",
    agentId: "agent_test123",
    baseUrl: "http://localhost:3000",
  });
}

type HookModule = typeof import("../packages/cli/src/commands/hook");

function runGate(
  hook: HookModule,
  opts: {
    payload: unknown;
    verify?: (body: Record<string, unknown>) => Promise<{ allowed: boolean; approvalRequired?: boolean; reason?: string; requestId?: string }>;
    enforcement?: "advisory" | "required";
    rawStdin?: string;
  }
) {
  const out = collector();
  const err = collector();
  const code = hook.runAntigravityHook({
    stdin: async () => opts.rawStdin ?? JSON.stringify(opts.payload),
    stdout: out.sink,
    stderr: err.sink,
    verify: opts.verify,
    enforcement: opts.enforcement,
  });
  return { code, out, err };
}

beforeEach(() => {
  process.chdir(originalCwd);
});

describe("mapAntigravityToolToAction", () => {
  it("maps IDE (Windsurf-heritage) and CLI (Gemini-heritage) file tools to write_file/read_file", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    for (const name of [
      "write_to_file",
      "replace_file_content",
      "multi_replace_file_content",
      "write_file",
      "replace",
      "edit_file",
      "create_file",
    ]) {
      expect(hook.mapAntigravityToolToAction(name)).toEqual({ action: "write_file", resource: "filesystem" });
    }
    // Deletion is a filesystem mutation and is gated as write_file.
    expect(hook.mapAntigravityToolToAction("delete_file")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapAntigravityToolToAction("remove_file")).toEqual({ action: "write_file", resource: "filesystem" });

    for (const name of ["view_file", "read_file", "read_many_files", "view_code_item"]) {
      expect(hook.mapAntigravityToolToAction(name)).toEqual({ action: "read_file", resource: "filesystem" });
    }
  });

  it("maps shell tools to execute_command", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapAntigravityToolToAction("run_command")).toEqual({ action: "execute_command", resource: "shell" });
    expect(hook.mapAntigravityToolToAction("run_shell_command")).toEqual({ action: "execute_command", resource: "shell" });
  });

  it("maps web and browser tools to browse_web with a hostname resource", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapAntigravityToolToAction("web_fetch", { url: "https://api.stripe.com/v1/charges" }))
      .toEqual({ action: "browse_web", resource: "api.stripe.com" });
    expect(hook.mapAntigravityToolToAction("google_web_search", { query: "weather" }))
      .toEqual({ action: "browse_web", resource: "web" });
    expect(hook.mapAntigravityToolToAction("read_url_content", { url: "not a url" }))
      .toEqual({ action: "browse_web", resource: "web" });
    expect(hook.mapAntigravityToolToAction("browser_navigate", { url: "https://example.com/x" }))
      .toEqual({ action: "browse_web", resource: "example.com" });
    expect(hook.mapAntigravityToolToAction("browser_click", {}))
      .toEqual({ action: "browse_web", resource: "web" });
  });

  it("maps MCP tools via the documented mcp_{server}_{tool} FQN, the mcp__ alias, and mcp_context", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    // Documented Gemini CLI FQN format (single underscores).
    expect(hook.mapAntigravityToolToAction("mcp_github_search_issues"))
      .toEqual({ action: "mcp_tool", resource: "github" });
    // Claude Code-style provisional alias.
    expect(hook.mapAntigravityToolToAction("mcp__github__search_issues"))
      .toEqual({ action: "mcp_tool", resource: "github" });
    // mcp_context server name from the payload.
    expect(hook.mapAntigravityToolToAction("search_issues", {}, "github"))
      .toEqual({ action: "mcp_tool", resource: "github" });
    // MCP-prefixed but no extractable server: resource is "" so the gate can
    // treat the server identity as a missing binding argument.
    expect(hook.mapAntigravityToolToAction("mcp____tool"))
      .toEqual({ action: "mcp_tool", resource: "" });
  });

  it("maps subagent tools to spawn_agent", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    for (const name of ["task", "agent", "run_subagent", "spawn_subagent", "delegate_task"]) {
      expect(hook.mapAntigravityToolToAction(name)).toEqual({ action: "spawn_agent", resource: "agent" });
    }
  });

  it("tolerates casing, whitespace, and namespace wrappers", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapAntigravityToolToAction("  Run_Command  ")).toEqual({ action: "execute_command", resource: "shell" });
    expect(hook.mapAntigravityToolToAction("core/write_to_file")).toEqual({ action: "write_file", resource: "filesystem" });
    expect(hook.mapAntigravityToolToAction("ns__view_file")).toEqual({ action: "read_file", resource: "filesystem" });
  });

  it("returns null for ungated tools and empty input", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect(hook.mapAntigravityToolToAction("list_directory")).toBeNull();
    expect(hook.mapAntigravityToolToAction("grep_search")).toBeNull();
    expect(hook.mapAntigravityToolToAction("search_file_content")).toBeNull();
    expect(hook.mapAntigravityToolToAction("   ")).toBeNull();
  });
});

describe("runAntigravityHook decisions", () => {
  it("allows with an explicit no-opinion response when BehalfID allows the action", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const { code, out, err } = runGate(hook, {
      payload: { tool_name: "write_to_file", tool_input: { file_path: "/tmp/x" } },
      verify: async () => ({ allowed: true, reason: "ok", requestId: "req_1" }),
    });

    expect(await code).toBe(0);
    // "{}" (no opinion) — never {"decision":"allow"}, which could suppress
    // Antigravity's native review prompts.
    expect(JSON.parse(out.text)).toEqual({});
    expect(err.text).toBe("");
  });

  it("denies with stdout decision JSON and exit 2 when BehalfID denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const { code, out, err } = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "rm -rf /" } },
      verify: async () => ({ allowed: false, reason: "command_blocked", requestId: "req_1" }),
    });

    expect(await code).toBe(2);
    const decision = JSON.parse(out.text);
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("command_blocked");
    expect(err.text).toContain("command_blocked");
  });

  it("blocks approval-required actions with Action Inbox retry instructions", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const { code, out, err } = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "npm run deploy" } },
      verify: async () => ({
        allowed: false,
        approvalRequired: true,
        reason: "Permission requires approval before execution.",
        requestId: "req_1",
      }),
    });

    expect(await code).toBe(2);
    expect(JSON.parse(out.text).decision).toBe("deny");
    expect(err.text).toMatch(/approval required/i);
    expect(err.text).toMatch(/Action Inbox/);
    expect(err.text).toMatch(/retry/i);
  });

  it("allows an approved retry once the grant has been consumed server-side", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    // First attempt: approval required. Retry: the server consumed the
    // single-use grant and allows.
    const responses = [
      { allowed: false, approvalRequired: true, reason: "Permission requires approval before execution." },
      { allowed: true, reason: "Action allowed by approved permission grant." },
      // Third attempt: the grant is single-use — the server requires approval again.
      { allowed: false, approvalRequired: true, reason: "Permission requires approval before execution." },
    ];
    let call = 0;
    const verify = async () => responses[call++];
    const payload = { tool_name: "run_command", tool_input: { command: "npm run deploy" } };

    expect(await runGate(hook, { payload, verify }).code).toBe(2);
    expect(await runGate(hook, { payload, verify }).code).toBe(0);
    expect(await runGate(hook, { payload, verify }).code).toBe(2);
  });

  it("keeps blocking when the server rejects an intent mismatch", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    // Approval was granted for a different command fingerprint; the server
    // keeps requiring approval for this one.
    const { code, err } = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "rm -rf /prod-data" } },
      verify: async () => ({
        allowed: false,
        approvalRequired: true,
        reason: "Permission requires approval before execution.",
      }),
    });

    expect(await code).toBe(2);
    expect(err.text).toMatch(/approval required/i);
  });

  it("allowlists exactly the two metadata-only filesystem tools", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));

    expect([...hook.ANTIGRAVITY_READONLY_TOOLS].sort()).toEqual(["glob", "list_directory"]);
    expect(hook.isAntigravityReadonlyTool("list_directory")).toBe(true);
    expect(hook.isAntigravityReadonlyTool("glob")).toBe(true);
    expect(hook.isAntigravityReadonlyTool("grep_search")).toBe(false);
    expect(hook.isAntigravityReadonlyTool("search_file_content")).toBe(false);
  });

  it("passes list_directory and glob through without verification in both modes", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: false, reason: "should not be called" }));

    for (const tool of ["list_directory", "glob"]) {
      for (const enforcement of ["advisory", "required"] as const) {
        const { code, out, err } = runGate(hook, {
          payload: { tool_name: tool, tool_input: { pattern: "x" } },
          verify,
          enforcement,
        });
        expect(await code).toBe(0);
        expect(JSON.parse(out.text)).toEqual({});
        expect(err.text).toBe("");
      }
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(["grep_search", "search_file_content"])(
    "%s denies in required mode, warns in advisory mode, and never verifies while unmapped",
    async (tool) => {
      const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
      configured(config);
      const verify = vi.fn(async () => ({ allowed: true, reason: "should not be called" }));
      const payload = { tool_name: tool, tool_input: {} };

      const required = runGate(hook, { payload, verify, enforcement: "required" });
      expect(await required.code).toBe(2);
      expect(JSON.parse(required.out.text).decision).toBe("deny");
      expect(required.err.text).toMatch(new RegExp(`unrecognized tool "${tool}"`));

      const advisory = runGate(hook, { payload, verify, enforcement: "advisory" });
      expect(await advisory.code).toBe(0);
      expect(JSON.parse(advisory.out.text)).toEqual({});
      expect(advisory.err.text).toMatch(new RegExp(`unrecognized tool "${tool}"`));
      expect(advisory.err.text).toMatch(/allowing without verification/i);

      expect(verify).not.toHaveBeenCalled();
    }
  );

  it("allows unknown tools with an explicit warning in advisory mode", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: false, reason: "should not be called" }));

    const { code, out, err } = runGate(hook, {
      payload: { tool_name: "brand_new_google_tool", tool_input: { anything: 1 } },
      verify,
      enforcement: "advisory",
    });

    expect(await code).toBe(0);
    expect(JSON.parse(out.text)).toEqual({});
    expect(err.text).toMatch(/unrecognized tool "brand_new_google_tool"/);
    expect(err.text).toMatch(/without verification/i);
    expect(verify).not.toHaveBeenCalled();
  });

  it("DENIES unknown tools by default in required mode", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: true, reason: "should not be called" }));

    // A renamed, plugin-supplied, or undocumented tool must not bypass the gate.
    for (const tool of ["brand_new_google_tool", "plugin_mutating_tool", "save_memory"]) {
      const { code, out, err } = runGate(hook, {
        payload: { tool_name: tool, tool_input: {} },
        verify,
        enforcement: "required",
      });
      expect(await code).toBe(2);
      const decision = JSON.parse(out.text);
      expect(decision.decision).toBe("deny");
      expect(decision.reason).toContain(tool);
      expect(err.text).toMatch(/unrecognized tool/);
    }
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("runAntigravityHook payload handling", () => {
  it("normalizes shell commands from command and CommandLine argument variants", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    for (const toolInput of [{ command: "npm test" }, { CommandLine: "npm test" }, { command_line: "npm test" }]) {
      const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));
      const { code } = runGate(hook, {
        payload: { tool_name: "run_command", tool_input: toolInput, cwd: "/repo" },
        verify,
      });
      expect(await code).toBe(0);
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "agent_test123",
          action: "execute_command",
          vendor: "shell",
          policyContext: expect.objectContaining({
            source: "antigravity",
            cwd: "/repo",
            toolInput: { command: "npm test" },
          }),
        })
      );
    }
  });

  it("normalizes file writes from file_path, absolute_path, and TargetFile variants with cwd/home context", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    for (const toolInput of [
      { file_path: "src/index.ts", content: "SECRET BODY" },
      { absolute_path: "src/index.ts" },
      { TargetFile: "src/index.ts", CodeContent: "SECRET BODY" },
    ]) {
      const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));
      const { code } = runGate(hook, {
        payload: { tool_name: "write_to_file", tool_input: toolInput, cwd: "/repo" },
        verify,
      });
      expect(await code).toBe(0);
      const body = verify.mock.calls[0][0] as { policyContext: { toolInput?: unknown; cwd?: string; home?: string } };
      // Relative path plus cwd/home travel to the server, which canonicalizes
      // for allowedPaths/deniedPaths matching and approval intent binding.
      expect(body.policyContext.toolInput).toEqual({ filePath: "src/index.ts" });
      expect(body.policyContext.cwd).toBe("/repo");
      expect(typeof body.policyContext.home).toBe("string");
      // File contents are never forwarded.
      expect(JSON.stringify(body)).not.toContain("SECRET BODY");
    }
  });

  it("reads tool name and args from nested toolCall payload variants", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code } = runGate(hook, {
      payload: { toolCall: { name: "run_command", args: { command: "npm test" } } },
      verify,
    });

    expect(await code).toBe(0);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "execute_command",
        policyContext: expect.objectContaining({ toolInput: { command: "npm test" } }),
      })
    );
  });

  it("sends mcp_tool verification with the server name from mcp_context", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code } = runGate(hook, {
      payload: {
        tool_name: "search_issues",
        tool_input: { q: "bug" },
        mcp_context: { server_name: "github" },
      },
      verify,
    });

    expect(await code).toBe(0);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mcp_tool", vendor: "github" })
    );
  });

  it("advisory mode verifies a pathless file write only with an explicit warning", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code, err } = runGate(hook, {
      payload: { tool_name: "write_to_file", tool_input: {}, cwd: "/repo" },
      verify,
      enforcement: "advisory",
    });

    expect(await code).toBe(0);
    expect(err.text).toMatch(/file path argument is missing/i);
    expect(err.text).toMatch(/cannot be evaluated/i);
    const body = verify.mock.calls[0][0] as { action: string; policyContext: { toolInput?: unknown } };
    expect(body.action).toBe("write_file");
    // No usable path: policyContext carries only cwd. Server-side path
    // constraints fail closed on a missing path (path_not_permitted).
    expect(body.policyContext.toolInput).toBeUndefined();
  });
});

describe("runAntigravityHook binding-argument validation", () => {
  async function loadConfigured() {
    const mods = await loadHookModules(tempDir("behalf-home-"));
    configured(mods.config);
    return mods;
  }

  /**
   * For each payload: required mode must deny locally (no verify round-trip);
   * advisory mode must warn, then verify without the target and follow the
   * server decision.
   */
  async function expectBindingFailure(
    hook: HookModule,
    payload: unknown,
    problemPattern: RegExp
  ) {
    const requiredVerify = vi.fn(async () => ({ allowed: true, reason: "should not be called" }));
    const required = runGate(hook, { payload, verify: requiredVerify, enforcement: "required" });
    expect(await required.code).toBe(2);
    expect(JSON.parse(required.out.text).decision).toBe("deny");
    expect(required.err.text).toMatch(problemPattern);
    expect(required.err.text).toMatch(/failing closed/i);
    expect(requiredVerify).not.toHaveBeenCalled();

    const advisoryVerify = vi.fn(async () => ({ allowed: true, reason: "ok" }));
    const advisory = runGate(hook, { payload, verify: advisoryVerify, enforcement: "advisory" });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(problemPattern);
    expect(advisory.err.text).toMatch(/cannot be evaluated/i);
    expect(advisoryVerify).toHaveBeenCalledTimes(1);
  }

  it("run_command with no command argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "run_command", tool_input: {} },
      /shell command argument is missing or empty/i
    );
  });

  it("run_command with an empty command argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "run_command", tool_input: { command: "   " } },
      /shell command argument is missing or empty/i
    );
  });

  it("file mutation with no path argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "replace_file_content", tool_input: { ReplacementContent: "x" } },
      /file path argument is missing or empty/i
    );
  });

  it("file mutation with an empty path argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "write_to_file", tool_input: { file_path: "" } },
      /file path argument is missing or empty/i
    );
  });

  it("file read with no path argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "view_file", tool_input: {} },
      /file path argument is missing or empty/i
    );
  });

  it("URL navigation tools with no URL argument", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "read_url_content", tool_input: {} },
      /URL argument is missing/
    );
    await expectBindingFailure(
      hook,
      { tool_name: "browser_navigate", tool_input: {} },
      /URL argument is missing/
    );
  });

  it("web_fetch accepts its documented URL-carrying prompt argument", async () => {
    const { hook } = await loadConfigured();
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code, err } = runGate(hook, {
      payload: { tool_name: "web_fetch", tool_input: { prompt: "summarize https://example.com" } },
      verify,
      enforcement: "required",
    });
    expect(await code).toBe(0);
    expect(err.text).toBe("");

    await expectBindingFailure(
      hook,
      { tool_name: "web_fetch", tool_input: {} },
      /URL or prompt argument is missing/
    );
  });

  it("search tools require a query", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "google_web_search", tool_input: {} },
      /search query argument is missing/
    );
  });

  it("browser interactions without a URL contract are not URL-gated", async () => {
    const { hook } = await loadConfigured();
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code } = runGate(hook, {
      payload: { tool_name: "browser_click", tool_input: { selector: "#btn" } },
      verify,
      enforcement: "required",
    });
    expect(await code).toBe(0);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ action: "browse_web", vendor: "web" }));
  });

  it("MCP calls without a trustworthy server identity", async () => {
    const { hook } = await loadConfigured();
    await expectBindingFailure(
      hook,
      { tool_name: "mcp____tool", tool_input: {} },
      /MCP server identity could not be determined/
    );
  });

  it("advisory MCP fallback verifies against the generic mcp resource", async () => {
    const { hook } = await loadConfigured();
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    const { code } = runGate(hook, {
      payload: { tool_name: "mcp____tool", tool_input: {} },
      verify,
      enforcement: "advisory",
    });
    expect(await code).toBe(0);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp_tool", vendor: "mcp" }));
  });

  it("non-object tool_input is malformed: required denies, advisory warns and continues", async () => {
    const { hook } = await loadConfigured();

    const requiredVerify = vi.fn(async () => ({ allowed: true, reason: "should not be called" }));
    const required = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: "rm -rf /" },
      verify: requiredVerify,
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/not a JSON object/i);
    expect(requiredVerify).not.toHaveBeenCalled();

    const advisoryVerify = vi.fn(async () => ({ allowed: true, reason: "ok" }));
    const advisory = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: "rm -rf /" },
      verify: advisoryVerify,
      enforcement: "advisory",
    });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(/not a JSON object/i);
    // Advisory continues, but with the malformed input treated as missing —
    // the command binding warning fires too and no command is forwarded.
    expect(advisory.err.text).toMatch(/shell command argument is missing/i);
    const body = advisoryVerify.mock.calls[0][0] as { policyContext?: { toolInput?: unknown } };
    expect(body.policyContext?.toolInput).toBeUndefined();
  });

  it("malformed nested toolCall.args is treated the same way", async () => {
    const { hook } = await loadConfigured();

    const requiredVerify = vi.fn(async () => ({ allowed: true, reason: "should not be called" }));
    const required = runGate(hook, {
      payload: { toolCall: { name: "run_command", args: ["rm", "-rf", "/"] } },
      verify: requiredVerify,
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/not a JSON object/i);
    expect(requiredVerify).not.toHaveBeenCalled();
  });
});

describe("runAntigravityHook fail-open (advisory) vs fail-closed (required)", () => {
  it("malformed stdin: advisory allows with a warning, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const advisory = runGate(hook, { payload: null, rawStdin: "not json {", enforcement: "advisory" });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(/fail open/i);

    const required = runGate(hook, { payload: null, rawStdin: "not json {", enforcement: "required" });
    expect(await required.code).toBe(2);
    expect(JSON.parse(required.out.text).decision).toBe("deny");
    expect(required.err.text).toMatch(/failing closed/i);
  });

  it("non-object stdin JSON is treated as malformed", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const required = runGate(hook, { payload: null, rawStdin: "[1,2,3]", enforcement: "required" });
    expect(await required.code).toBe(2);
  });

  it("missing tool name: advisory allows, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    const advisory = runGate(hook, { payload: { cwd: "/repo" }, enforcement: "advisory" });
    expect(await advisory.code).toBe(0);

    const required = runGate(hook, { payload: { cwd: "/repo" }, enforcement: "required" });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/no tool name/i);
  });

  it("oversized stdin payload: advisory allows, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const oversized = "x".repeat(hook.ANTIGRAVITY_MAX_STDIN_BYTES + 1);

    const advisory = runGate(hook, { payload: null, rawStdin: oversized, enforcement: "advisory" });
    expect(await advisory.code).toBe(0);

    const required = runGate(hook, { payload: null, rawStdin: oversized, enforcement: "required" });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/size limit/i);
  });

  it("oversized policy context (huge command) denies in BOTH modes", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const hugeCommand = "x".repeat(hook.POLICY_CONTEXT_MAX_BYTES + 1);
    const verify = vi.fn(async () => ({ allowed: true, reason: "ok" }));

    for (const enforcement of ["advisory", "required"] as const) {
      const { code, out } = runGate(hook, {
        payload: { tool_name: "run_command", tool_input: { command: hugeCommand } },
        verify,
        enforcement,
      });
      expect(await code).toBe(2);
      expect(JSON.parse(out.text).decision).toBe("deny");
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("missing credentials: advisory allows with a warning, required denies", async () => {
    const { hook } = await loadHookModules(tempDir("behalf-home-"));
    // No config written — agent ID and API key are absent.

    const advisory = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      enforcement: "advisory",
    });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(/not configured/i);

    const required = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/failing closed/i);
  });

  it("BehalfID unreachable: advisory allows, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = async () => {
      throw new Error("Network request failed. Check your connection and base URL.");
    };

    const advisory = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "advisory",
    });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(/verification unavailable/i);

    const required = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
    expect(JSON.parse(required.out.text).decision).toBe("deny");
  });

  it("API timeout: advisory allows, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = async () => {
      throw new Error(`Request timed out after ${hook.ANTIGRAVITY_VERIFY_TIMEOUT_MS}ms.`);
    };

    const advisory = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "advisory",
    });
    expect(await advisory.code).toBe(0);

    const required = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
    expect(required.err.text).toMatch(/timed out/i);
  });

  it("invalid credentials: advisory allows with a warning, required denies", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    const verify = async () => {
      throw new Error("Invalid API key.");
    };

    const advisory = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "advisory",
    });
    expect(await advisory.code).toBe(0);
    expect(advisory.err.text).toMatch(/Invalid API key/);

    const required = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify,
      enforcement: "required",
    });
    expect(await required.code).toBe(2);
  });

  it("reads the required enforcement mode from ~/.behalf/config.json (not env)", async () => {
    const home = tempDir("behalf-home-");
    const { hook, config } = await loadHookModules(home);
    configured(config);
    config.writeExtendedConfig({ antigravityEnforcement: "required" });

    expect(hook.resolveAntigravityEnforcement()).toBe("required");

    const { code } = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: "ls" } },
      verify: async () => {
        throw new Error("Network request failed.");
      },
      // enforcement deliberately NOT passed — must come from config.
    });
    expect(await code).toBe(2);
  });

  it("defaults to advisory when no enforcement mode is configured", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);

    expect(hook.resolveAntigravityEnforcement()).toBe("advisory");
  });
});

describe("runAntigravityHook secret handling", () => {
  it("never echoes command contents or secrets to stderr, stdout, or debug traces", async () => {
    const { hook, config } = await loadHookModules(tempDir("behalf-home-"));
    configured(config);
    vi.stubEnv("BEHALFID_DEBUG", "1");
    const secretCommand = "curl -H 'Authorization: Bearer bhf_sk_supersecretvalue' https://api.example.com";

    const { code, out, err } = runGate(hook, {
      payload: { tool_name: "run_command", tool_input: { command: secretCommand } },
      verify: async () => ({ allowed: false, reason: "command_blocked" }),
    });

    expect(await code).toBe(2);
    expect(out.text).not.toContain("bhf_sk_supersecretvalue");
    expect(err.text).not.toContain("bhf_sk_supersecretvalue");
    expect(err.text).not.toContain(secretCommand);
    // Debug tracing reports presence only.
    expect(err.text).toContain("command present");
    vi.stubEnv("BEHALFID_DEBUG", "");
  });
});
