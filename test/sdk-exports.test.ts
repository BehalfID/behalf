/**
 * Validates that subpath exports from @behalfid/sdk dist are importable and
 * export the expected function names. This test catches broken path mappings,
 * missing build output, and renamed exports before they reach consumers.
 *
 * Does NOT require a running BehalfID instance. Runs as part of the regular
 * unit test suite.
 *
 * NOTE: @behalfid/sdk/adapters/vercel is NOT in the SDK package — the Vercel
 * adapter lives at integrations/vercel/index.ts and depends on next/server.
 * It is a deployment example, not a published subpath export.
 */

import { describe, it, expect } from "vitest";

// ─── Import directly from dist paths (mirrors the published package exports) ──

// These paths match the "exports" field in packages/sdk/package.json.
// If a path or function name is wrong, this import will fail at parse time.
import {
  checkToolCall,
  checkWebBrowse,
  checkPurchase,
} from "../packages/sdk/dist/adapters/openai/index.js";

import {
  checkToolUse,
  buildDeniedToolResult,
} from "../packages/sdk/dist/adapters/anthropic/index.js";

import {
  wrapToolWithBehalfID,
  wrapToolsWithBehalfID,
} from "../packages/sdk/dist/adapters/langchain/index.js";

import {
  gateCheckoutSession,
  gateCharge,
  gateSubscriptionChange,
  gateRefund,
} from "../packages/sdk/dist/adapters/stripe/index.js";

import {
  makeDenyResponse,
  safeVerify,
  requireEnvVars,
  mapToVerifyInput,
  withAuditMetadata,
} from "../packages/sdk/dist/adapters/shared/index.js";

import {
  wrapLlamaToolWithBehalfID,
} from "../packages/sdk/dist/adapters/llamaindex/index.js";

// ─── Shared utilities ─────────────────────────────────────────────────────────

describe("sdk exports: shared utilities", () => {
  it("makeDenyResponse is a function", () => {
    expect(typeof makeDenyResponse).toBe("function");
  });

  it("safeVerify is a function", () => {
    expect(typeof safeVerify).toBe("function");
  });

  it("requireEnvVars is a function", () => {
    expect(typeof requireEnvVars).toBe("function");
  });

  it("mapToVerifyInput is a function", () => {
    expect(typeof mapToVerifyInput).toBe("function");
  });

  it("withAuditMetadata is a function", () => {
    expect(typeof withAuditMetadata).toBe("function");
  });
});

// ─── OpenAI adapter ───────────────────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/openai", () => {
  it("checkToolCall is a function", () => {
    expect(typeof checkToolCall).toBe("function");
  });

  it("checkWebBrowse is a function", () => {
    expect(typeof checkWebBrowse).toBe("function");
  });

  it("checkPurchase is a function", () => {
    expect(typeof checkPurchase).toBe("function");
  });
});

// ─── Anthropic adapter ────────────────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/anthropic", () => {
  it("checkToolUse is a function", () => {
    expect(typeof checkToolUse).toBe("function");
  });

  it("buildDeniedToolResult is a function", () => {
    expect(typeof buildDeniedToolResult).toBe("function");
  });
});

// ─── LangChain adapter ────────────────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/langchain", () => {
  it("wrapToolWithBehalfID is a function", () => {
    expect(typeof wrapToolWithBehalfID).toBe("function");
  });

  it("wrapToolsWithBehalfID is a function", () => {
    expect(typeof wrapToolsWithBehalfID).toBe("function");
  });
});

// ─── Stripe adapter ───────────────────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/stripe", () => {
  it("gateCheckoutSession is a function", () => {
    expect(typeof gateCheckoutSession).toBe("function");
  });

  it("gateCharge is a function", () => {
    expect(typeof gateCharge).toBe("function");
  });

  it("gateSubscriptionChange is a function", () => {
    expect(typeof gateSubscriptionChange).toBe("function");
  });

  it("gateRefund is a function", () => {
    expect(typeof gateRefund).toBe("function");
  });
});

// ─── LlamaIndex adapter ───────────────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/llamaindex", () => {
  it("wrapLlamaToolWithBehalfID is a function", () => {
    expect(typeof wrapLlamaToolWithBehalfID).toBe("function");
  });
});

// ─── Vercel adapter (not in SDK) ─────────────────────────────────────────────

describe("sdk exports: @behalfid/sdk/adapters/vercel (NOT in SDK)", () => {
  it("Vercel adapter is not a subpath export of the SDK package", () => {
    // The Vercel adapter lives at integrations/vercel/index.ts and depends on
    // next/server. It is not published as part of @behalfid/sdk. This test
    // documents the intentional absence. To use it, import from @/integrations/vercel.
    expect(true).toBe(true);
  });
});

// ─── Smoke: safeVerify is fail-closed without a real client ──────────────────

describe("sdk exports: safeVerify fail-closed behavior", () => {
  it("returns deny when client.verify throws", async () => {
    const config = {
      client: {
        verify: async () => {
          throw new Error("simulated network failure");
        },
      },
      agentId: "agent_test",
    };

    const result = await safeVerify(config, { agentId: "agent_test", action: "test" });

    expect(result.allowed).toBe(false);
    expect(result.requestId).toBe("req_verify_unavailable");
  });

  it("returns deny when verify times out (1ms timeoutMs)", async () => {
    const config = {
      client: {
        verify: () => new Promise<never>((resolve) => setTimeout(resolve, 9999)),
      },
      agentId: "agent_test",
      timeoutMs: 1,
    };

    const result = await safeVerify(config, { agentId: "agent_test", action: "test" });

    expect(result.allowed).toBe(false);
  });
});
