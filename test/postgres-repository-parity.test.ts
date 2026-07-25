import { describe, expect, it } from "vitest";
import { INTENTIONAL_POSTGRES_GAPS } from "@/lib/repositories/postgres/intentionalGaps";
import { auditPostgresRepositoryParity } from "@/lib/repositories/postgres/parityAudit";

/**
 * Static (no database) Phase 4 parity gate: every Mongo function export on a
 * Postgres-ready aggregate must either have a real Postgres implementation
 * bound in `runtime.ts`, or be an allowlisted intentional gap. This test
 * never opens a database connection — it inspects the actual runtime binding
 * object produced by `createPostgresRuntimeRepositories`.
 */
describe("postgres repository parity (static)", () => {
  it("has zero unintentional gaps across Postgres-ready aggregates", () => {
    const result = auditPostgresRepositoryParity();

    expect(result.missing).toEqual([]);
  });

  it("intentional gaps match the allowlisted mongoose lazy-passthrough surface exactly", () => {
    const result = auditPostgresRepositoryParity();

    expect(new Set(result.intentional)).toEqual(new Set(INTENTIONAL_POSTGRES_GAPS));
    expect(result.intentional).toHaveLength(INTENTIONAL_POSTGRES_GAPS.length);
  });

  it("accounts for every Mongo function export as either bound or intentional", () => {
    const result = auditPostgresRepositoryParity();

    expect(result.mongoFunctions).toBeGreaterThan(0);
    expect(result.bound + result.intentional.length + result.missing.length).toBe(
      result.mongoFunctions
    );
  });
});
