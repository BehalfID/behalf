import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  connectToDatabase: vi.fn(),
  sessionFindOne: vi.fn(),
  userFindOne: vi.fn(),
  resolveActiveAccountId: vi.fn()
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
      const entries = new Map<string, Result>();
      return (...args: Args) => {
        const key = JSON.stringify(args);
        if (!entries.has(key)) entries.set(key, fn(...args));
        return entries.get(key) as Result;
      };
    }
  };
});
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/accountContext", () => ({
  resolveActiveAccountId: mocks.resolveActiveAccountId,
  requireWorkspaceMembershipBySlug: vi.fn()
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: vi.fn()
}));
vi.mock("@/models/DeveloperSession", () => ({
  default: { findOne: mocks.sessionFindOne }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));
vi.mock("@/models/Account", () => ({ default: { findOne: vi.fn() } }));

describe("Server Component request memoization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "session-token" }))
    });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.sessionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        sessionId: "sess_1",
        userId: "dev_1",
        activeAccountId: "acct_1"
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "dev_1",
          email: "dev@example.com",
          primaryAccountId: "acct_1"
        })
      })
    });
    mocks.resolveActiveAccountId.mockResolvedValue("acct_1");
  });

  it("shares one session resolution between context and user consumers", async () => {
    const { getCurrentDeveloper, getCurrentDeveloperContext } = await import(
      "@/lib/developerAuth"
    );

    const context = await getCurrentDeveloperContext();
    const user = await getCurrentDeveloper();

    expect(context?.user.userId).toBe("dev_1");
    expect(user?.userId).toBe("dev_1");
    expect(mocks.cookies).toHaveBeenCalledTimes(1);
    expect(mocks.sessionFindOne).toHaveBeenCalledTimes(1);
    expect(mocks.userFindOne).toHaveBeenCalledTimes(1);
    expect(mocks.resolveActiveAccountId).toHaveBeenCalledTimes(1);
  });
});
