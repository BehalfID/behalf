import { beforeEach, describe, expect, it, vi } from "vitest";

const accountFind = vi.hoisted(() => vi.fn());

vi.mock("@/models/Account", () => ({
  default: { find: accountFind }
}));
vi.mock("@/models/AccountMembership", () => ({
  default: { find: vi.fn() }
}));

describe("isPasswordLoginBlockedBySso", () => {
  beforeEach(() => {
    accountFind.mockReset();
  });

  it("returns true for entitled enforce+domain matches", async () => {
    accountFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            accountId: "acct_1",
            plan: "team",
            sso: { enabled: true, enforce: true, allowedEmailDomains: ["acme.com"] }
          }
        ])
      })
    });
    const { isPasswordLoginBlockedBySso } = await import("@/lib/workspaceSso");
    await expect(isPasswordLoginBlockedBySso("dev@acme.com")).resolves.toBe(true);
  });

  it("returns false for free plan even when enforce is set", async () => {
    accountFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            accountId: "acct_1",
            plan: "free",
            sso: { enabled: true, enforce: true, allowedEmailDomains: ["acme.com"] }
          }
        ])
      })
    });
    const { isPasswordLoginBlockedBySso } = await import("@/lib/workspaceSso");
    await expect(isPasswordLoginBlockedBySso("dev@acme.com")).resolves.toBe(false);
  });

  it("ignores public email domains", async () => {
    const { isPasswordLoginBlockedBySso } = await import("@/lib/workspaceSso");
    await expect(isPasswordLoginBlockedBySso("someone@gmail.com")).resolves.toBe(false);
    expect(accountFind).not.toHaveBeenCalled();
  });
});
