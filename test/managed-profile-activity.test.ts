import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  connectToDatabase: vi.fn(),
  auditFind: vi.fn(),
  auditCreate: vi.fn(),
  resolveCliSessionPolicy: vi.fn(),
  requireCliAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  getRequestAccountId: (auth: { activeAccountId?: string | null; user?: { primaryAccountId?: string | null } | null }) =>
    auth.activeAccountId ?? auth.user?.primaryAccountId ?? null,
}));
vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: vi.fn(async (_userId: string, accountId: string) => ({
    accountId,
    role: "OWNER",
    authorityLevel: 100,
  })),
}));
vi.mock("@/models/CliAuditLog", () => ({
  default: {
    find: mocks.auditFind,
    create: mocks.auditCreate,
  },
}));
vi.mock("@/lib/cliAuth", () => ({
  requireCliAuth: mocks.requireCliAuth,
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: vi.fn(),
}));
vi.mock("@/lib/cliSessionPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cliSessionPolicy")>();
  return {
    ...actual,
    resolveCliSessionPolicy: mocks.resolveCliSessionPolicy,
  };
});

function activityRequest(query = "") {
  return Object.assign(new Request(`http://localhost/api/dashboard/managed-profiles/activity${query}`), {
    nextUrl: new URL(`http://localhost/api/dashboard/managed-profiles/activity${query}`),
  }) as never;
}

function sessionPolicyRequest(body: Record<string, unknown>) {
  const url = new URL("http://localhost/api/cli/session-policy");
  return Object.assign(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { nextUrl: url }
  ) as never;
}

const sampleEvent = {
  auditId: "clia_test_1",
  accountId: "acct_test",
  userId: "user_a",
  eventType: "cli_session_policy",
  tool: "claude",
  repo: "0123456789abcdef",
  branch: "main",
  mode: "required",
  reason: "Protected repository policy applies (required).",
  metadata: {
    profileId: "pprf_test",
    profileName: "Protected repository",
    deviceId: "devmac_test",
  },
  createdAt: new Date("2026-07-05T12:00:00.000Z"),
};

function mockAuditFindRows(rows: unknown[]) {
  mocks.auditFind.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
}

describe("GET /api/dashboard/managed-profiles/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test", primaryAccountId: "acct_test" },
      activeAccountId: "acct_test",
      error: null,
    });
    mockAuditFindRows([sampleEvent]);
    mocks.auditCreate.mockResolvedValue({});
  });

  it("rejects unauthenticated requests", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ error: "Developer authentication required." }), { status: 401 }),
    });
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest());
    expect(res.status).toBe(401);
  });

  it("requires workspace account", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test", primaryAccountId: null },
      activeAccountId: null,
      error: null,
    });
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest());
    expect(res.status).toBe(403);
  });

  it("returns only current account scoped events", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].id).toBe("clia_test_1");
    expect(body.events[0].eventType).toBe("cli_session_policy");
    expect(mocks.auditFind).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_test" })
    );
  });

  it("filters by tool", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    await GET(activityRequest("?tool=claude"));
    expect(mocks.auditFind).toHaveBeenCalledWith(expect.objectContaining({ tool: "claude" }));
  });

  it("filters by mode", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    await GET(activityRequest("?mode=required"));
    expect(mocks.auditFind).toHaveBeenCalledWith(expect.objectContaining({ mode: "required" }));
  });

  it("filters by eventType", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    await GET(activityRequest("?eventType=cli_pause_grant"));
    expect(mocks.auditFind).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "cli_pause_grant" })
    );
  });

  it("caps pagination limit at 100", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    await GET(activityRequest("?limit=500"));
    expect(mocks.auditFind.mock.results[0]?.value.sort().limit).toHaveBeenCalledWith(101);
  });

  it("does not return sensitive metadata fields", async () => {
    mockAuditFindRows([
      {
        ...sampleEvent,
        metadata: {
          profileId: "pprf_test",
          gitRemote: "https://github.com/org/secret.git",
          cwd: "/Users/alice/secret/repo",
          apiKey: "bhf_sk_secret",
        },
      },
    ]);
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest());
    const body = await res.json();
    expect(body.events[0].profileId).toBe("pprf_test");
    expect(JSON.stringify(body.events[0])).not.toContain("github.com");
    expect(JSON.stringify(body.events[0])).not.toContain("/Users/alice");
    expect(JSON.stringify(body.events[0])).not.toContain("bhf_sk_secret");
    expect(body.events[0].metadata).toBeUndefined();
  });

  it("includes pause grant events in activity response", async () => {
    mockAuditFindRows([
      {
        auditId: "clia_pause_grant",
        eventType: "cli_pause_grant",
        tool: "claude",
        mode: "unmanaged",
        granted: true,
        reason: "Pause granted for current repo.",
        repo: "0123456789abcdef",
        branch: "main",
        metadata: { deviceId: "devmac_test", expiresAt: "2026-07-05T13:00:00.000Z" },
        createdAt: new Date("2026-07-05T12:30:00.000Z"),
      },
    ]);
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest("?eventType=cli_pause_grant"));
    const body = await res.json();
    expect(body.events[0].eventType).toBe("cli_pause_grant");
    expect(body.events[0].granted).toBe(true);
  });

  it("includes pause deny events in activity response", async () => {
    mockAuditFindRows([
      {
        auditId: "clia_pause_deny",
        eventType: "cli_pause_deny",
        tool: "claude",
        mode: "required",
        granted: false,
        reason: "Pause denied: workspace policy requires enforcement for the current context.",
        repo: "0123456789abcdef",
        branch: "main",
        metadata: { deviceId: "devmac_test" },
        createdAt: new Date("2026-07-05T12:45:00.000Z"),
      },
    ]);
    const { GET } = await import("@/app/api/dashboard/managed-profiles/activity/route");
    const res = await GET(activityRequest("?eventType=cli_pause_deny"));
    const body = await res.json();
    expect(body.events[0].eventType).toBe("cli_pause_deny");
    expect(body.events[0].granted).toBe(false);
  });
});

describe("session-policy audit recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditCreate.mockResolvedValue({});
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      error: null,
    });
    mocks.resolveCliSessionPolicy.mockResolvedValue({
      mode: "required",
      profileId: "pprf_test",
      profileName: "Protected repository",
      sessionId: "sess_test",
      workspaceId: "acct_test",
      reason: "Protected repository policy applies (required).",
      expiresAt: null,
      cacheTtlSeconds: 300,
    });
  });

  it("records cli_session_policy with tool, mode, reason, repo hash, and branch", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/route");
    const res = await POST(
      sessionPolicyRequest({
        tool: "claude",
        repoRoot: "0123456789abcdef",
        branch: "main",
        deviceId: "devmac_test",
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "cli_session_policy",
        tool: "claude",
        mode: "required",
        repo: "0123456789abcdef",
        branch: "main",
        reason: "Protected repository policy applies (required).",
      })
    );
    const createArgs = mocks.auditCreate.mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(createArgs.metadata?.profileId).toBe("pprf_test");
    expect(createArgs.metadata?.profileName).toBe("Protected repository");
    expect(createArgs.metadata?.deviceId).toBe("devmac_test");
  });

  it("does not store raw git remote or local path in audit records", async () => {
    const { recordCliAuditEvent } = await vi.importActual<typeof import("@/lib/cliSessionPolicy")>(
      "@/lib/cliSessionPolicy"
    );
    await recordCliAuditEvent({
      auth: { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      eventType: "cli_session_policy",
      tool: "claude",
      repo: "https://github.com/org/secret.git",
      branch: "main",
      mode: "required",
      reason: "Protected repository policy applies (required).",
      metadata: {
        gitRemote: "https://github.com/org/secret.git",
        cwd: "/Users/alice/dev/secret",
        profileId: "pprf_test",
        profileName: "Protected repository",
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalled();
    const createArgs = mocks.auditCreate.mock.calls.at(-1)?.[0] as {
      repo?: string;
      metadata?: Record<string, unknown>;
    };
    expect(createArgs.repo).not.toBe("https://github.com/org/secret.git");
    expect(createArgs.repo).toMatch(/^[a-f0-9]{16}$/);
    expect(createArgs.metadata?.gitRemote).toBeUndefined();
    expect(createArgs.metadata?.cwd).toBeUndefined();
    expect(JSON.stringify(createArgs)).not.toContain("github.com");
    expect(JSON.stringify(createArgs)).not.toContain("/Users/alice");
  });
});

describe("managed profile activity dashboard UI", () => {
  it("activity route renders ProtectedDashboard activity view", async () => {
    const source = await readFile("/workspace/app/dashboard/managed-profiles/activity/page.tsx", "utf8");
    expect(source).toContain('view="managed-profiles-activity"');
    expect(source).toContain("Managed profile activity");
  });

  it("includes empty state copy and CLI suggestion", async () => {
    const source = await readFile("/workspace/components/dashboard/ManagedProfileActivityView.tsx", "utf8");
    expect(source).toContain("No managed profile activity yet.");
    expect(source).toContain("behalf profile status --tool claude");
  });

  it("renders loaded event type, mode, tool, and reason columns", async () => {
    const source = await readFile("/workspace/components/dashboard/ManagedProfileActivityView.tsx", "utf8");
    expect(source).toContain("eventTypeLabel(event.eventType)");
    expect(source).toContain("modeLabel(event.mode)");
    expect(source).toContain("{event.tool ??");
    expect(source).toContain("{event.reason}");
  });
});
