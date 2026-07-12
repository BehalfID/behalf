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
    expect(validateWorkspaceSlug("trajectus")).toBeNull();
    expect(validateWorkspaceSlug("acme-co")).toBeNull();
    expect(validateWorkspaceSlug("a1")).toBeNull();
  });

  it("rejects invalid slugs", async () => {
    const { validateWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(validateWorkspaceSlug("")).toMatch(/required/i);
    expect(validateWorkspaceSlug("Trajectus")).toMatch(/lowercase/i);
    expect(validateWorkspaceSlug("-bad")).toMatch(/letter or number/i);
    expect(validateWorkspaceSlug("a".repeat(64))).toMatch(/at most/i);
  });

  it("rejects reserved slugs", async () => {
    const { validateWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(validateWorkspaceSlug("api")).toMatch(/reserved/i);
    expect(validateWorkspaceSlug("dashboard")).toMatch(/reserved/i);
  });
});

describe("isReservedWorkspaceSlug", () => {
  it("includes api, dashboard, login, and locale prefixes", async () => {
    const { isReservedWorkspaceSlug } = await import("@/lib/workspaceSlug");
    for (const slug of ["api", "dashboard", "login", "en", "de", "es", "fr", "docs", "onboarding"]) {
      expect(isReservedWorkspaceSlug(slug)).toBe(true);
    }
  });

  it("is case-insensitive", async () => {
    const { isReservedWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(isReservedWorkspaceSlug("API")).toBe(true);
    expect(isReservedWorkspaceSlug("Dashboard")).toBe(true);
  });

  it("allows ordinary workspace names", async () => {
    const { isReservedWorkspaceSlug } = await import("@/lib/workspaceSlug");
    expect(isReservedWorkspaceSlug("trajectus")).toBe(false);
    expect(isReservedWorkspaceSlug("acme")).toBe(false);
  });
});

describe("accountIdSlugSuffix", () => {
  it("is deterministic and strips acct_ prefix", async () => {
    const { accountIdSlugSuffix } = await import("@/lib/workspaceSlug");
    expect(accountIdSlugSuffix("acct_abcdef")).toBe("abcdef");
    expect(accountIdSlugSuffix("acct_abcdef")).toBe(accountIdSlugSuffix("acct_abcdef"));
    expect(accountIdSlugSuffix("acct_12ab34cd56ef")).toBe("cd56ef");
  });
});

describe("generateUniqueWorkspaceSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the normalized base when unused", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    await expect(generateUniqueWorkspaceSlug("Acme Corp", "acct_abcdef")).resolves.toBe("acme-corp");
    expect(mocks.findAccountBySlugLean).toHaveBeenCalledWith("acme-corp");
  });

  it("appends a stable accountId suffix on collision", async () => {
    mocks.findAccountBySlugLean
      .mockResolvedValueOnce({ accountId: "acct_other", slug: "acme" })
      .mockResolvedValueOnce(null);
    const { accountIdSlugSuffix } = await import("@/lib/workspaceSlug");
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    const suffix = accountIdSlugSuffix("acct_abcdef");
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).resolves.toBe(`acme-${suffix}`);
  });

  it("treats an existing slug owned by the same account as available", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({ accountId: "acct_abcdef", slug: "acme" });
    const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
    await expect(generateUniqueWorkspaceSlug("acme", "acct_abcdef")).resolves.toBe("acme");
  });
});

describe("ensureAccountHasSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("generates and persists a slug when missing", async () => {
    mocks.findAccountByIdLean
      .mockResolvedValueOnce({
        accountId: "acct_abcdef",
        name: "Acme",
        companyName: "Acme",
        slug: null
      })
      .mockResolvedValueOnce({ slug: "acme" });
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    mocks.accountUpdateOne.mockResolvedValue({ acknowledged: true });

    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_abcdef")).resolves.toBe("acme");
    expect(mocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_abcdef", $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
      { $set: { slug: "acme" } }
    );
  });
});
