import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/developerAuth";

const mocks = vi.hoisted(() => ({
  sessionFindOne: vi.fn(),
  userFindOne: vi.fn(),
  accountFindOne: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { findOne: mocks.sessionFindOne }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));
vi.mock("@/models/Account", () => ({
  default: { findOne: mocks.accountFindOne }
}));

const SESSION_TOKEN = "test-session-token";

function authRequest(path: string, method = "GET") {
  const url = new URL(`http://example.test${path}`);
  return Object.assign(
    new Request(url, {
      method,
      headers: {
        Origin: "http://example.test"
      }
    }),
    {
      nextUrl: url,
      cookies: {
        get: () => ({ value: SESSION_TOKEN })
      }
    }
  ) as never;
}

describe("requireDeveloperApi unverified hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userId: "dev_test",
        tokenHash: hashSessionToken(SESSION_TOKEN),
        expiresAt: new Date(Date.now() + 60_000)
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "dev_test",
          email: "dev@example.com",
          emailVerified: false,
          primaryAccountId: "acct_test"
        })
      })
    });
    mocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ accountId: "acct_test", name: "Workspace" })
    });
  });

  it("allows unverified GET dashboard reads", async () => {
    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(authRequest("/api/dashboard/summary", "GET"));
    expect(result.error).toBeNull();
    expect(result.user?.email).toBe("dev@example.com");
  });

  it("allows unverified account setup mutations", async () => {
    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(authRequest("/api/onboarding/account-setup", "PATCH"));
    expect(result.error).toBeNull();
  });

  it("blocks unverified dashboard mutations", async () => {
    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(authRequest("/api/dashboard/webhooks", "POST"));
    expect(result.error).not.toBeNull();
    expect(result.user).toBeNull();
  });

  it("blocks unverified settings PATCH", async () => {
    const { requireDeveloperApi } = await import("@/lib/developerAuth");
    const result = await requireDeveloperApi(authRequest("/api/dashboard/settings", "PATCH"));
    expect(result.error).not.toBeNull();
    expect(result.user).toBeNull();
  });

  it("does not select phone or dateOfBirth in session user payloads", async () => {
    const { getDeveloperFromToken } = await import("@/lib/developerAuth");
    await getDeveloperFromToken(SESSION_TOKEN);
    const selectArg = mocks.userFindOne.mock.results[0]?.value.select.mock.calls[0][0] as string;
    expect(selectArg).not.toContain("phone");
    expect(selectArg).not.toContain("dateOfBirth");
  });
});
