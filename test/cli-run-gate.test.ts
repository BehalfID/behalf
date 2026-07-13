import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadModules(home: string) {
  vi.resetModules();
  stubCliHome(home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  return {
    config: await import("../packages/cli/src/lib/config"),
    run: await import("../packages/cli/src/commands/run"),
  };
}

// Returns an object; always access .output via the object (not destructured) so the getter stays live.
function makeStderr() {
  let captured = "";
  const stream = { write: (s: string | Uint8Array) => { captured += String(s); return true; } };
  return { stream, get output() { return captured; } };
}

function allowedFetch(extra?: object) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({ requestId: "req_ok", allowed: true, reason: "Allowed", risk: "medium", ...extra }),
      { status: 200 }
    )
  );
}

function deniedFetch(extra?: object) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        requestId: "req_denied", allowed: false, approvalRequired: false,
        reason: "Blocked", risk: "high", ...extra,
      }),
      { status: 200 }
    )
  );
}

function approvalFetch() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        requestId: "req_apr",
        allowed: false,
        approvalRequired: true,
        approvalId: "apr_abc123",
        reason: "Requires approval",
        risk: "high",
      }),
      { status: 200 }
    )
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── inferCommandMeta ──────────────────────────────────────────────────────────

describe("inferCommandMeta", () => {
  it("infers vercel production deploy", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["vercel", "deploy", "--prod"])).toEqual({
      action: "deploy_production", resource: "vercel", risk: "high",
    });
  });

  it("infers npm run deploy:prod", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["npm", "run", "deploy:prod"])).toEqual({
      action: "deploy_production", resource: "deployment", risk: "high",
    });
  });

  it("infers npm run deploy", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["npm", "run", "deploy"])).toEqual({
      action: "deploy_production", resource: "deployment", risk: "high",
    });
  });

  it("infers prisma migrate deploy", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["prisma", "migrate", "deploy"])).toEqual({
      action: "database_migration", resource: "database", risk: "high",
    });
  });

  it("infers rm -rf as delete_files", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["rm", "-rf", "/tmp/test"])).toEqual({
      action: "delete_files", resource: "filesystem", risk: "high",
    });
  });

  it("infers rm -r as delete_files", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["rm", "-r", "dist/"])).toEqual({
      action: "delete_files", resource: "filesystem", risk: "high",
    });
  });

  it("falls back to run_command for unknown commands", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    expect(run.inferCommandMeta(["echo", "hello"])).toEqual({
      action: "run_command", resource: "shell", risk: "medium",
    });
  });

  it("falls back for bare vercel preview deploy (no --prod)", async () => {
    const { run } = await loadModules(tempDir("behalf-"));
    const meta = run.inferCommandMeta(["vercel", "deploy"]);
    expect(meta.action).toBe("run_command");
  });
});

// ── gateAndExec — allowed ─────────────────────────────────────────────────────

describe("gateAndExec — allowed", () => {
  it("spawns the command when allowed and returns 0", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", allowedFetch());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["echo", "hello"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith("echo", ["hello"], { stdio: "inherit" });
    expect(se.output).toContain("✓ Allowed");
  });

  it("streams child stdout/stderr via stdio:inherit", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", allowedFetch());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["echo", "hello"], {}, { spawn, stderr: se.stream });

    const [, , spawnOpts] = spawn.mock.calls[0];
    expect(spawnOpts).toEqual({ stdio: "inherit" });
  });

  it("passes child exit code through when command fails", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", allowedFetch());

    const spawn = vi.fn(() => ({ status: 42 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["failing-cmd"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(42);
    expect(spawn).toHaveBeenCalled();
  });

  it("sends inferred action and agentId to verify endpoint", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, reqOpts: RequestInit) => {
      capturedBody = JSON.parse(reqOpts.body as string);
      return new Response(JSON.stringify({ requestId: "req_ok", allowed: true, reason: "ok", risk: "high" }), { status: 200 });
    }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["vercel", "deploy", "--prod"], {}, { spawn, stderr: se.stream });

    expect(capturedBody.action).toBe("deploy_production");
    expect(capturedBody.agentId).toBe("agent_test");
  });
});

// ── gateAndExec — denied ──────────────────────────────────────────────────────

describe("gateAndExec — denied", () => {
  it("does NOT spawn when denied", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", deniedFetch());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["echo", "hello"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(se.output).toContain("BLOCKED ACTION");
    expect(se.output).toContain("req_denied");
  });

  it("prints a blocked action receipt with reason and requestId", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", deniedFetch({ reason: "This action is forbidden" }));

    const se = makeStderr();
    await run.gateAndExec(["npm", "run", "deploy"], {}, { spawn: vi.fn(() => ({ status: 0 }) as never), stderr: se.stream });

    expect(se.output).toContain("BLOCKED ACTION");
    expect(se.output).toContain("This action is forbidden");
    expect(se.output).toContain("req_denied");
  });
});

// ── gateAndExec — approval required ──────────────────────────────────────────

describe("gateAndExec — approval required", () => {
  it("does NOT spawn when approval is required", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", approvalFetch());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["vercel", "deploy", "--prod"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(se.output).toContain("APPROVAL REQUIRED");
    expect(se.output).toContain("req_apr");
    expect(se.output).toContain("apr_abc123");
    expect(se.output).toContain("dashboard/approvals");
    expect(se.output).toContain("Command not executed");
  });
});

// ── gateAndExec — verify failure / fail closed ────────────────────────────────

describe("gateAndExec — verify failure / fail closed", () => {
  it("does NOT spawn when verify throws a network error", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network error"); }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["npm", "run", "deploy:prod"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(se.output).toContain("Fail closed");
  });

  it("does NOT spawn when verify returns a non-OK HTTP status", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    ));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["echo", "hello"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(se.output).toContain("Fail closed");
  });

  it("throws when agentId is missing", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test" }); // no agentId

    await expect(
      run.gateAndExec(["echo", "hello"], {}, { spawn: vi.fn() as never })
    ).rejects.toThrow("Agent ID not configured");
  });

  it("throws when apiKey is missing", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ agentId: "agent_test" }); // no apiKey

    await expect(
      run.gateAndExec(["echo", "hello"], {}, { spawn: vi.fn() as never })
    ).rejects.toThrow("API key not configured");
  });
});

// ── gateAndExec — override flags ──────────────────────────────────────────────

describe("gateAndExec — override flags", () => {
  it("sends overridden action to verify", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, reqOpts: RequestInit) => {
      capturedBody = JSON.parse(reqOpts.body as string);
      return new Response(JSON.stringify({ requestId: "req_ok", allowed: true, reason: "ok", risk: "low" }), { status: 200 });
    }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["echo", "test"], { action: "custom_action" }, { spawn, stderr: se.stream });

    expect(capturedBody.action).toBe("custom_action");
  });

  it("sends vendor override when --vendor is passed", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, reqOpts: RequestInit) => {
      capturedBody = JSON.parse(reqOpts.body as string);
      return new Response(JSON.stringify({ requestId: "req_ok", allowed: true, reason: "ok", risk: "low" }), { status: 200 });
    }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["echo", "test"], { vendor: "stripe.com" }, { spawn, stderr: se.stream });

    expect(capturedBody.vendor).toBe("stripe.com");
  });

  it("shows overridden risk in pre-verify message", async () => {
    const home = tempDir("behalf-");
    const { config, run } = await loadModules(home);
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", allowedFetch());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["echo", "test"], { risk: "low" }, { spawn, stderr: se.stream });

    expect(se.output).toContain("risk: low");
  });
});
