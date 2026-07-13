import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccountBySlugLean: vi.fn(),
  findAccountByIdLean: vi.fn(),
  accountUpdateOne: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountBySlugLean: mocks.findAccountBySlugLean,
  findAccountByIdLean: mocks.findAccountByIdLean
}));

vi.mock("@/models/Account", () => ({
  default: {
    updateOne: mocks.accountUpdateOne
  }
}));

describe("normalizeWorkspaceSlug", () => {
  it("strips unicode diacritics", async () => {
    const { normalizeWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(normalizeWorkspaceSlug("Café Corp")).toBe("cafe-corp");
  });

  it("converts spaces and underscores to hyphens", async () => {
    const { normalizeWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(normalizeWorkspaceSlug("My_Company Name")).toBe("my-company-name");
  });

  it("strips leading and trailing hyphens", async () => {
    const { normalizeWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(normalizeWorkspaceSlug("--acme--")).toBe("acme");
  });

  it("truncates to 63 characters", async () => {
    const { normalizeWorkspaceSlug, WORKSPACE_SLUG_MAX_LENGTH } = await import("@/lib/workspaceSlug");
    const long = `a${"b".repeat(100)}`;
    const result = normalizeWorkspaceSlug(long);
    expect(result.length).toBeLessThanOrEqual(WORKSPACE_SLUG_MAX_LENGTH);
    expect(result.startsWith("a")).toBe(true);
  });

  it("never returns a reserved slug", async () => {
    const { normalizeWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(normalizeWorkspaceSlug("dashboard")).toBe("workspace");
    expect(normalizeWorkspaceSlug("api")).toBe("workspace");
    expect(normalizeWorkspaceSlug("login")).toBe("workspace");
  });
});

describe("validateWorkspaceSlug", () => {
  it("accepts valid slugs", async () => {
    const { validateWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(validateWorkspaceSlug("acme")).toBeNull();
    expect(validateWorkspaceSlug("acme-corp")).toBeNull();
    expect(validateWorkspaceSlug("a")).toBeNull();
  });

  it("rejects invalid and reserved slugs", async () => {
    const { validateWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(validateWorkspaceSlug("")).not.toBeNull();
    expect(validateWorkspaceSlug("Acme")).not.toBeNull();
    expect(validateWorkspaceSlug("-acme")).not.toBeNull();
    expect(validateWorkspaceSlug("dashboard")).not.toBeNull();
    expect(validateWorkspaceSlug("en")).not.toBeNull();
  });
});

describe("isReservedWorkspaceSlug", () => {
  it("includes product routes and locales", async () => {
    const { isReservedWorkspaceSlug } = await import("@/lib/workspaceSlug");
    for (const slug of ["api", "dashboard", "login", "docs", "en", "de", "es", "fr"]) {
      expect(isReservedWorkspaceSlug(slug)).toBe(true);
    }
  });
});

describe("accountIdSlugSuffix", () => {
  it("is deterministic", async () => {
    const { accountIdSlugSuffix } = await import("@/lib/workspaceSlug");
    expect(accountIdSlugSuffix("acct_abcdef")).toBe(accountIdSlugSuffix("acct_abcdef"));
    expect(accountIdSlugSuffix("acct_12ab34cd56ef")).toBe("cd56ef");
  });
});

describe("generateUniqueWorkspaceSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the normalized base when unused", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    await expect(generateUniqueWorkspaceSlug("Acme Corp", "acct_abcdef")).resolves.toBe("acme-corp");
    expect(mocks.findAccountBySlugLean).toHaveBeenCalledWith("acme-corp");
  });

  it("appends a stable hashed accountId suffix on collision", async () => {
    mocks.findAccountBySlugLean
      .mockResolvedValueOnce({ accountId: "acct_other", slug: "acme" })
      .mockResolvedValueOnce(null);
    const { generateUniqueWorkspaceSlug, stableAccountIdSuffix, buildWorkspaceSlugCandidates } =
      await import("@/lib/workspaceSlugServer");
    const candidates = buildWorkspaceSlugCandidates("acme", "acct_abcdef");
    expect(candidates[0]).toBe("acme");
    expect(candidates[1]).toBe(`acme-${stableAccountIdSuffix("acct_abcdef", 8)}`);
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).resolves.toBe(candidates[1]);
  });

  it("treats an existing slug owned by the same account as available", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({ accountId: "acct_abcdef", slug: "acme" });
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).resolves.toBe("acme");
  });

  it("chooses the next candidate when earlier ones are taken", async () => {
    const { buildWorkspaceSlugCandidates, generateUniqueWorkspaceSlug } =
      await import("@/lib/workspaceSlugServer");
    const candidates = buildWorkspaceSlugCandidates("acme", "acct_abcdef");
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) => {
      if (slug === candidates[0] || slug === candidates[1]) {
        return { accountId: "acct_other", slug };
      }
      return null;
    });
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).resolves.toBe(candidates[2]);
  });

  it("throws after the bounded candidate set is exhausted", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({ accountId: "acct_other", slug: "taken" });
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).rejects.toThrow(
      /exhausting deterministic candidates/i
    );
  });

  it("allocates different stable slugs for concurrent same-base accounts", async () => {
    const claimed = new Set<string>();
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) => {
      if (claimed.has(slug)) return { accountId: "acct_holder", slug };
      return null;
    });
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    const a = await generateUniqueWorkspaceSlug("Acme", "acct_aaaa");
    claimed.add(a);
    const b = await generateUniqueWorkspaceSlug("Acme", "acct_bbbb");
    claimed.add(b);
    expect(a).not.toBe(b);
    expect(a === "acme" || b === "acme").toBe(true);
  });
});

describe("assignSlugWithDuplicateRetry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retries the next candidate on E11000", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const { assignSlugWithDuplicateRetry, buildWorkspaceSlugCandidates, isMongoDuplicateKeyError } =
      await import("@/lib/workspaceSlugServer");
    const candidates = buildWorkspaceSlugCandidates("acme", "acct_abcdef");
    let attempts = 0;
    const slug = await assignSlugWithDuplicateRetry("acme", "acct_abcdef", async (candidate) => {
      attempts += 1;
      if (candidate === candidates[0]) {
        const err = new Error("E11000 duplicate key error");
        (err as { code?: number }).code = 11000;
        expect(isMongoDuplicateKeyError(err)).toBe(true);
        throw err;
      }
    });
    expect(attempts).toBe(2);
    expect(slug).toBe(candidates[1]);
  });

  it("simulates two concurrent same-base allocations succeeding with different slugs", async () => {
    const claimed = new Map<string, string>();
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) => {
      const owner = claimed.get(slug);
      return owner ? { accountId: owner, slug } : null;
    });
    const { assignSlugWithDuplicateRetry } = await import("@/lib/workspaceSlugServer");

    const write = async (accountId: string) =>
      assignSlugWithDuplicateRetry("Acme", accountId, async (slug) => {
        if (claimed.has(slug) && claimed.get(slug) !== accountId) {
          const err = new Error("E11000 duplicate key error");
          (err as { code?: number }).code = 11000;
          throw err;
        }
        // Race: both may pass the pre-check for "acme"; second write loses with E11000.
        if (slug === "acme" && !claimed.has("acme")) {
          claimed.set("acme", accountId);
          return;
        }
        if (claimed.has(slug)) {
          const err = new Error("E11000 duplicate key error");
          (err as { code?: number }).code = 11000;
          throw err;
        }
        claimed.set(slug, accountId);
      });

    const [a, b] = await Promise.all([write("acct_aaaa"), write("acct_bbbb")]);
    expect(a).not.toBe(b);
    expect(claimed.get(a)).toBeTruthy();
    expect(claimed.get(b)).toBeTruthy();
  });
});

describe("ensureAccountHasSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("preserves an existing valid slug when the account name changes", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_abcdef",
      name: "Renamed Company",
      companyName: "Renamed Company LLC",
      slug: "trajectus"
    });
    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_abcdef")).resolves.toBe("trajectus");
    expect(mocks.accountUpdateOne).not.toHaveBeenCalled();
    expect(mocks.findAccountBySlugLean).not.toHaveBeenCalled();
  });

  it("generates and persists a slug when missing for eligible accounts", async () => {
    let written: string | null = null;
    mocks.findAccountByIdLean.mockImplementation(async () => ({
      accountId: "acct_abcdef",
      name: "Acme",
      companyName: "Acme",
      slug: written,
      accountType: "business",
      createdAt: "2026-07-03T00:00:00.000Z",
      verificationCount: 1
    }));
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    mocks.accountUpdateOne.mockImplementation(async (_filter: unknown, update: { $set: { slug: string } }) => {
      written = update.$set.slug;
      return { acknowledged: true, matchedCount: 1 };
    });

    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_abcdef")).resolves.toBe("acme");
    expect(mocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_abcdef", $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
      { $set: { slug: "acme" } }
    );
  });
});
