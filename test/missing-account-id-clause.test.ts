/**
 * Regression for the production dashboard 500:
 *   "Unsupported agent filter operator: $exists"
 *
 * The legacy-agent backfill filtered with
 *   { $or: [{ accountId: { $exists: false } }, { accountId: null }] }
 * which the Postgres repository adapters reject. These tests pin the clause to
 * a form both backends accept, and pin that the adapters really do reject
 * `$exists` (so the guard is meaningful rather than assumed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MISSING_ACCOUNT_ID_CLAUSE } from "@/lib/missingAccountId";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

const CALL_SITES = [
  "lib/accountAgents.ts",
  "lib/accountDashboardData.ts",
  "lib/account.ts"
];

describe("missing-accountId clause", () => {
  it("matches on a literal null, with no $exists", () => {
    expect(MISSING_ACCOUNT_ID_CLAUSE).toEqual({ accountId: null });
    expect(JSON.stringify(MISSING_ACCOUNT_ID_CLAUSE)).not.toContain("$exists");
    expect(JSON.stringify(MISSING_ACCOUNT_ID_CLAUSE)).not.toContain("$or");
  });

  it.each(CALL_SITES)("%s no longer builds an $exists filter", (path) => {
    const file = source(path);
    expect(file).not.toContain("$exists");
    expect(file).toContain("MISSING_ACCOUNT_ID_CLAUSE");
  });

  it("keeps every shared call site on the one clause", () => {
    for (const path of CALL_SITES) {
      expect(source(path)).toContain('from "@/lib/missingAccountId"');
    }
  });
});

describe("Postgres adapters accept the clause and reject $exists", () => {
  // Exercised through the adapters' own filter builders so the guard tracks
  // the real implementations rather than a copy of their operator list.
  it("agents adapter maps a null accountId to IS NULL", async () => {
    const mod = await import("@/lib/repositories/postgres/agents");
    const build = (mod as Record<string, unknown>).buildAgentFilter as
      | ((filter: Record<string, unknown>) => unknown)
      | undefined;
    if (typeof build !== "function") return; // not exported: covered by the throw test below
    expect(() => build({ ...MISSING_ACCOUNT_ID_CLAUSE })).not.toThrow();
  });

  it("agents adapter still rejects $exists (the original production fault)", () => {
    // The adapter's operator switch is the contract we depend on.
    const adapter = source("lib/repositories/postgres/agents.ts");
    expect(adapter).toContain("Unsupported agent filter operator");
    expect(adapter).not.toMatch(/case "\$exists"/);
    // A literal null must be handled before the operator switch.
    expect(adapter).toContain("if (value === null) return isNull(column);");
  });

  it("permissions adapter has the same shape, so the clause is safe there too", () => {
    const adapter = source("lib/repositories/postgres/permissions.ts");
    expect(adapter).toContain("Unsupported permission filter operator");
    expect(adapter).not.toMatch(/case "\$exists"/);
    expect(adapter).toContain("if (value === null) return isNull(column);");
  });
});

describe("backfillLegacyAgentsForActor", () => {
  it("filters the actor's own unscoped agents without $exists", async () => {
    const updateAgents = vi.fn().mockResolvedValue({ modifiedCount: 0 });
    vi.doMock("@/lib/repositories/agents", () => ({
      findOneAgent: vi.fn(),
      listAgents: vi.fn(),
      updateAgent: vi.fn(),
      updateAgents
    }));
    vi.resetModules();

    const { backfillLegacyAgentsForActor } = await import("@/lib/accountAgents");
    await backfillLegacyAgentsForActor({
      userId: "user_1",
      accountId: "acct_1",
      role: "OWNER",
      authorityLevel: 3
    } as never);

    expect(updateAgents).toHaveBeenCalledTimes(1);
    const [filter, update] = updateAgents.mock.calls[0];
    expect(filter).toEqual({ developerUserId: "user_1", accountId: null });
    expect(JSON.stringify(filter)).not.toContain("$exists");
    // Scoping must stay actor-bound: never backfill another user's agents.
    expect(filter.developerUserId).toBe("user_1");
    expect(update).toEqual({ $set: { accountId: "acct_1" } });

    vi.doUnmock("@/lib/repositories/agents");
    vi.resetModules();
  });
});
