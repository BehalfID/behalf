import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCliAuth: vi.fn(),
  resolveManagedProfilePolicyDecision: vi.fn(),
  pauseCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn(async () => {}),
}));

vi.mock("@/models/CliPauseLease", () => ({
  default: {
    create: mocks.pauseCreate,
  },
}));

vi.mock("@/models/CliAuditLog", () => ({
  default: {
    create: mocks.auditCreate,
  },
}));

vi.mock("@/lib/cliAuth", () => ({
  requireCliAuth: mocks.requireCliAuth,
}));

vi.mock("@/lib/cliSessionPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cliSessionPolicy")>();
  return {
    ...actual,
    resolveManagedProfilePolicyDecision: mocks.resolveManagedProfilePolicyDecision,
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

const pausePolicy = {
  enabled: true,
  reasonRequired: true,
  maxDurationMinutes: 30,
  allowAllRepos: false,
  requireApprovalForRequiredMode: true,
};

describe("POST /api/cli/session-policy/simulate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: "user_a", accountId: "acct_a", agentId: null, source: "session" },
      error: null,
    });
    mocks.resolveManagedProfilePolicyDecision.mockResolvedValue({
      mode: "unmanaged",
      reason: "No matching managed profile.",
      profileId: null,
      profileName: null,
      matchedRule: null,
      pausePolicy,
    });
  });

  it("returns required mode from protected repo simulation", async () => {
    mocks.resolveManagedProfilePolicyDecision.mockResolvedValue({
      mode: "required",
      reason: "Protected repo requires enforcement.",
      profileId: "pprf_xxx",
      profileName: "Default managed profile",
      matchedRule: {
        type: "protected_repo",
        repoHash: "0123456789abcdef",
        mode: "required",
      },
      pausePolicy,
    });

    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(
      request("/api/cli/session-policy/simulate", {
        tool: "claude",
        repo: "0123456789abcdef",
        branch: "main",
        deviceId: "devmac_test",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("required");
    expect(body.matchedRule.type).toBe("protected_repo");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.pauseCreate).not.toHaveBeenCalled();
  });

  it("returns managed mode from tool override simulation", async () => {
    mocks.resolveManagedProfilePolicyDecision.mockResolvedValue({
      mode: "managed",
      reason: "Tool-specific policy applies (managed).",
      profileId: "pprf_xxx",
      profileName: "claude tool policy",
      matchedRule: { type: "tool_override", tool: "claude", mode: "managed" },
      pausePolicy,
    });

    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(request("/api/cli/session-policy/simulate", { tool: "claude" }));
    const body = await res.json();
    expect(body.mode).toBe("managed");
    expect(body.matchedRule.type).toBe("tool_override");
  });

  it("returns unmanaged default", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(request("/api/cli/session-policy/simulate", { tool: "claude" }));
    const body = await res.json();
    expect(body.mode).toBe("unmanaged");
  });

  it("validates invalid repo hash", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(
      request("/api/cli/session-policy/simulate", {
        tool: "claude",
        repo: "https://github.com/org/repo.git",
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.resolveManagedProfilePolicyDecision).not.toHaveBeenCalled();
  });

  it("rejects unknown fields", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(
      request("/api/cli/session-policy/simulate", {
        tool: "claude",
        gitRemote: "git@github.com:secret/repo.git",
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects mismatched account scope", async () => {
    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(
      request("/api/cli/session-policy/simulate", {
        tool: "claude",
        workspaceId: "acct_other",
      })
    );
    expect(res.status).toBe(403);
    expect(mocks.resolveManagedProfilePolicyDecision).not.toHaveBeenCalled();
  });

  it("allows agent API key auth like session-policy", async () => {
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: null, accountId: "acct_a", agentId: "agent_a", source: "agent" },
      error: null,
    });

    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(request("/api/cli/session-policy/simulate", { tool: "claude" }));
    expect(res.status).toBe(200);
  });

  it("allows anonymous auth like session-policy", async () => {
    mocks.requireCliAuth.mockResolvedValue({
      auth: { userId: null, accountId: null, agentId: null, source: "anonymous" },
      error: null,
    });

    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(request("/api/cli/session-policy/simulate", { tool: "claude" }));
    expect(res.status).toBe(200);
  });

  it("does not expose raw repo paths or remotes in response", async () => {
    mocks.resolveManagedProfilePolicyDecision.mockResolvedValue({
      mode: "required",
      reason: "Protected repo requires enforcement.",
      profileId: "pprf_xxx",
      profileName: "Default managed profile",
      matchedRule: {
        type: "protected_repo",
        repoHash: "0123456789abcdef",
        mode: "required",
      },
      pausePolicy,
    });

    const { POST } = await import("@/app/api/cli/session-policy/simulate/route");
    const res = await POST(
      request("/api/cli/session-policy/simulate", {
        tool: "claude",
        repo: "0123456789abcdef",
      })
    );
    const text = await res.text();
    expect(text).not.toContain("github.com");
    expect(text).not.toContain("/Users/");
    expect(text).toContain("0123456789abcdef");
  });
});
