import { describe, expect, it } from "vitest";
import {
  CORE_TABLES,
  CRITICAL_INDEX_NAMES,
  assertSmokeTestExpectations,
  isSmokeTestEnabled,
  resolveSmokeTestUrl,
  runPostgresMigrationSmoke
} from "../scripts/postgres-smoke";

const smokeEnabled = isSmokeTestEnabled();

describe("postgres migration smoke (optional)", () => {
  it.skipIf(!smokeEnabled)(
    "applies initial migration in an isolated schema and verifies v1 invariants",
    async () => {
      const url = resolveSmokeTestUrl();
      expect(url, "POSTGRES_TEST_URL or DATABASE_URL required").toBeTruthy();

      const result = await runPostgresMigrationSmoke(url);
      await assertSmokeTestExpectations(result);

      expect(result.tables.sort()).toEqual([...CORE_TABLES].sort());
      expect(result.rlsEnabledTables.sort()).toEqual([...CORE_TABLES].sort());

      for (const indexName of CRITICAL_INDEX_NAMES) {
        expect(result.indexes, indexName).toContain(indexName);
      }

      expect(result.verificationLogsPartitioned).toBe(true);
      expect(result.verificationLogCompositePrimaryKey).toBe(true);
      expect(result.verificationLogCompositeRequestUnique).toBe(true);
      expect(result.verificationLogPartitions).toContain("verification_logs_default");
      expect(result.verificationLogRetentionPurgedRows).toBe(1);
      expect(result.verificationLogRetentionRemainingIds).toEqual(["log_retention_current"]);
      expect(result.verificationLogCronSkippedWhenUnavailable).toBe(true);
    },
    60_000
  );

  it("is skipped unless RUN_POSTGRES_MIGRATION_SMOKE=true and a Postgres URL is set", () => {
    if (process.env.RUN_POSTGRES_MIGRATION_SMOKE === "true" && resolveSmokeTestUrl()) {
      expect(smokeEnabled).toBe(true);
      return;
    }
    expect(smokeEnabled).toBe(false);
  });
});
