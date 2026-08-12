import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  deleteLogs: vi.fn(),
  deleteAccessLogs: vi.fn(),
  deleteDeliveries: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  listAccounts: mocks.listAccounts
}));

vi.mock("@/lib/repositories/verificationLogs", () => ({
  deleteLogs: mocks.deleteLogs
}));

vi.mock("@/lib/repositories/sites", () => ({
  deleteAccessLogs: mocks.deleteAccessLogs
}));

vi.mock("@/lib/repositories/webhooks", () => ({
  deleteDeliveries: mocks.deleteDeliveries
}));

import { LOG_PURGE_GRACE_DAYS, WEBHOOK_DELIVERY_RETENTION_DAYS, purgeExpiredLogs } from "@/lib/logPurge";

describe("purgeExpiredLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccounts.mockImplementation(async (filter: { plan?: string }) => {
      if (filter?.plan === "free") return [{ accountId: "acct_free" }];
      if (filter?.plan) return [];
      return [{ accountId: "acct_free" }];
    });
    mocks.deleteLogs.mockResolvedValue({ deletedCount: 0 });
    mocks.deleteAccessLogs.mockResolvedValue({ deletedCount: 0 });
    mocks.deleteDeliveries.mockResolvedValue({ deletedCount: 0 });
  });

  it("runs without throwing and reports grace days", async () => {
    const summary = await purgeExpiredLogs(new Date("2026-07-24T00:00:00.000Z"));
    expect(summary.graceDays).toBe(LOG_PURGE_GRACE_DAYS);
    expect(summary.byPlan.free).toBeDefined();
  });

  it("deletes batched verification logs older than cutoff", async () => {
    mocks.deleteLogs.mockResolvedValueOnce({ deletedCount: 2 });

    const summary = await purgeExpiredLogs(new Date("2026-07-24T00:00:00.000Z"));
    expect(summary.byPlan.free.verificationDeleted).toBe(2);
    expect(mocks.deleteLogs).toHaveBeenCalled();
  });

  it("purges webhook deliveries past the documented retention window", async () => {
    mocks.deleteDeliveries.mockResolvedValueOnce({ deletedCount: 3 });

    const summary = await purgeExpiredLogs(new Date("2026-07-24T00:00:00.000Z"));
    expect(summary.webhookDeliveriesDeleted).toBe(3);
    expect(mocks.deleteDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: expect.objectContaining({ $lt: expect.any(Date) })
      })
    );
    const [[filter]] = mocks.deleteDeliveries.mock.calls;
    const cutoffMs = new Date("2026-07-24T00:00:00.000Z").getTime() - filter.createdAt.$lt.getTime();
    const expectedMs = (WEBHOOK_DELIVERY_RETENTION_DAYS + LOG_PURGE_GRACE_DAYS) * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBe(expectedMs);
  });
});
