import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-pause-approval-"));
}

function seedCliConfig(home: string) {
  const dir = join(home, ".behalf");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({ baseUrl: "https://example.test", deviceId: "devmac_test" }) + "\n",
    { mode: 0o600 }
  );
  writeFileSync(join(dir, "session"), "session=test", { mode: 0o600 });
}

async function loadPolicyModule(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALF" + "ID_BASE_URL", "https://example.test");
  return import("../packages/cli/src/lib/profile/policy.js");
}

async function loadProfileModule(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALF" + "ID_BASE_URL", "https://example.test");
  return import("../packages/cli/src/commands/profile.js");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CLI pause approval client", () => {
  it("PauseLease response includes approvalRequired and approvalRequestId", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            granted: false,
            approvalRequired: true,
            approvalRequestId: "apr_cli_test",
            mode: "required",
            reason: "Pause requires approval for this required managed profile context.",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const policy = await loadPolicyModule(home);
    const response = await policy.requestPauseLease({
      durationMinutes: 30,
      reason: "incident",
    });

    expect(response.approvalRequired).toBe(true);
    expect(response.approvalRequestId).toBe("apr_cli_test");
    expect(response.granted).toBe(false);
  });

  it("does not write local pause lease when approval is required", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            granted: false,
            approvalRequired: true,
            approvalRequestId: "apr_cli_test",
            mode: "required",
            reason: "Pause requires approval for this required managed profile context.",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const policy = await loadPolicyModule(home);
    await policy.requestPauseLease({
      durationMinutes: 30,
      reason: "incident",
    });

    const leasePath = join(home, ".behalf", "pause-lease.json");
    if (existsSync(leasePath)) {
      const raw = readFileSync(leasePath, "utf-8");
      expect(raw.trim()).not.toContain("apr_cli_test");
      const parsed = JSON.parse(raw) as { granted?: boolean };
      expect(parsed.granted).not.toBe(true);
    }
  });

  it("writes local pause lease only when granted", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            granted: true,
            leaseId: "pause_cli_test",
            mode: "unmanaged",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            reason: "Pause granted for current repo.",
            scope: "current_repo",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const policy = await loadPolicyModule(home);
    const response = await policy.requestPauseLease({
      durationMinutes: 30,
      reason: "incident",
    });

    expect(response.granted).toBe(true);
    const lease = policy.readLocalPauseLease();
    expect(lease?.leaseId).toBe("pause_cli_test");
  });

  it("pause command sets exit code when approval is required", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            granted: false,
            approvalRequired: true,
            approvalRequestId: "apr_cmd_test",
            mode: "required",
            reason: "Pause requires approval for this required managed profile context.",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const profile = await loadProfileModule(home);
    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });

    process.exitCode = 0;
    await profile.pauseCommand().parseAsync(["--duration", "30m", "--reason", "incident"], {
      from: "user",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/Pause requires approval/);
    expect(errors.join("\n")).toMatch(/apr_cmd_test/);
    errorSpy.mockRestore();
  });
});
