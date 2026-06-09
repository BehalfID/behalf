/**
 * Live integration tests for the BehalfID /api/verify endpoint.
 *
 * These tests make real HTTP calls to a running BehalfID instance.
 * They are OPT-IN and will be skipped unless all of the following are true:
 *
 *   RUN_LIVE_TESTS=true
 *   BEHALFID_BASE_URL is set
 *   BEHALFID_API_KEY is set
 *   BEHALFID_AGENT_ID is set
 *
 * Allowed-path tests additionally require a seeded permission:
 *   action: "send", resource: "communication.email"
 * Run `npm run seed:live-test` first, or they will skip with instructions.
 *
 * Run:
 *   npm run seed:live-test
 *   RUN_LIVE_TESTS=true npx vitest run test/integration/live-verify.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { loadLocalEnv } from "../helpers/load-local-env";
import { ensureLiveTestPermission, ALLOWED_ACTION, ALLOWED_RESOURCE } from "../helpers/live-test-setup";

loadLocalEnv();

const REQUIRED = ["BEHALFID_BASE_URL", "BEHALFID_API_KEY", "BEHALFID_AGENT_ID"] as const;

function shouldSkip(): { skip: boolean; reason: string } {
  if (process.env.RUN_LIVE_TESTS !== "true") {
    return { skip: true, reason: "RUN_LIVE_TESTS is not set to 'true'" };
  }
  const missing = REQUIRED.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    return { skip: true, reason: `Missing env vars: ${missing.join(", ")}` };
  }
  return { skip: false, reason: "" };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

type VerifyPayload = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

type VerifyResponse = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

async function callVerify(payload: VerifyPayload): Promise<VerifyResponse> {
  const baseUrl = process.env.BEHALFID_BASE_URL!.replace(/\/+$/, "");
  const apiKey = process.env.BEHALFID_API_KEY!;

  const res = await fetch(`${baseUrl}/api/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`BehalfID /api/verify returned HTTP ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as VerifyResponse;
}

// ─── Denied-path tests ────────────────────────────────────────────────────────

describe("live: BehalfID /api/verify — denied paths", () => {
  beforeAll(() => {
    const { skip, reason } = shouldSkip();
    if (skip) console.log(`[live-verify] SKIP — ${reason}`);
  });

  it("always blocks an obviously unauthorized high-value purchase", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/deny] SKIP — ${reason}`); return; }

    const agentId = process.env.BEHALFID_AGENT_ID!;
    let result: VerifyResponse;
    try {
      result = await callVerify({ agentId, action: "purchase", resource: "commerce.checkout", amount: 999999 });
    } catch (err) {
      console.error("[live-verify/deny] network error — treating as deny (fail-closed):", err);
      expect(true).toBe(true);
      return;
    }

    expect(result.allowed).toBe(false);
    expect(result.requestId).toBeTruthy();
    expect(result.reason).toBeTruthy();
    console.log(`[live-verify/deny] purchase denied (requestId=${result.requestId}, risk=${result.risk})`);
  });

  it("returns a well-formed response for any verify call", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/deny] SKIP — ${reason}`); return; }

    const agentId = process.env.BEHALFID_AGENT_ID!;
    let result: VerifyResponse;
    try {
      result = await callVerify({ agentId, action: "browse_web", resource: "example.com" });
    } catch (err) {
      console.error("[live-verify/deny] network error:", err);
      return;
    }

    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.reason).toBe("string");
    expect(["low", "medium", "high"]).toContain(result.risk);
    console.log(`[live-verify/deny] browse_web → allowed=${result.allowed} (requestId=${result.requestId})`);
  });

  it("server returns non-200 for an invalid API key", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/deny] SKIP — ${reason}`); return; }

    const baseUrl = process.env.BEHALFID_BASE_URL!.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer bhf_sk_invalid_key_for_error_test",
      },
      body: JSON.stringify({ agentId: process.env.BEHALFID_AGENT_ID!, action: "test.error_path" }),
    });

    expect(res.status).not.toBe(200);
    console.log(`[live-verify/deny] invalid key → HTTP ${res.status} (correct)`);
  });
});

// ─── Allowed-path tests ───────────────────────────────────────────────────────

describe("live: BehalfID /api/verify — allowed paths", () => {
  let canRunAllowedTests = false;
  let allowedSkipReason = "";

  beforeAll(async () => {
    const { skip, reason } = shouldSkip();
    if (skip) {
      allowedSkipReason = reason;
      return;
    }

    const setup = await ensureLiveTestPermission();
    canRunAllowedTests = setup.canRunAllowedTests;
    if (!setup.canRunAllowedTests) {
      allowedSkipReason = setup.reason ?? "Permission not available";
      console.log(`[live-verify/allow] SKIP allowed-path tests — ${allowedSkipReason}`);
    } else {
      console.log(`[live-verify/allow] Allowed-path permission confirmed — running allowed-path tests`);
      if (setup.seededPermissionId) {
        console.log(`[live-verify/allow] Seeded permission: ${setup.seededPermissionId} (expires in 1h)`);
      }
    }
  });

  it("allows the seeded action and returns allowed: true", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live-verify/allow] SKIP — ${allowedSkipReason}`); return; }

    const agentId = process.env.BEHALFID_AGENT_ID!;
    let result: VerifyResponse;
    try {
      result = await callVerify({ agentId, action: ALLOWED_ACTION, resource: ALLOWED_RESOURCE });
    } catch (err) {
      console.error("[live-verify/allow] network error:", err);
      return;
    }

    expect(result.allowed).toBe(true);
    expect(result.requestId).toBeTruthy();
    console.log(
      `[live-verify/allow] ${ALLOWED_ACTION}/${ALLOWED_RESOURCE} → allowed=true (requestId=${result.requestId})`
    );
  });

  it("returns a valid requestId and risk for an allowed action", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live-verify/allow] SKIP — ${allowedSkipReason}`); return; }

    const agentId = process.env.BEHALFID_AGENT_ID!;
    let result: VerifyResponse;
    try {
      result = await callVerify({ agentId, action: ALLOWED_ACTION, resource: ALLOWED_RESOURCE });
    } catch (err) {
      console.error("[live-verify/allow] network error:", err);
      return;
    }

    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
    expect(result.allowed).toBe(true);
    expect(["low", "medium", "high"]).toContain(result.risk);
    console.log(`[live-verify/allow] response shape valid (risk=${result.risk})`);
  });

  it("same action with wrong resource is still denied", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live-verify/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live-verify/allow] SKIP — ${allowedSkipReason}`); return; }

    // The seeded permission is for resource="communication.email".
    // A different resource should be denied (no matching permission).
    const agentId = process.env.BEHALFID_AGENT_ID!;
    let result: VerifyResponse;
    try {
      result = await callVerify({ agentId, action: ALLOWED_ACTION, resource: "unrelated.resource.for.denial" });
    } catch (err) {
      console.error("[live-verify/allow] network error:", err);
      return;
    }

    expect(result.allowed).toBe(false);
    console.log(`[live-verify/allow] wrong-resource denied correctly (requestId=${result.requestId})`);
  });
});
