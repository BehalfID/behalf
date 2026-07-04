import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCliAuth: vi.fn(),
  resolveCliSessionPolicy: vi.fn(),
  recordCliAuditEvent: vi.fn(),
  requestCliPauseLease: vi.fn(),
  pauseFind: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn(async () => {}),
}));

vi.mock("@/models/CliPauseLease", () => ({
  default: {
    find: mocks.pauseFind,
  },
}));

vi.mock("@/lib/cliAuth", () => ({
  requireCliAuth: mocks.requireCliAuth,
  requireCliAuthStrict: vi.fn(async (request: Request) => {
    const result = await mocks.requireCliAuth(request);
    if (result.auth?.source === "anonymous") {
      return { auth: null, error: new Response(JSON.stringify({ error: "auth" }), { status: 401 }) };
    }
    return result;
  }),
}));

vi.mock("@/lib/cliSessionPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cliSessionPolicy")>();
  return {
    ...actual,
    resolveCliSessionPolicy: mocks.resolveCliSessionPolicy,
    recordCliAuditEvent: mocks.recordCliAuditEvent,
    requestCliPauseLease: mocks.requestCliPauseLease,
  };
});

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: vi.fn(),
}));

function request(path: string, body?: unknown) {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url, init), { nextUrl: url }) as never;
}

describe("POST /api/cli/session-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: "user_a", accountId: "acct_a", agentId: null, source: "session" },
      error: null,
    });
  });

  it("returns unmanaged policy by default", async () => {
    mocks.resolveCliSessionPolicy.mockResolvedValue({
      mode: "unmanaged",
      profileId: null,
      profileName: null,
      sessionId: "sess_test",
      workspaceId: "acct_a",
      reason: "No matching managed profile.",
      expiresAt: null,
      cacheTtlSeconds: 300,
    });

    const { POST } = await import("@/app/api/cli/session-policy/route");
    const res = await POST(
      request("/api/cli/session-policy", {
        tool: "claude",
        branch: "main",
        deviceId: "devmac_test",
        cliVersion: "0.2.8",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("unmanaged");
    expect(mocks.recordCliAuditEvent).toHaveBeenCalled();
  });

  it("validates tool name", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/route");
    const res = await POST(request("/api/cli/session-policy", { tool: "vim" }));
    expect(res.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/route");
    const res = await POST(
      request("/api/cli/session-policy", { tool: "claude", apiKey: "bhf_sk_secret" })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/cli/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: "user_a", accountId: "acct_a", agentId: null, source: "session" },
      error: null,
    });
  });

  it("grants pause lease", async () => {
    mocks.requestCliPauseLease.mockResolvedValue({
      granted: true,
      leaseId: "pause_test",
      mode: "unmanaged",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reason: "Pause granted for current repo.",
    });

    const { POST } = await import("@/app/api/cli/pause/route");
    const res = await POST(
      request("/api/cli/pause", {
        durationMinutes: 30,
        reason: "personal project",
        scope: "current_repo",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.granted).toBe(true);
    expect(body.leaseId).toBe("pause_test");
  });

  it("requires reason", async () => {
    mocks.requestCliPauseLease.mockResolvedValue({
      granted: false,
      mode: "unmanaged",
      reason: "reason is required.",
    });

    const { POST } = await import("@/app/api/cli/pause/route");
    const res = await POST(request("/api/cli/pause", { durationMinutes: 30 }));
    expect(res.status).toBe(400);
  });

  it("denies pause when policy is required", async () => {
    mocks.requestCliPauseLease.mockResolvedValue({
      granted: false,
      mode: "required",
      reason: "Pause denied: workspace policy requires enforcement for the current context.",
    });

    const { POST } = await import("@/app/api/cli/pause/route");
    const res = await POST(
      request("/api/cli/pause", {
        durationMinutes: 30,
        reason: "personal project",
      })
    );
    expect(res.status).toBe(403);
  });

  it("enforces max duration in validation", async () => {
    const { validatePauseInput, MAX_PAUSE_MINUTES } = await import("@/lib/cliSessionPolicy");
    expect(validatePauseInput({ durationMinutes: MAX_PAUSE_MINUTES + 1, reason: "test" })).toMatch(
      /cannot exceed/
    );
  });
});

describe("resolveCliSessionPolicy", () => {
  beforeEach(() => {
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("honors dev CLI policy mode override", async () => {
    vi.stubEnv("BEHALF" + "ID_CLI_POLICY_MODE", "required");
    const { readDevCliPolicyMode } = await import("@/lib/cliSessionPolicy");
    expect(readDevCliPolicyMode()).toBe("required");
    vi.unstubAllEnvs();
  });

  it("defaults to unmanaged without account", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const { resolveCliSessionPolicy } = await import("@/lib/cliSessionPolicy");
    const result = await resolveCliSessionPolicy(
      { userId: null, accountId: null, agentId: null, source: "anonymous" },
      { tool: "codex" }
    );
    expect(result.mode).toBe("unmanaged");
  });
});
