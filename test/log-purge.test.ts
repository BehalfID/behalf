import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFind: vi.fn(),
  verificationFind: vi.fn(),
  verificationDeleteMany: vi.fn(),
  siteFind: vi.fn(),
  siteDeleteMany: vi.fn(),
  connectToDatabase: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: mocks.connectToDatabase
}));

vi.mock("@/models/Account", () => ({
  default: {
    find: mocks.accountFind
  }
}));

vi.mock("@/models/VerificationLog", () => ({
  default: {
    find: mocks.verificationFind,
    deleteMany: mocks.verificationDeleteMany
  }
}));

vi.mock("@/models/SiteAccessLog", () => ({
  default: {
    find: mocks.siteFind,
    deleteMany: mocks.siteDeleteMany
  }
}));

import { LOG_PURGE_GRACE_DAYS, purgeExpiredLogs } from "@/lib/logPurge";

function chainFind(ids: { _id: string }[]) {
  return {
    select: () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => ids
        })
      }),
      lean: async () => ids.map((row) => ({ accountId: row._id }))
    })
  };
}

describe("purgeExpiredLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.accountFind.mockImplementation(() => ({
      select: () => ({
        lean: async () => [{ accountId: "acct_free" }]
      })
    }));
    // First call pattern: plan accounts; later known accounts for orphan pass
    let accountCalls = 0;
    mocks.accountFind.mockImplementation(() => {
      accountCalls += 1;
      if (accountCalls <= 5) {
        return {
          select: () => ({
            lean: async () => (accountCalls === 1 ? [{ accountId: "acct_free" }] : [])
          })
        };
      }
      return {
        select: () => ({
          lean: async () => [{ accountId: "acct_free" }]
        })
      };
    });

    const emptyChain = {
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => []
          })
        })
      })
    };

    mocks.verificationFind.mockReturnValue(emptyChain);
    mocks.siteFind.mockReturnValue(emptyChain);
    mocks.verificationDeleteMany.mockResolvedValue({ deletedCount: 0 });
    mocks.siteDeleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it("runs without throwing and reports grace days", async () => {
    const summary = await purgeExpiredLogs(new Date("2026-07-24T00:00:00.000Z"));
    expect(summary.graceDays).toBe(LOG_PURGE_GRACE_DAYS);
    expect(mocks.connectToDatabase).toHaveBeenCalled();
    expect(summary.byPlan.free).toBeDefined();
  });

  it("deletes batched verification logs older than cutoff", async () => {
    mocks.verificationFind.mockReturnValueOnce({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [{ _id: "log1" }, { _id: "log2" }]
          })
        })
      })
    });
    // remaining finds empty
    mocks.verificationFind.mockReturnValue({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => []
          })
        })
      })
    });
    mocks.verificationDeleteMany.mockResolvedValueOnce({ deletedCount: 2 });

    const summary = await purgeExpiredLogs(new Date("2026-07-24T00:00:00.000Z"));
    expect(summary.byPlan.free.verificationDeleted).toBe(2);
    expect(mocks.verificationDeleteMany).toHaveBeenCalled();
  });
});
