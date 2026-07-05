import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireVerifiedDeveloperApi: vi.fn(),
  requireWorkspaceMutationActor: vi.fn(),
  connectToDatabase: vi.fn(),
  policyFindOne: vi.fn(),
  policyFindOneAndUpdate: vi.fn(),
  accountFindOne: vi.fn(),
  pauseFind: vi.fn(),
  pauseCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: mocks.requireVerifiedDeveloperApi,
  getRequestAccountId: (auth: { activeAccountId?: string | null; user?: { primaryAccountId?: string | null } | null }) =>
    auth.activeAccountId ?? auth.user?.primaryAccountId ?? null,
}));
vi.mock("@/lib/workspaceActor", () => ({
  requireWorkspaceMutationActor: mocks.requireWorkspaceMutationActor,
}));
vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: vi.fn(async () => ({
    accountId: "acct_test",
    role: "OWNER",
    authorityLevel: 100,
  })),
  serializeWorkspaceAuthority: vi.fn(() => ({ role: "OWNER", roleLabel: "Owner", authorityLevel: 100 })),
}));
vi.mock("@/models/ManagedProfilePolicy", () => ({
  default: {
    findOne: mocks.policyFindOne,
    findOneAndUpdate: mocks.policyFindOneAndUpdate,
  },
}));
vi.mock("@/models/Account", () => ({
  default: {
    findOne: mocks.accountFindOne,
  },
}));
vi.mock("@/models/CliPauseLease", () => ({
  default: {
    find: mocks.pauseFind,
    create: mocks.pauseCreate,
  },
}));
vi.mock("@/models/CliAuditLog", () => ({
  default: {
    create: mocks.auditCreate,
  },
}));

function dashboardRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/dashboard/managed-profiles", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json", origin: "http://localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

const basePolicyBody = {
  enabled: true,
  timezone: "UTC",
  workHours: { enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
  duringHoursMode: "managed",
  outsideHoursMode: "unmanaged",
  defaultMode: "unmanaged",
  toolModes: { claude: "required" },
  protectedRepos: [{ repoHash: "abc123def4567890", label: "Prod", mode: "required", enabled: true }],
  pausePolicy: {
    enabled: true,
    reasonRequired: true,
    maxDurationMinutes: 120,
    allowAllRepos: false,
    requireApprovalForRequiredMode: false,
  },
};

describe("managed profile policy validation", () => {
  it("rejects invalid mode", async () => {
    const { validateManagedProfilePolicyInput } = await import("@/lib/managedProfilePolicy");
    const result = validateManagedProfilePolicyInput({
      ...basePolicyBody,
      defaultMode: "strict",
    });
    expect(result.error).toMatch(/defaultMode/);
  });

  it("rejects invalid work-hours time", async () => {
    const { validateWorkHoursInput } = await import("@/lib/managedProfilePolicy");
    const result = validateWorkHoursInput({
      enabled: true,
      days: [1],
      start: "9am",
      end: "17:00",
    });
    expect(result.error).toMatch(/start/);
  });

  it("rejects max pause duration above 240", async () => {
    const { validatePausePolicyInput } = await import("@/lib/managedProfilePolicy");
    const result = validatePausePolicyInput({
      enabled: true,
      reasonRequired: true,
      maxDurationMinutes: 300,
      allowAllRepos: false,
    });
    expect(result.error).toMatch(/240/);
  });

  it("rejects unknown fields", async () => {
    const { validateManagedProfilePolicyInput } = await import("@/lib/managedProfilePolicy");
    const result = validateManagedProfilePolicyInput({
      ...basePolicyBody,
      apiKey: "secret",
    });
    expect(result.error).toMatch(/Unknown field/);
  });

  it("accepts 16-char lowercase hex protected repo hash", async () => {
    const { validateProtectedRepoInput } = await import("@/lib/managedProfilePolicy");
    const result = validateProtectedRepoInput(
      { repoHash: "abc123def4567890", mode: "required", enabled: true },
      0
    );
    expect(result.error).toBeNull();
    expect(result.repo?.repoHash).toBe("abc123def4567890");
  });

  it("accepts 64-char lowercase hex protected repo hash", async () => {
    const { validateProtectedRepoInput } = await import("@/lib/managedProfilePolicy");
    const hash64 = "a".repeat(64);
    const result = validateProtectedRepoInput({ repoHash: hash64, mode: "required" }, 0);
    expect(result.error).toBeNull();
    expect(result.repo?.repoHash).toBe(hash64);
  });

  it("rejects raw GitHub URL protected repo hash", async () => {
    const { validateProtectedRepoInput } = await import("@/lib/managedProfilePolicy");
    const result = validateProtectedRepoInput(
      { repoHash: "https://github.com/org/repo.git", mode: "required" },
      0
    );
    expect(result.error).toMatch(/lowercase hex hash/);
  });

  it("rejects local filesystem path protected repo hash", async () => {
    const { validateProtectedRepoInput } = await import("@/lib/managedProfilePolicy");
    const result = validateProtectedRepoInput(
      { repoHash: "/Users/name/repo", mode: "required" },
      0
    );
    expect(result.error).toMatch(/lowercase hex hash/);
  });

  it("rejects uppercase or non-hex protected repo hash", async () => {
    const { validateProtectedRepoInput } = await import("@/lib/managedProfilePolicy");
    const result = validateProtectedRepoInput({ repoHash: "ABC123DEF4567890", mode: "required" }, 0);
    expect(result.error).toMatch(/lowercase hex hash/);
  });
});

describe("dashboard managed profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test", primaryAccountId: "acct_test" },
      activeAccountId: "acct_test",
      error: null,
    });
    mocks.requireVerifiedDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test", primaryAccountId: "acct_test", emailVerified: true },
      activeAccountId: "acct_test",
      error: null,
    });
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: { accountId: "acct_test", role: "OWNER", authorityLevel: 100 },
      error: null,
    });
    mocks.policyFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.policyFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        policyId: "pprf_test",
        accountId: "acct_test",
        ...basePolicyBody,
        createdAt: new Date("2026-07-05T10:00:00.000Z"),
        updatedAt: new Date("2026-07-05T10:00:00.000Z"),
      }),
    });
    mocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_test",
        accountType: "individual",
        onboarding: {},
      }),
    });
  });

  it("rejects unauthenticated GET", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ error: "Developer authentication required." }), { status: 401 }),
    });
    const { GET } = await import("@/app/api/dashboard/managed-profiles/route");
    const res = await GET(dashboardRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("rejects unauthorized PUT mutation", async () => {
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: null,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const { PUT } = await import("@/app/api/dashboard/managed-profiles/route");
    const res = await PUT(dashboardRequest("PUT", basePolicyBody));
    expect(res.status).toBe(403);
  });

  it("returns effective policy defaults on GET", async () => {
    const { GET } = await import("@/app/api/dashboard/managed-profiles/route");
    const res = await GET(dashboardRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy.accountId).toBe("acct_test");
    expect(body.policy.enabled).toBe(false);
    expect(body.policy.pausePolicy.maxDurationMinutes).toBe(240);
  });

  it("saves valid policy on PUT", async () => {
    const { PUT } = await import("@/app/api/dashboard/managed-profiles/route");
    const res = await PUT(dashboardRequest("PUT", basePolicyBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.policy.enabled).toBe(true);
    expect(body.policy.protectedRepos[0].repoHash).toBe("abc123def4567890");
    expect(mocks.policyFindOneAndUpdate).toHaveBeenCalled();
  });
});

describe("session policy resolution with persisted policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_test",
        accountType: "individual",
        onboarding: {},
      }),
    });
    mocks.policyFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it("preserves legacy fallback when no persisted policy is enabled", async () => {
    const { resolveCliSessionPolicy } = await import("@/lib/cliSessionPolicy");
    const result = await resolveCliSessionPolicy(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { tool: "claude" }
    );
    expect(result.mode).toBe("unmanaged");
  });

  it("returns required for protected repo match", async () => {
    mocks.policyFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        policyId: "pprf_test",
        accountId: "acct_test",
        enabled: true,
        timezone: "UTC",
        workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
        duringHoursMode: "managed",
        outsideHoursMode: "unmanaged",
        defaultMode: "unmanaged",
        toolModes: {},
        protectedRepos: [{ repoHash: "0123456789abcdef", mode: "required", enabled: true }],
        pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: false },
      }),
    });

    const { resolveCliSessionPolicy } = await import("@/lib/cliSessionPolicy");
    const result = await resolveCliSessionPolicy(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { tool: "claude", repoRoot: "0123456789abcdef" }
    );
    expect(result.mode).toBe("required");
  });

  it("returns unmanaged when an active pause lease applies", async () => {
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              scope: "all",
              repo: null,
              reason: "existing pause",
              expiresAt: new Date(Date.now() + 60_000),
            },
          ]),
        }),
      }),
    });
    mocks.policyFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        policyId: "pprf_test",
        accountId: "acct_test",
        enabled: true,
        timezone: "UTC",
        workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
        duringHoursMode: "managed",
        outsideHoursMode: "unmanaged",
        defaultMode: "required",
        toolModes: {},
        protectedRepos: [],
        pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: true },
      }),
    });

    const { resolveCliSessionPolicy } = await import("@/lib/cliSessionPolicy");
    const result = await resolveCliSessionPolicy(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { tool: "claude", repoRoot: "0123456789abcdef" }
    );
    expect(result.mode).toBe("unmanaged");
    expect(result.reason).toMatch(/Active pause lease/);
  });

  it("returns during-hours mode inside work window", async () => {
    const { resolvePersistedManagedProfileMode, defaultManagedProfilePolicy } = await import(
      "@/lib/managedProfilePolicy"
    );
    const policy = {
      ...defaultManagedProfilePolicy("acct_test"),
      enabled: true,
      policyId: "pprf_test",
      workHours: { enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
      duringHoursMode: "managed" as const,
      outsideHoursMode: "unmanaged" as const,
    };
    const wednesdayMorning = new Date("2026-07-01T14:00:00.000Z");
    const result = resolvePersistedManagedProfileMode(policy, { tool: "claude" }, wednesdayMorning);
    expect(result?.mode).toBe("managed");
  });

  it("returns outside-hours mode outside work window", async () => {
    const { resolvePersistedManagedProfileMode, defaultManagedProfilePolicy } = await import(
      "@/lib/managedProfilePolicy"
    );
    const policy = {
      ...defaultManagedProfilePolicy("acct_test"),
      enabled: true,
      policyId: "pprf_test",
      workHours: { enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
      duringHoursMode: "managed" as const,
      outsideHoursMode: "required" as const,
    };
    const wednesdayEvening = new Date("2026-07-01T22:00:00.000Z");
    const result = resolvePersistedManagedProfileMode(policy, { tool: "claude" }, wednesdayEvening);
    expect(result?.mode).toBe("required");
  });

  it("applies per-tool override", async () => {
    const { resolvePersistedManagedProfileMode, defaultManagedProfilePolicy } = await import(
      "@/lib/managedProfilePolicy"
    );
    const policy = {
      ...defaultManagedProfilePolicy("acct_test"),
      enabled: true,
      policyId: "pprf_test",
      toolModes: { codex: "required" },
    };
    const result = resolvePersistedManagedProfileMode(policy, { tool: "codex" });
    expect(result?.mode).toBe("required");
  });

  it("still honors server env override", async () => {
    vi.stubEnv("BEHALF" + "ID_CLI_POLICY_MODE", "required");
    const { resolveCliSessionPolicy } = await import("@/lib/cliSessionPolicy");
    const result = await resolveCliSessionPolicy(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { tool: "claude" }
    );
    expect(result.mode).toBe("required");
    expect(result.profileId).toBe("pprf_dev");
    vi.unstubAllEnvs();
  });
});

describe("pause behavior with managed profile policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_test",
        accountType: "individual",
        onboarding: {},
      }),
    });
    mocks.auditCreate.mockResolvedValue({});
    mocks.pauseCreate.mockResolvedValue({});
  });

  function mockPolicy(doc: Record<string, unknown>) {
    mocks.policyFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
  }

  it("denies pause when pause policy is disabled", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: false, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: false },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "test", scope: "current_repo" }
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/disabled/);
  });

  it("denies missing reason when required", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: false },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "   ", scope: "current_repo" }
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/reason is required/);
  });

  it("denies all-repo pause when disabled", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: false },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "test", scope: "all" }
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/All-repo pause is disabled/);
  });

  it("enforces max duration from pause policy", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 30, allowAllRepos: true },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 45, reason: "test", scope: "current_repo" }
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/30 minutes/);
  });

  it("denies pause when effective session mode is required", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "required",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: true },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "test", scope: "current_repo" }
    );
    expect(result.granted).toBe(false);
    expect(result.mode).toBe("required");
  });

  it("grants pause for developer session when allowed", async () => {
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: true },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "test", scope: "current_repo", tool: "claude" }
    );
    expect(result.granted).toBe(true);
    expect(mocks.pauseCreate).toHaveBeenCalled();
  });

  it("denies new pause when active pause masks underlying required policy", async () => {
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              scope: "all",
              repo: null,
              reason: "existing pause",
              expiresAt: new Date(Date.now() + 60_000),
            },
          ]),
        }),
      }),
    });
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "required",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: true },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "renew pause", scope: "current_repo", tool: "claude" }
    );
    expect(result.granted).toBe(false);
    expect(result.mode).toBe("required");
  });

  it("allows new pause when active pause exists but underlying policy is not required", async () => {
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              scope: "all",
              repo: null,
              reason: "existing pause",
              expiresAt: new Date(Date.now() + 60_000),
            },
          ]),
        }),
      }),
    });
    mockPolicy({
      policyId: "pprf_test",
      accountId: "acct_test",
      enabled: true,
      timezone: "UTC",
      workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
      duringHoursMode: "managed",
      outsideHoursMode: "unmanaged",
      defaultMode: "managed",
      toolModes: {},
      protectedRepos: [],
      pausePolicy: { enabled: true, reasonRequired: true, maxDurationMinutes: 240, allowAllRepos: true },
    });

    const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
    const result = await requestCliPauseLease(
      { userId: "user_a", accountId: "acct_test", agentId: null, source: "session" },
      { durationMinutes: 30, reason: "renew pause", scope: "current_repo", tool: "claude" }
    );
    expect(result.granted).toBe(true);
    expect(mocks.pauseCreate).toHaveBeenCalled();
  });
});

describe("CLI policy repo hash", () => {
  it("uses the same policyRepoHash for the same git remote across local paths", async () => {
    const { computePolicyRepoHash, hashRepoValue } = await import("../packages/cli/src/lib/profile/repo.js");
    const remote = "git@github.com:org/repo.git";
    const hashA = computePolicyRepoHash({
      gitRemote: remote,
      repoRoot: "/Users/alice/dev/repo",
    });
    const hashB = computePolicyRepoHash({
      gitRemote: remote,
      repoRoot: "/home/bob/work/repo",
    });
    expect(hashA).toBe(hashB);
    expect(hashA).toBe(hashRepoValue(remote));
  });

  it("falls back to local repo root hash when no git remote exists", async () => {
    const { computePolicyRepoHash, hashRepoValue } = await import("../packages/cli/src/lib/profile/repo.js");
    const repoRoot = "/tmp/local-only-repo";
    expect(computePolicyRepoHash({ gitRemote: null, repoRoot })).toBe(hashRepoValue(repoRoot));
  });

  it("matches protected repo policy using policyRepoHash sent as repoRoot", async () => {
    const { computePolicyRepoHash, hashRepoValue } = await import("../packages/cli/src/lib/profile/repo.js");
    const { resolvePersistedManagedProfileMode, defaultManagedProfilePolicy } = await import(
      "@/lib/managedProfilePolicy"
    );
    const remote = "https://github.com/org/stable-repo.git";
    const policyRepoHash = computePolicyRepoHash({
      gitRemote: remote,
      repoRoot: "/different/local/path",
    });
    expect(policyRepoHash).toBeTruthy();
    const policy = {
      ...defaultManagedProfilePolicy("acct_test"),
      enabled: true,
      policyId: "pprf_test",
      protectedRepos: [{ repoHash: policyRepoHash!, mode: "required" as const, enabled: true }],
    };
    const result = resolvePersistedManagedProfileMode(policy, {
      tool: "claude",
      repoRoot: policyRepoHash,
    });
    expect(result?.mode).toBe("required");
    expect(result?.reason).toMatch(/Protected repository/);
  });

  it("does not expose raw git remote in status snapshot fields", async () => {
    const remote = "git@github.com:secret-org/private-repo.git";
    const repo = {
      cwd: "/tmp/repo",
      repoRoot: "/tmp/repo",
      branch: "main",
      gitRemote: remote,
      repoHash: "0123456789abcdef",
      policyRepoHash: "fedcba9876543210",
    };
    const statusLines = {
      "git remote": repo.gitRemote ? "(detected)" : "(none)",
      "policy repo hash": repo.policyRepoHash ?? "(none)",
    };
    expect(JSON.stringify(statusLines)).not.toContain(remote);
    expect(JSON.stringify(statusLines)).not.toContain("secret-org");
  });
});
