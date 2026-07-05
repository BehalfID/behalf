import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCliAuth: vi.fn(),
  requireDeveloperSessionForPause: vi.fn(),
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
  requireDeveloperSessionForPause: mocks.requireDeveloperSessionForPause,
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
    expect(mocks.recordCliAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "cli_session_policy",
        tool: "claude",
        mode: "unmanaged",
      })
    );
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

  it("allows agent API key auth", async () => {
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: null, accountId: "acct_a", agentId: "agent_a", source: "agent" },
      error: null,
    });
    mocks.resolveCliSessionPolicy.mockResolvedValue({
      mode: "managed",
      profileId: "pprf_managed",
      profileName: "Managed",
      sessionId: "sess_agent",
      workspaceId: "acct_a",
      reason: "Agent session.",
      expiresAt: null,
      cacheTtlSeconds: 300,
    });

    const { POST } = await import("@/app/api/cli/session-policy/route");
    const res = await POST(request("/api/cli/session-policy", { tool: "claude" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cli/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: { userId: "user_a", accountId: "acct_a", agentId: null, source: "session" },
      error: null,
    });
  });

  it("grants pause lease for developer session", async () => {
    mocks.requestCliPauseLease.mockResolvedValue({
      granted: true,
      leaseId: "pause_test",
      mode: "unmanaged",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reason: "Pause granted for current repo.",
      scope: "current_repo",
      tool: "claude",
      repo: "abc123",
      branch: "main",
      deviceId: "devmac_test",
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
    expect(body.scope).toBe("current_repo");
  });

  it("returns 401 for anonymous pause requests", async () => {
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: null,
      error: new Response(JSON.stringify({ error: "Developer authentication required." }), {
        status: 401,
      }),
    });

    const { POST } = await import("@/app/api/cli/pause/route");
    const res = await POST(
      request("/api/cli/pause", { durationMinutes: 30, reason: "personal project" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for agent API key pause requests", async () => {
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: null,
      error: new Response(JSON.stringify({ error: "Pause leases require a developer session." }), {
        status: 403,
      }),
    });

    const { POST } = await import("@/app/api/cli/pause/route");
    const res = await POST(
      request("/api/cli/pause", { durationMinutes: 30, reason: "personal project" })
    );
    expect(res.status).toBe(403);
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

describe("pause lease scope matching", () => {
  const auth = { userId: "user_a", accountId: "acct_a", agentId: null, source: "session" as const };

  it("does not apply current_repo pause from repo A to repo B", async () => {
    const { matchActivePauseLease } = await import("@/lib/cliSessionPolicy");
    const matched = await matchActivePauseLease(
      auth,
      { tool: "claude", repoRoot: "repo_b_hash" },
      [{ scope: "current_repo", repo: "repo_a_hash", reason: "repo A only" }]
    );
    expect(matched).toBeNull();
  });

  it("applies all-scope pause across repos", async () => {
    const { matchActivePauseLease } = await import("@/lib/cliSessionPolicy");
    const matched = await matchActivePauseLease(
      auth,
      { tool: "claude", repoRoot: "repo_b_hash" },
      [{ scope: "all", repo: null, reason: "all repos" }]
    );
    expect(matched?.reason).toBe("all repos");
  });

  it("applies current_repo pause only when repo hash matches", async () => {
    const { matchActivePauseLease } = await import("@/lib/cliSessionPolicy");
    const matched = await matchActivePauseLease(
      auth,
      { tool: "claude", repoRoot: "repo_a_hash" },
      [{ scope: "current_repo", repo: "repo_a_hash", reason: "repo A" }]
    );
    expect(matched?.reason).toBe("repo A");
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
    vi.unstubAllEnvs();
    const actual = await vi.importActual<typeof import("@/lib/cliSessionPolicy")>(
      "@/lib/cliSessionPolicy"
    );
    const result = await actual.resolveCliSessionPolicy(
      { userId: null, accountId: null, agentId: null, source: "anonymous" },
      { tool: "codex" }
    );
    expect(result.mode).toBe("unmanaged");
  });
});
