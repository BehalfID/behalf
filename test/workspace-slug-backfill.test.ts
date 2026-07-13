import { describe, expect, it, vi } from "vitest";
import {
  runWorkspaceSlugBackfill,
  type AccountRow
} from "../scripts/backfill-workspace-slugs";

const mocks = vi.hoisted(() => ({
  findAccountBySlugLean: vi.fn(),
  findAccountByIdLean: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountBySlugLean: mocks.findAccountBySlugLean,
  findAccountByIdLean: mocks.findAccountByIdLean
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn(async () => undefined)
}));

vi.mock("@/models/Account", () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn()
  }
}));

function account(partial: Partial<AccountRow> & Pick<AccountRow, "accountId" | "name">): AccountRow {
  return {
    companyName: partial.companyName ?? partial.name,
    slug: partial.slug ?? null,
    ...partial
  };
}

describe("workspace slug backfill", () => {
  it("fails clearly without MONGODB_URI and performs no writes", async () => {
    const updateSlug = vi.fn();
    const lines: string[] = [];
    await expect(
      runWorkspaceSlugBackfill({
        confirm: true,
        requireMongoUri: true,
        getMongoUri: () => undefined,
        connect: async () => undefined,
        listAccounts: async () => [account({ accountId: "acct_1", name: "Acme" })],
        updateSlug,
        log: (line) => lines.push(line)
      })
    ).rejects.toThrow(/MONGODB_URI is required/i);
    expect(updateSlug).not.toHaveBeenCalled();
    expect(lines.join("\n")).not.toMatch(/bhf_sk_|mongodb(\+srv)?:\/\//i);
  });

  it("dry-run performs no updates and requires --confirm for writes", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const updateSlug = vi.fn();
    const lines: string[] = [];
    const totals = await runWorkspaceSlugBackfill({
      confirm: false,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => [account({ accountId: "acct_1", name: "Acme" })],
      updateSlug,
      log: (line) => lines.push(line)
    });
    expect(updateSlug).not.toHaveBeenCalled();
    expect(totals.proposed).toBe(1);
    expect(totals.wrote).toBe(0);
    expect(lines.some((line) => line.includes("DRY-RUN"))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/password|secret|api[_-]?key/i);
  });

  it("leaves an existing valid slug unchanged", async () => {
    const updateSlug = vi.fn();
    const totals = await runWorkspaceSlugBackfill({
      confirm: true,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => [
        account({ accountId: "acct_1", name: "Trajectus", slug: "trajectus" })
      ],
      updateSlug,
      log: () => undefined
    });
    expect(updateSlug).not.toHaveBeenCalled();
    expect(totals.alreadyValid).toBe(1);
    expect(totals.wrote).toBe(0);
  });

  it("fails closed on invalid existing slug", async () => {
    const updateSlug = vi.fn();
    const lines: string[] = [];
    const totals = await runWorkspaceSlugBackfill({
      confirm: true,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => [
        account({ accountId: "acct_1", name: "Acme", slug: "Bad_Slug" })
      ],
      updateSlug,
      log: (line) => lines.push(line)
    });
    expect(updateSlug).not.toHaveBeenCalled();
    expect(totals.invalid).toBe(1);
    expect(lines.some((line) => line.includes("invalid-existing"))).toBe(true);
  });

  it("resolves duplicate names to unique proposed slugs", async () => {
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) => {
      if (slug === "acme") return { accountId: "acct_holder", slug };
      return null;
    });
    const lines: string[] = [];
    const totals = await runWorkspaceSlugBackfill({
      confirm: false,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => [
        account({ accountId: "acct_aaaa", name: "Acme" }),
        account({ accountId: "acct_bbbb", name: "Acme" })
      ],
      updateSlug: vi.fn(),
      log: (line) => lines.push(line)
    });
    expect(totals.proposed).toBe(2);
    const proposed = lines
      .filter((line) => line.includes("would-write"))
      .map((line) => /slug=([^\t]+)/.exec(line)?.[1]);
    expect(new Set(proposed).size).toBe(2);
  });

  it("is idempotent after a completed backfill", async () => {
    const updateSlug = vi.fn();
    const accounts = [
      account({ accountId: "acct_1", name: "Acme", slug: "acme" }),
      account({ accountId: "acct_2", name: "Beta", slug: "beta" })
    ];
    const first = await runWorkspaceSlugBackfill({
      confirm: true,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => accounts,
      updateSlug,
      log: () => undefined
    });
    const second = await runWorkspaceSlugBackfill({
      confirm: true,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => accounts,
      updateSlug,
      log: () => undefined
    });
    expect(first.alreadyValid).toBe(2);
    expect(second.alreadyValid).toBe(2);
    expect(updateSlug).not.toHaveBeenCalled();
  });

  it("retries safely on duplicate-key races during write", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    let attempts = 0;
    const updateSlug = vi.fn(async (_accountId: string, slug: string) => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error("E11000 duplicate key error");
        (err as { code?: number }).code = 11000;
        throw err;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    });
    const findSlug = vi.fn(async () => "acme-deadbeef");
    const totals = await runWorkspaceSlugBackfill({
      confirm: true,
      requireMongoUri: false,
      connect: async () => undefined,
      listAccounts: async () => [account({ accountId: "acct_abcdef", name: "Acme" })],
      updateSlug,
      findSlug,
      log: () => undefined
    });
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(totals.wrote).toBe(1);
    expect(totals.collisionResolved).toBe(1);
  });
});
