import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/developerAuth";

const mocks = vi.hoisted(() => ({
  sessionFindOne: vi.fn(),
  sessionUpdateOne: vi.fn(),
  sessionDeleteOne: vi.fn(),
  userFindOne: vi.fn(),
  membershipFind: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/models/DeveloperSession", () => ({
  default: {
    findOne: mocks.sessionFindOne,
    updateOne: mocks.sessionUpdateOne,
    deleteOne: mocks.sessionDeleteOne
  }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));
vi.mock("@/models/AccountMembership", () => ({
  default: { find: mocks.membershipFind }
}));
vi.mock("@/models/Account", () => ({
  default: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }
}));

const SESSION_TOKEN = "session-token";

describe("session inactivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));

    mocks.membershipFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ accountId: "acct_test" }])
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "dev_test",
          email: "dev@example.com",
          emailVerified: true,
          primaryAccountId: "acct_test"
        })
      })
    });
    mocks.sessionUpdateOne.mockResolvedValue(undefined);
    mocks.sessionDeleteOne.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects sessions idle for more than one hour", async () => {
    mocks.sessionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        sessionId: "sess_test",
        userId: "dev_test",
        tokenHash: hashSessionToken(SESSION_TOKEN),
        expiresAt: new Date("2026-07-16T14:00:00.000Z"),
        lastActivityAt: new Date("2026-07-16T10:30:00.000Z"),
        createdAt: new Date("2026-07-16T09:00:00.000Z")
      })
    });

    const { getDeveloperFromToken } = await import("@/lib/developerAuth");
    const context = await getDeveloperFromToken(SESSION_TOKEN);
    expect(context).toBeNull();
    expect(mocks.sessionDeleteOne).toHaveBeenCalled();
  });

  it("accepts active sessions and refreshes activity", async () => {
    mocks.sessionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        sessionId: "sess_test",
        userId: "dev_test",
        tokenHash: hashSessionToken(SESSION_TOKEN),
        expiresAt: new Date("2026-07-16T14:00:00.000Z"),
        lastActivityAt: new Date("2026-07-16T11:50:00.000Z"),
        createdAt: new Date("2026-07-16T09:00:00.000Z")
      })
    });

    const { getDeveloperFromToken } = await import("@/lib/developerAuth");
    const context = await getDeveloperFromToken(SESSION_TOKEN);
    expect(context?.user.email).toBe("dev@example.com");
    expect(mocks.sessionUpdateOne).toHaveBeenCalled();
  });
});
