/**
 * Shadow mode — CLI gateAndExec and buildVerificationLogQuery tests.
 * Proves that shadow mode executes commands regardless of policy outcome,
 * and that logs can be filtered by shadow field.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadModules(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  const config = await import("../packages/cli/src/lib/config");
  const run = await import("../packages/cli/src/commands/run");
  return { config, run };
}

function makeStderr() {
  let output = "";
  return {
    stream: { write: (s: string | Uint8Array) => { output += String(s); return true; } },
    get output() { return output; }
  };
}

function shadowDeniedResponse() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        requestId: "req_shadow",
        allowed: true,
        shadow: true,
        shadowDecision: { allowed: false, reason: "No active permission.", risk: "high" },
        reason: "Shadow mode: action would have been denied.",
        risk: "high"
      }),
      { status: 200 }
    )
  );
}

function shadowAllowedResponse() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        requestId: "req_shadow_allow",
        allowed: true,
        shadow: true,
        shadowDecision: { allowed: true, reason: "Action allowed.", risk: "low" },
        reason: "Shadow mode: action would have been allowed.",
        risk: "low"
      }),
      { status: 200 }
    )
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── gateAndExec ───────────────────────────────────────────────────────────────

describe("gateAndExec — shadow mode", () => {
  it("executes the command even when policy would have denied", async () => {
    const { config, run } = await loadModules(tempDir("behalf-shadow-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", shadowDeniedResponse());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(
      ["npm", "run", "deploy"],
      { shadow: true },
      { spawn, stderr: se.stream }
    );

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith("npm", ["run", "deploy"], expect.any(Object));
    expect(se.output).toContain("[shadow]");
    expect(se.output).toContain("WOULD HAVE BLOCKED");
    expect(se.output).toContain("No active permission.");
  });

  it("sends shadow=true in the API request body", async () => {
    const { config, run } = await loadModules(tempDir("behalf-shadow-body-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });

    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, reqOpts: RequestInit) => {
      capturedBody = JSON.parse(reqOpts.body as string);
      return new Response(
        JSON.stringify({
          requestId: "req_ok", allowed: true, shadow: true,
          shadowDecision: { allowed: true, reason: "ok", risk: "low" },
          reason: "shadow", risk: "low"
        }),
        { status: 200 }
      );
    }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    await run.gateAndExec(["echo", "hi"], { shadow: true }, { spawn, stderr: makeStderr().stream });

    expect(capturedBody.shadow).toBe(true);
  });

  it("prints [shadow] prefix and would-allow message when policy would have allowed", async () => {
    const { config, run } = await loadModules(tempDir("behalf-shadow-allow-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", shadowAllowedResponse());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    await run.gateAndExec(["echo", "hi"], { shadow: true }, { spawn, stderr: se.stream });

    expect(se.output).toContain("[shadow]");
    expect(se.output).toContain("Would have been allowed");
    expect(spawn).toHaveBeenCalled();
  });

  it("executes the command when BEHALFID_SHADOW env var is set, without --shadow flag", async () => {
    const { config, run } = await loadModules(tempDir("behalf-env-shadow-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubEnv("BEHALFID_SHADOW", "true");
    vi.stubGlobal("fetch", shadowDeniedResponse());

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["echo", "hello"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(0);
    expect(se.output).toContain("[shadow]");
  });

  it("proceeds even if the verify call fails in shadow mode", async () => {
    const { config, run } = await loadModules(tempDir("behalf-shadow-fail-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network error"); }));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["echo", "hi"], { shadow: true }, { spawn, stderr: se.stream });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalled();
    expect(se.output).toContain("shadow");
  });

  it("normal mode with denied policy still blocks execution", async () => {
    const { config, run } = await loadModules(tempDir("behalf-normal-deny-"));
    config.writeConfig({ apiKey: "bhf_sk_test", agentId: "agent_test" });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({ requestId: "req_denied", allowed: false, reason: "Blocked", risk: "high" }),
        { status: 200 }
      )
    ));

    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const se = makeStderr();

    const code = await run.gateAndExec(["npm", "run", "deploy"], {}, { spawn, stderr: se.stream });

    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(se.output).toContain("BLOCKED ACTION");
    expect(se.output).not.toContain("[shadow]");
  });
});

// ── buildVerificationLogQuery shadow filter ───────────────────────────────────

describe("buildVerificationLogQuery — shadow filter", () => {
  it("filters for shadow logs with shadow=true param", async () => {
    vi.resetModules();
    const { buildVerificationLogQuery } = await import("@/lib/verificationLogs");
    const query = buildVerificationLogQuery(
      new URLSearchParams("shadow=true"),
      { accountId: "acct_test" }
    );
    expect(query.shadow).toBe(true);
  });

  it("excludes shadow logs with shadow=false param", async () => {
    vi.resetModules();
    const { buildVerificationLogQuery } = await import("@/lib/verificationLogs");
    const query = buildVerificationLogQuery(
      new URLSearchParams("shadow=false"),
      { accountId: "acct_test" }
    );
    expect(query.$or).toEqual([{ shadow: false }, { shadow: { $exists: false } }]);
  });

  it("does not filter by shadow when param is absent", async () => {
    vi.resetModules();
    const { buildVerificationLogQuery } = await import("@/lib/verificationLogs");
    const query = buildVerificationLogQuery(
      new URLSearchParams(),
      { accountId: "acct_test" }
    );
    expect(query.shadow).toBeUndefined();
    expect(query.$or).toBeUndefined();
  });
});
