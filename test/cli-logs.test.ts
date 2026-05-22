import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadLogsCommand(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALFID_BASE_URL", "http://localhost:3000");
  vi.stubEnv("BEHALFID_API_KEY", "bhf_sk_super_secret_value");
  return {
    logs: await import("../packages/cli/src/commands/logs"),
    output: await import("../packages/cli/src/lib/output")
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CLI logs command", () => {
  it("passes log filters to the API and redacts readable output", async () => {
    const { logs, output } = await loadLogsCommand(tempDir("behalf-cli-logs-"));
    output.setJsonMode(false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("/api/logs/agent_test?");
      expect(url).toContain("allowed=false");
      expect(url).toContain("risk=high");
      expect(url).toContain("action=purchase");
      expect(url).toContain("limit=2");
      return new Response(JSON.stringify({
        logs: [{
          requestId: "req_test",
          action: "purchase",
          vendor: "stripe.com",
          allowed: false,
          reason: "Bearer bhf_sk_super_secret_value was denied",
          risk: "high",
          createdAt: "2026-05-18T00:00:00.000Z"
        }]
      }), { status: 200 });
    }));

    await logs.logsCommand().parseAsync([
      "node",
      "logs",
      "list",
      "--agent",
      "agent_test",
      "--denied",
      "--risk",
      "high",
      "--action",
      "purchase",
      "--limit",
      "2"
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    const outputText = JSON.stringify(logSpy.mock.calls);
    expect(outputText).toContain("Bearer [redacted]");
    expect(outputText).not.toContain("bhf_sk_super_secret_value");
  });

  it("rejects conflicting allowed and denied flags", async () => {
    const { logs, output } = await loadLogsCommand(tempDir("behalf-cli-logs-"));
    output.setJsonMode(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await logs.logsCommand().parseAsync([
      "node",
      "logs",
      "list",
      "--agent",
      "agent_test",
      "--allowed",
      "--denied"
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(JSON.stringify(errorSpy.mock.calls)).toContain("Use either --allowed or --denied");
    exitSpy.mockRestore();
  });
});
