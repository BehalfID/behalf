import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();

const agentDetail = {
  agent: {
    agentId: "agent_test123",
    name: "Coding Agent",
    status: "active",
    guidelines: ["Use BehalfID before risky actions."]
  },
  permissions: [
    {
      permissionId: "perm_read",
      action: "browse_web",
      resource: "web",
      allowedActions: ["read public web pages"],
      blockedActions: ["submit forms", "make purchases"],
      requiresApproval: false,
      status: "active"
    },
    {
      permissionId: "perm_deploy",
      action: "deploy_production",
      resource: "vercel",
      allowedActions: ["deploy preview"],
      blockedActions: ["promote production"],
      requiresApproval: true,
      status: "active"
    }
  ]
};

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadCliModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  return {
    config: await import("../packages/cli/src/lib/config"),
    cache: await import("../packages/cli/src/lib/passport-cache"),
    setup: await import("../packages/cli/src/lib/mcp-setup"),
    context: await import("../packages/cli/src/lib/context-generator"),
    doctor: await import("../packages/cli/src/commands/doctor"),
    run: await import("../packages/cli/src/commands/run"),
    mcpServer: await import("../packages/cli/src/lib/mcp-server")
  };
}

beforeEach(() => {
  process.chdir(originalCwd);
});

describe("CLI MCP project setup", () => {
  it("writes .behalf/context.md and .mcp.json with fail-closed instructions", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { setup } = await loadCliModules(home);

    const result = setup.writeProjectSetup(agentDetail, { cwd: project });

    const contextMd = readFileSync(join(project, ".behalf/context.md"), "utf-8");
    const mcpJson = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8"));

    expect(result.changed).toEqual(expect.arrayContaining([
      join(project, ".behalf/context.md"),
      join(project, ".mcp.json")
    ]));
    expect(mcpJson.mcpServers.behalfid).toEqual({
      type: "stdio",
      command: "behalf",
      args: ["mcp", "start"]
    });
    expect(contextMd).toContain("you MUST call the `verify_action`");
    expect(contextMd).toContain("If `verify_action` is unavailable, errors, or cannot be reached, do not execute the action.");
    expect(contextMd).toContain("### Blocked Actions");
    expect(contextMd).toContain("### Approval-Required Actions");
  });

  it("preserves and merges existing .mcp.json servers", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { setup } = await loadCliModules(home);

    writeFileSync(
      join(project, ".mcp.json"),
      JSON.stringify({ mcpServers: { filesystem: { command: "fs-mcp" } } }, null, 2)
    );

    setup.writeProjectSetup(agentDetail, { cwd: project });

    const mcpJson = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8"));
    expect(mcpJson.mcpServers.filesystem).toEqual({ command: "fs-mcp" });
    expect(mcpJson.mcpServers.behalfid.args).toEqual(["mcp", "start"]);
  });
});

describe("CLI doctor", () => {
  it("detects missing CLI and MCP config without hard failures", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { doctor } = await loadCliModules(home);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const checks = await doctor.runDoctorChecks(project);

    expect(checks.find(c => c.name === "API key")?.status).toBe("warn");
    expect(checks.find(c => c.name === "Agent ID")?.status).toBe("warn");
    expect(checks.find(c => c.name === "MCP config")?.status).toBe("warn");
    expect(checks.some(c => c.status === "error")).toBe(false);
  });

  it("detects valid CLI config and project setup with mocked health calls", async () => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    const { config, setup, doctor } = await loadCliModules(home);

    config.writeConfig({
      apiKey: "bhf_sk_testsecret12345",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000"
    });
    setup.writeProjectSetup(agentDetail, { cwd: project });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const checks = await doctor.runDoctorChecks(project);

    expect(checks.find(c => c.name === "API key")?.status).toBe("ok");
    expect(checks.find(c => c.name === "Agent ID")?.status).toBe("ok");
    expect(checks.find(c => c.name === "API health")?.status).toBe("ok");
    expect(checks.find(c => c.name === "MCP server entry")?.status).toBe("ok");
    expect(checks.find(c => c.name === "Context file")?.status).toBe("ok");
  });
});

describe("CLI output redaction", () => {
  it("redacts secrets in human and JSON error output", async () => {
    const output = await import("../packages/cli/src/lib/output");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    output.setJsonMode(false);
    output.printError("Bearer bhf_sk_super_secret_value failed with bhf_dev_super_secret_value");
    output.setJsonMode(true);
    output.printError("webhook secret whsec_super_secret_value failed");

    const calls = JSON.stringify(errorSpy.mock.calls);
    expect(calls).not.toContain("bhf_sk_super_secret_value");
    expect(calls).not.toContain("bhf_dev_super_secret_value");
    expect(calls).not.toContain("whsec_super_secret_value");
    expect(calls).toContain("Bearer [redacted]");
    expect(calls).toContain("bhf_dev_[redacted]");
    expect(calls).toContain("whsec_[redacted]");
    output.setJsonMode(false);
    errorSpy.mockRestore();
  });
});

describe("Claude and Codex launchers", () => {
  it.each(["claude", "codex"])("launches %s without leaking API keys", async (tool) => {
    const home = tempDir("behalf-home-");
    const project = tempDir("behalf-project-");
    process.chdir(project);
    const { config, cache, run } = await loadCliModules(home);

    config.writeConfig({
      apiKey: "bhf_sk_super_secret_value",
      agentId: "agent_test123",
      baseUrl: "http://localhost:3000"
    });
    cache.writeCachedDetail("agent_test123", agentDetail);

    let stdout = "";
    let stderr = "";
    const spawn = vi.fn(() => ({ status: 0 }) as never);

    const status = await run.launchTool(tool, ["--version"], {
      spawn,
      stdout: { write: (chunk: string | Uint8Array) => { stdout += String(chunk); return true; } },
      stderr: { write: (chunk: string | Uint8Array) => { stderr += String(chunk); return true; } }
    });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith(tool, ["--version"], { stdio: "inherit" });
    expect(stdout).toContain(`Launching ${tool}`);
    expect(stdout + stderr).toContain("agent_test123");
    expect(stdout + stderr).not.toContain("bhf_sk_super_secret_value");
  });
});

describe("MCP server metadata and verify behavior", () => {
  it("describes verify-before-execute and fail-closed behavior", async () => {
    const home = tempDir("behalf-home-");
    const { mcpServer } = await loadCliModules(home);

    const descriptions = mcpServer.MCP_TOOLS.map(t => t.description).join("\n");

    expect(descriptions).toContain("BEFORE executing");
    expect(descriptions).toContain("do not execute");
    expect(descriptions).toContain("fail closed");
    expect(descriptions).toContain("pause for user approval");
  });

  it("surfaces denied verify results through verify_action", async () => {
    const home = tempDir("behalf-home-");
    const { mcpServer } = await loadCliModules(home);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        requestId: "req_denied",
        allowed: false,
        reason: "Action is blocked by this permission.",
        risk: "high"
      }), { status: 200 }))
    );

    const result = await mcpServer.callMcpTool(
      { agentId: "agent_test123", apiKey: "bhf_sk_testsecret12345", baseUrl: "http://localhost:3000" },
      "verify_action",
      { action: "send_email", vendor: "gmail.com" }
    );

    const text = result?.content[0].text;
    expect(text).toContain('"allowed": false');
    expect(text).toContain("Action is blocked by this permission.");
    expect(result).not.toHaveProperty("isError");
  });
});
