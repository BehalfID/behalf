/**
 * Verifies that GET /api/dashboard/settings returns real API usage data derived
 * from the active account's quota fields, instead of the old
 * "API usage details coming soon." placeholder (issue #79).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verificationPeriodStart } from "@/lib/plans";
import { accountFixture, developerUserFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  loadAccountSetupState: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi
}));
vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: mocks.getWorkspaceActor,
  serializeWorkspaceAuthority: vi.fn(() => ({ roleLabel: "Owner" })),
  canManageMembers: vi.fn(() => true)
}));
vi.mock("@/lib/accountSetup", () => ({
  loadAccountSetupState: mocks.loadAccountSetupState,
  patchAccountSetup: vi.fn(),
  PATCH_ALLOWED_FIELDS: []
}));

function getRequest(path: string) {
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url), { nextUrl: url }) as never;
}

async function fetchSettings() {
  const { GET } = await import("@/app/api/dashboard/settings/route");
  const response = await GET(getRequest("/api/dashboard/settings"));
  return response.json();
}

describe("dashboard settings apiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceActor.mockResolvedValue(null);
    mocks.loadAccountSetupState.mockResolvedValue(null);
  });

  function authAs(account: Record<string, unknown> | null) {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: developerUserFixture(),
      account,
      activeAccountId: account ? "acct_test" : null,
      error: null
    });
  }

  it("reports current-period usage against the plan limit", async () => {
    authAs(accountFixture({ plan: "free", verificationCount: 123 }));
    const json = await fetchSettings();
    expect(json.apiUsage).toBe("123 / 10,000 monthly verifications used");
  });

  it("reports Unlimited for plans without a finite verification limit", async () => {
    authAs(accountFixture({ plan: "enterprise", verificationCount: 987_654 }));
    const json = await fetchSettings();
    expect(json.apiUsage).toBe("987,654 / Unlimited monthly verifications used");
  });

  it("reports zero usage when the stored period is stale (lazy reset)", async () => {
    const staleStart = new Date(verificationPeriodStart());
    staleStart.setUTCMonth(staleStart.getUTCMonth() - 1);
    authAs(accountFixture({ plan: "pro", verificationCount: 456, verificationPeriodStart: staleStart }));
    const json = await fetchSettings();
    expect(json.apiUsage).toBe("0 / 250,000 monthly verifications used");
  });

  it("falls back to a neutral message when no account is resolved", async () => {
    authAs(null);
    const json = await fetchSettings();
    expect(json.apiUsage).toBe("Usage data unavailable");
  });

  it("never returns the unfinished placeholder copy", async () => {
    authAs(accountFixture());
    const json = await fetchSettings();
    expect(JSON.stringify(json)).not.toContain("coming soon");
  });
});
