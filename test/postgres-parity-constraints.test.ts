/**
 * Optional live Postgres constraints for Phase B′ schema parity.
 *
 * Gated by RUN_POSTGRES_MIGRATION_SMOKE=true (same disposable URL as smoke test).
 * Skipped by default so `npx vitest run` needs no database.
 */

import { describe, expect, it } from "vitest";
import {
  isSmokeTestEnabled,
  resolveSmokeTestUrl,
  setupPostgresContractTestSchema
} from "../scripts/postgres-smoke";

const enabled = isSmokeTestEnabled();

describe("postgres parity constraints (optional live)", () => {
  it.skipIf(!enabled)(
    "approval pending unique distinguishes argument fingerprints and allows non-pending coexistence",
    async () => {
      const ctx = await setupPostgresContractTestSchema(resolveSmokeTestUrl());
      const { sql, schemaName, cleanup } = ctx;

      try {
        await sql`SET search_path TO ${sql(schemaName)}`;
        await sql`
          INSERT INTO accounts (account_id, name, plan)
          VALUES ('acct_parity', 'Parity', 'free')
        `;
        await sql`
          INSERT INTO developer_users (user_id, email, password_hash, onboarding_use_case)
          VALUES ('user_parity', 'parity@example.com', 'hash', 'sdk')
        `;
        await sql`
          INSERT INTO agents (
            agent_id, account_id, developer_user_id, name, api_key_hash, status
          )
          VALUES ('agent_parity', 'acct_parity', 'user_parity', 'Agent', 'api_hash_parity', 'active')
        `;
        await sql`
          INSERT INTO permissions (
            permission_id, account_id, agent_id, action, status
          )
          VALUES ('perm_parity', 'acct_parity', 'agent_parity', 'execute_command', 'active')
        `;

        const shared = {
          agent_id: "agent_parity",
          permission_id: "perm_parity",
          action: "execute_command",
          vendor: null as string | null,
          amount: null as string | null,
          kind: "agent_action",
          status: "pending"
        };

        await sql`
          INSERT INTO approval_requests (
            approval_id, request_id, account_id, developer_user_id,
            kind, agent_id, permission_id, action, vendor, amount,
            argument_fingerprint, status
          )
          VALUES (
            'appr_fp_a', 'req_fp_a', 'acct_parity', 'user_parity',
            ${shared.kind}, ${shared.agent_id}, ${shared.permission_id}, ${shared.action},
            ${shared.vendor}, ${shared.amount},
            'fingerprint_aaa', ${shared.status}
          )
        `;

        // Different fingerprint → allowed
        await sql`
          INSERT INTO approval_requests (
            approval_id, request_id, account_id, developer_user_id,
            kind, agent_id, permission_id, action, vendor, amount,
            argument_fingerprint, status
          )
          VALUES (
            'appr_fp_b', 'req_fp_b', 'acct_parity', 'user_parity',
            ${shared.kind}, ${shared.agent_id}, ${shared.permission_id}, ${shared.action},
            ${shared.vendor}, ${shared.amount},
            'fingerprint_bbb', ${shared.status}
          )
        `;

        // Identical pending scope (same fingerprint) → conflict
        let conflicted = false;
        try {
          await sql`
            INSERT INTO approval_requests (
              approval_id, request_id, account_id, developer_user_id,
              kind, agent_id, permission_id, action, vendor, amount,
              argument_fingerprint, status
            )
            VALUES (
              'appr_fp_dup', 'req_fp_dup', 'acct_parity', 'user_parity',
              ${shared.kind}, ${shared.agent_id}, ${shared.permission_id}, ${shared.action},
              ${shared.vendor}, ${shared.amount},
              'fingerprint_aaa', ${shared.status}
            )
          `;
        } catch {
          conflicted = true;
        }
        expect(conflicted).toBe(true);

        // Non-pending historical rows with same tuple + fingerprint → allowed
        await sql`
          INSERT INTO approval_requests (
            approval_id, request_id, account_id, developer_user_id,
            kind, agent_id, permission_id, action, vendor, amount,
            argument_fingerprint, status, used_at
          )
          VALUES (
            'appr_fp_used', 'req_fp_used', 'acct_parity', 'user_parity',
            ${shared.kind}, ${shared.agent_id}, ${shared.permission_id}, ${shared.action},
            ${shared.vendor}, ${shared.amount},
            'fingerprint_aaa', 'used', now()
          )
        `;
      } finally {
        await cleanup();
      }
    },
    60_000
  );

  it.skipIf(!enabled)(
    "allows multiple pending managed_profile_pause rows with an identical tuple (Mongo parity) and keeps the lookup indexed",
    async () => {
      const ctx = await setupPostgresContractTestSchema(resolveSmokeTestUrl());
      const { sql, schemaName, cleanup } = ctx;

      try {
        await sql`SET search_path TO ${sql(schemaName)}`;
        await sql`
          INSERT INTO accounts (account_id, name, plan)
          VALUES ('acct_pause', 'Pause', 'free')
        `;
        await sql`
          INSERT INTO developer_users (user_id, email, password_hash, onboarding_use_case)
          VALUES ('user_pause', 'pause@example.com', 'hash', 'sdk')
        `;

        // The stricter Postgres-only unique index from 0000 must be gone after 0004.
        const uniqueIndexes = await sql<{ indexname: string }[]>`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = ${schemaName}
            AND indexname = 'approval_requests_managed_profile_pause_pending_uq'
        `;
        expect(uniqueIndexes).toHaveLength(0);

        // The intended pending-pause lookup remains indexed (non-unique).
        const [lookupIndex] = await sql<{ indexdef: string }[]>`
          SELECT indexdef
          FROM pg_indexes
          WHERE schemaname = ${schemaName}
            AND indexname = 'approval_requests_pause_pending_lookup_idx'
        `;
        expect(lookupIndex).toBeDefined();
        expect(lookupIndex.indexdef).not.toMatch(/UNIQUE/i);

        const pauseTuple = {
          account_id: "acct_pause",
          developer_user_id: "user_pause",
          kind: "managed_profile_pause",
          action: "managed_profile_pause",
          pause_tool: "claude",
          pause_scope: "current_repo",
          pause_repo: "repo_hash_abc",
          pause_device_id: "device_1",
          status: "pending"
        };

        await sql`
          INSERT INTO approval_requests (
            approval_id, request_id, account_id, developer_user_id,
            kind, action, pause_tool, pause_scope, pause_repo, pause_device_id, status
          )
          VALUES (
            'apr_pause_a', 'req_pause_a', ${pauseTuple.account_id}, ${pauseTuple.developer_user_id},
            ${pauseTuple.kind}, ${pauseTuple.action}, ${pauseTuple.pause_tool},
            ${pauseTuple.pause_scope}, ${pauseTuple.pause_repo}, ${pauseTuple.pause_device_id},
            ${pauseTuple.status}
          )
        `;

        // Second pending row with an identical tuple — Mongo permits this; Postgres must too.
        let coexistenceFailed = false;
        try {
          await sql`
            INSERT INTO approval_requests (
              approval_id, request_id, account_id, developer_user_id,
              kind, action, pause_tool, pause_scope, pause_repo, pause_device_id, status
            )
            VALUES (
              'apr_pause_b', 'req_pause_b', ${pauseTuple.account_id}, ${pauseTuple.developer_user_id},
              ${pauseTuple.kind}, ${pauseTuple.action}, ${pauseTuple.pause_tool},
              ${pauseTuple.pause_scope}, ${pauseTuple.pause_repo}, ${pauseTuple.pause_device_id},
              ${pauseTuple.status}
            )
          `;
        } catch {
          coexistenceFailed = true;
        }
        expect(coexistenceFailed).toBe(false);

        const [{ count }] = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM approval_requests
          WHERE account_id = 'acct_pause'
            AND kind = 'managed_profile_pause'
            AND status = 'pending'
        `;
        expect(Number(count)).toBe(2);

        // The intended pending-pause lookup is served by the non-unique index.
        // Force index consideration (tiny tables otherwise prefer a seq scan) so the
        // plan proves the lookup remains indexed rather than merely index-eligible.
        await sql`SET enable_seqscan = off`;
        const planRows = await sql<{ "QUERY PLAN": string }[]>`
          EXPLAIN
          SELECT approval_id
          FROM approval_requests
          WHERE account_id = 'acct_pause'
            AND developer_user_id = 'user_pause'
            AND kind = 'managed_profile_pause'
            AND pause_tool = 'claude'
            AND pause_scope = 'current_repo'
            AND pause_repo = 'repo_hash_abc'
            AND pause_device_id = 'device_1'
            AND status = 'pending'
        `;
        await sql`SET enable_seqscan = on`;
        const plan = planRows.map((row) => row["QUERY PLAN"]).join("\n");
        expect(plan).toContain("approval_requests_pause_pending_lookup_idx");
      } finally {
        await cleanup();
      }
    },
    60_000
  );

  it.skipIf(!enabled)(
    "persists developer session last_activity_at and enforces new-table uniqueness/FKs",
    async () => {
      const ctx = await setupPostgresContractTestSchema(resolveSmokeTestUrl());
      const { sql, schemaName, cleanup } = ctx;

      try {
        await sql`SET search_path TO ${sql(schemaName)}`;
        await sql`
          INSERT INTO accounts (account_id, name, plan)
          VALUES ('acct_parity2', 'Parity 2', 'free')
        `;
        await sql`
          INSERT INTO developer_users (user_id, email, password_hash, onboarding_use_case)
          VALUES ('user_parity2', 'parity2@example.com', 'hash', 'sdk')
        `;

        const activityAt = new Date("2026-01-15T12:00:00.000Z");
        await sql`
          INSERT INTO developer_sessions (
            session_id, user_id, token_hash, expires_at, last_activity_at
          )
          VALUES (
            'sess_parity',
            'user_parity2',
            'token_parity',
            ${new Date("2026-01-15T13:00:00.000Z")},
            ${activityAt}
          )
        `;

        const [session] = await sql<{ last_activity_at: Date }[]>`
          SELECT last_activity_at FROM developer_sessions WHERE session_id = 'sess_parity'
        `;
        expect(new Date(session.last_activity_at).toISOString()).toBe(activityAt.toISOString());

        await sql`
          INSERT INTO sites (
            site_id, account_id, developer_user_id, name, domain, status
          )
          VALUES (
            'site_parity', 'acct_parity2', 'user_parity2', 'Example', 'example.com', 'active'
          )
        `;

        let domainConflict = false;
        try {
          await sql`
            INSERT INTO sites (
              site_id, account_id, developer_user_id, name, domain, status
            )
            VALUES (
              'site_parity_dup', 'acct_parity2', 'user_parity2', 'Example 2', 'example.com', 'active'
            )
          `;
        } catch {
          domainConflict = true;
        }
        expect(domainConflict).toBe(true);

        await sql`
          INSERT INTO site_guard_keys (
            key_id, site_id, account_id, developer_user_id, name, key_hash, key_preview, status
          )
          VALUES (
            'key_parity', 'site_parity', 'acct_parity2', 'user_parity2',
            'Primary', 'key_hash_parity', 'sg_****', 'active'
          )
        `;

        let keyConflict = false;
        try {
          await sql`
            INSERT INTO site_guard_keys (
              key_id, site_id, account_id, developer_user_id, name, key_hash, key_preview, status
            )
            VALUES (
              'key_parity_dup', 'site_parity', 'acct_parity2', 'user_parity2',
              'Dup', 'key_hash_parity', 'sg_****', 'active'
            )
          `;
        } catch {
          keyConflict = true;
        }
        expect(keyConflict).toBe(true);

        await sql`
          INSERT INTO device_codes (
            code_id, device_code, user_code, status, expires_at
          )
          VALUES (
            'code_parity', 'device_parity', 'USER-CODE', 'pending',
            ${new Date(Date.now() + 60_000)}
          )
        `;

        let deviceConflict = false;
        try {
          await sql`
            INSERT INTO device_codes (
              code_id, device_code, user_code, status, expires_at
            )
            VALUES (
              'code_parity_dup', 'device_parity', 'OTHER-CODE', 'pending',
              ${new Date(Date.now() + 60_000)}
            )
          `;
        } catch {
          deviceConflict = true;
        }
        expect(deviceConflict).toBe(true);

        // FK: site_access_rules require an existing site
        let missingSiteFk = false;
        try {
          await sql`
            INSERT INTO site_access_rules (
              rule_id, site_id, account_id, developer_user_id, name, status
            )
            VALUES (
              'rule_missing_site', 'site_does_not_exist', 'acct_parity2', 'user_parity2',
              'Rule', 'active'
            )
          `;
        } catch {
          missingSiteFk = true;
        }
        expect(missingSiteFk).toBe(true);
      } finally {
        await cleanup();
      }
    },
    60_000
  );

  it.skipIf(!enabled)(
    "TTL cleanup deletes only expired sessions and device codes",
    async () => {
      const ctx = await setupPostgresContractTestSchema(resolveSmokeTestUrl());
      const { sql, schemaName, cleanup } = ctx;

      try {
        await sql`SET search_path TO ${sql(schemaName)}`;
        await sql`
          INSERT INTO developer_users (user_id, email, password_hash, onboarding_use_case)
          VALUES ('user_ttl', 'ttl@example.com', 'hash', 'sdk')
        `;
        await sql`
          INSERT INTO developer_sessions (
            session_id, user_id, token_hash, expires_at, last_activity_at
          )
          VALUES
            (
              'sess_old', 'user_ttl', 'th_old',
              CURRENT_TIMESTAMP - interval '10 minutes',
              CURRENT_TIMESTAMP - interval '1 hour'
            ),
            (
              'sess_new', 'user_ttl', 'th_new',
              CURRENT_TIMESTAMP + interval '10 minutes',
              CURRENT_TIMESTAMP
            )
        `;
        await sql`
          INSERT INTO device_codes (code_id, device_code, user_code, status, expires_at)
          VALUES
            (
              'code_old', 'dev_old', 'OLD-CODE', 'pending',
              CURRENT_TIMESTAMP - interval '1 minute'
            ),
            (
              'code_new', 'dev_new', 'NEW-CODE', 'pending',
              CURRENT_TIMESTAMP + interval '10 minutes'
            )
        `;

        const [result] = await sql<{
          result: {
            developerSessions: number;
            deviceCodes: number;
            oauthPendingSignups: number;
          };
        }[]>`
          SELECT ${sql(schemaName)}.behalf_run_ttl_cleanup(${schemaName}, 100) AS result
        `;

        expect(result.result.developerSessions).toBe(1);
        expect(result.result.deviceCodes).toBe(1);

        const sessions = await sql<{ session_id: string }[]>`
          SELECT session_id FROM developer_sessions WHERE user_id = 'user_ttl' ORDER BY session_id
        `;
        expect(sessions.map((row) => row.session_id)).toEqual(["sess_new"]);

        const codes = await sql<{ code_id: string }[]>`
          SELECT code_id FROM device_codes ORDER BY code_id
        `;
        expect(codes.map((row) => row.code_id)).toEqual(["code_new"]);
      } finally {
        await cleanup();
      }
    },
    60_000
  );

  it("is skipped unless RUN_POSTGRES_MIGRATION_SMOKE=true and a Postgres URL is set", () => {
    if (process.env.RUN_POSTGRES_MIGRATION_SMOKE === "true" && resolveSmokeTestUrl()) {
      expect(enabled).toBe(true);
      return;
    }
    expect(enabled).toBe(false);
  });
});
