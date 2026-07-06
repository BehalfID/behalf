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

async function loadPauseApprovalModule(home: string) {
  vi.resetModules();
  vi.stubEnv("HOME", home);
  vi.stubEnv("BEHALF" + "ID_BASE_URL", "https://example.test");
  return import("../packages/cli/src/lib/profile/pause-approval.js");
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
    expect(errors.join("\n")).toMatch(/Approve it in the dashboard/);
    expect(errors.join("\n")).toMatch(/https:\/\/example\.test\/dashboard\/approvals/);
    errorSpy.mockRestore();
  });

  it("pause status prints pending message", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            approvalRequestId: "apr_status_pending",
            status: "pending",
            grantExpiresAt: null,
            reason: "Pause requires approval for this required managed profile context.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const profile = await loadProfileModule(home);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });

    await profile.pauseCommand().parseAsync(["status", "apr_status_pending"], { from: "user" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logs.join("\n")).toMatch(/still pending/);
    logSpy.mockRestore();
  });

  it("pause status prints approved/denied/expired/used messages", async () => {
    const home = tempHome();
    seedCliConfig(home);
    const pauseApproval = await loadPauseApprovalModule(home);

    expect(pauseApproval.formatPauseApprovalStatusMessage("approved")).toMatch(/approved/);
    expect(pauseApproval.formatPauseApprovalStatusMessage("denied")).toMatch(/denied/);
    expect(pauseApproval.formatPauseApprovalStatusMessage("expired")).toMatch(/expired/);
    expect(pauseApproval.formatPauseApprovalStatusMessage("used")).toMatch(/already used/);
  });

  it("pause status JSON mode returns structured response", async () => {
    const home = tempHome();
    seedCliConfig(home);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            approvalRequestId: "apr_status_json",
            status: "approved",
            grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            reason: "Pause requires approval for this required managed profile context.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const profile = await loadProfileModule(home);
    const output = await import("../packages/cli/src/lib/output.js");
    output.setJsonMode(true);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });

    await profile.pauseCommand().parseAsync(["status", "apr_status_json"], { from: "user" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const parsed = JSON.parse(logs.join("")) as { status: string };
    expect(parsed.status).toBe("approved");
    logSpy.mockRestore();
    output.setJsonMode(false);
  });

  it("pause --wait polls pending then approved, retries pause, writes lease only after grant", async () => {
    const home = tempHome();
    seedCliConfig(home);
    let pauseCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/cli/pause/approvals/")) {
          return new Response(
            JSON.stringify({
              approvalRequestId: "apr_wait_test",
              status: "approved",
              grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
              reason: "Pause requires approval for this required managed profile context.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (!url.endsWith("/api/cli/pause")) {
          throw new Error(`Unexpected fetch URL: ${url}`);
        }

        pauseCalls += 1;
        return new Response(
          JSON.stringify({
            granted: true,
            leaseId: "pause_wait_test",
            mode: "required",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            reason: "Pause granted for current repo.",
            scope: "current_repo",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const pauseApproval = await loadPauseApprovalModule(home);
    const granted = await pauseApproval.waitForPauseApprovalGrant(
      "apr_wait_test",
      { durationMinutes: 30, reason: "incident" },
      60_000,
      {
        sleep: async () => undefined,
        now: () => Date.now(),
        fetchStatus: pauseApproval.fetchPauseApprovalStatus,
        requestLease: (await loadPolicyModule(home)).requestPauseLease,
      }
    );

    expect(granted.granted).toBe(true);
    expect(pauseCalls).toBe(1);
    const policy = await loadPolicyModule(home);
    expect(policy.readLocalPauseLease()?.leaseId).toBe("pause_wait_test");
  });

  it("pause --wait exits nonzero on denied", async () => {
    const home = tempHome();
    seedCliConfig(home);
    const pauseApproval = await loadPauseApprovalModule(home);

    await expect(
      pauseApproval.waitForPauseApprovalGrant(
        "apr_denied",
        { durationMinutes: 30, reason: "incident" },
        60_000,
        {
          sleep: async () => undefined,
          now: () => Date.now(),
          fetchStatus: async () => ({
            approvalRequestId: "apr_denied",
            status: "denied",
            grantExpiresAt: null,
            reason: "denied",
          }),
          requestLease: async () => ({
            granted: false,
            mode: "required",
            reason: "should not be called",
          }),
        }
      )
    ).rejects.toMatchObject({ code: "denied" });
  });

  it("pause --wait exits nonzero on timeout", async () => {
    const home = tempHome();
    seedCliConfig(home);
    const pauseApproval = await loadPauseApprovalModule(home);
    let now = 0;

    await expect(
      pauseApproval.waitForPauseApprovalGrant(
        "apr_timeout",
        { durationMinutes: 30, reason: "incident" },
        1_000,
        {
          sleep: async () => {
            now += 5_000;
          },
          now: () => now,
          fetchStatus: async () => ({
            approvalRequestId: "apr_timeout",
            status: "pending",
            grantExpiresAt: null,
            reason: "pending",
          }),
          requestLease: async () => ({
            granted: false,
            mode: "required",
            reason: "should not be called",
          }),
        }
      )
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("pause --wait does not write local lease while still pending", async () => {
    const home = tempHome();
    seedCliConfig(home);
    const pauseApproval = await loadPauseApprovalModule(home);
    let now = 0;

    await expect(
      pauseApproval.waitForPauseApprovalGrant(
        "apr_pending_only",
        { durationMinutes: 30, reason: "incident" },
        4_000,
        {
          sleep: async () => {
            now += 5_000;
          },
          now: () => now,
          fetchStatus: async () => ({
            approvalRequestId: "apr_pending_only",
            status: "pending",
            grantExpiresAt: null,
            reason: "pending",
          }),
          requestLease: async () => ({
            granted: true,
            leaseId: "should_not_write",
            mode: "required",
            reason: "should not be called",
          }),
        }
      )
    ).rejects.toMatchObject({ code: "timeout" });

    const policy = await loadPolicyModule(home);
    expect(policy.readLocalPauseLease()).toBeNull();
  });

  it("wait timeout parser supports m and s and caps at 30 minutes", async () => {
    const home = tempHome();
    seedCliConfig(home);
    const pauseApproval = await loadPauseApprovalModule(home);

    expect(pauseApproval.parseWaitTimeout("2m")).toBe(120_000);
    expect(pauseApproval.parseWaitTimeout("30s")).toBe(30_000);
    expect(pauseApproval.parseWaitTimeout("45m")).toBe(pauseApproval.MAX_PAUSE_WAIT_TIMEOUT_MS);
    expect(pauseApproval.parseWaitTimeout("2h")).toBe(pauseApproval.MAX_PAUSE_WAIT_TIMEOUT_MS);
  });
});
