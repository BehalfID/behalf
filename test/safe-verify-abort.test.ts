/**
 * Regression tests for abort-on-timeout behavior (issue #78).
 *
 * Covers:
 * - BehalfID.verify passes an AbortSignal through to fetch
 * - safeVerify aborts the in-flight verify request when timeoutMs fires
 * - safeVerify still returns the existing fail-closed timeout deny result
 * - the aborted verify promise never becomes an unhandled rejection
 * - the no-timeout path does not create or require an AbortController
 * - legacy clients declaring verify(input) only remain compatible
 *
 * Both copies of safeVerify are tested: integrations/shared and
 * packages/sdk/src/adapters/shared. All fetch calls are mocked.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { BehalfID } from "../packages/sdk/src/client";
import {
  safeVerify as safeVerifyIntegrations,
  type BehalfIDClient,
  type VerifyInput,
  type VerifyResult,
} from "../integrations/shared/index";
import { safeVerify as safeVerifySdk } from "../packages/sdk/src/adapters/shared/index";

const BASE_URL = "https://behalf.example.com";
const API_KEY = "bhf_sk_testkey12345";

const INPUT: VerifyInput = { agentId: "agent_test", action: "test" };

const ALLOWED_RESULT: VerifyResult = {
  requestId: "req_allowed",
  allowed: true,
  reason: "Permission matched.",
  risk: "low",
};

function abortError(): Error {
  return new DOMException("This operation was aborted", "AbortError");
}

// ─── BehalfID.verify → fetch signal threading ────────────────────────────────

describe("BehalfID.verify — AbortSignal support", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFetchMock() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ALLOWED_RESULT),
    });
  }

  it("passes the provided AbortSignal to fetch", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const behalf = new BehalfID({ apiKey: API_KEY, baseUrl: BASE_URL });
    const controller = new AbortController();
    await behalf.verify(INPUT, { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("verify(input) without options still works and passes no signal", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const behalf = new BehalfID({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await behalf.verify(INPUT);

    expect(result).toEqual(ALLOWED_RESULT);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });

  it("rejects with an abort-specific error when the request is aborted", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(abortError()));
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const behalf = new BehalfID({ apiKey: API_KEY, baseUrl: BASE_URL });
    const controller = new AbortController();
    const pending = behalf.verify(INPUT, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/i);
  });
});

// ─── safeVerify — both copies (integrations + sdk adapters) ─────────────────

const implementations = [
  { name: "integrations/shared", safeVerify: safeVerifyIntegrations },
  { name: "packages/sdk adapters/shared", safeVerify: safeVerifySdk },
] as const;

describe.each(implementations)("safeVerify abort-on-timeout ($name)", ({ safeVerify }) => {
  /** Client that never resolves unless aborted; records the options it got. */
  function hangingClient() {
    const seen: { options?: { signal?: AbortSignal } } = {};
    const client: BehalfIDClient = {
      verify: (_input, options) => {
        seen.options = options;
        return new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(abortError()));
        });
      },
    };
    return { client, seen };
  }

  it("aborts the in-flight verify and returns the fail-closed deny on timeout", async () => {
    const { client, seen } = hangingClient();

    const result = await safeVerify(
      { client, agentId: "agent_test", timeoutMs: 5 },
      INPUT
    );

    expect(result.allowed).toBe(false);
    expect(result.requestId).toBe("req_verify_unavailable");
    expect(result.risk).toBe("high");
    expect(seen.options?.signal).toBeInstanceOf(AbortSignal);
    expect(seen.options?.signal?.aborted).toBe(true);
  });

  it("does not produce an unhandled rejection from the aborted verify promise", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const { client } = hangingClient();
      const result = await safeVerify(
        { client, agentId: "agent_test", timeoutMs: 5 },
        INPUT
      );
      expect(result.allowed).toBe(false);

      // Give the aborted promise's rejection time to surface if unhandled.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("does not pass an AbortSignal when timeoutMs is not set", async () => {
    let seenOptions: { signal?: AbortSignal } | undefined = { signal: undefined };
    const client: BehalfIDClient = {
      verify: async (_input, options) => {
        seenOptions = options;
        return ALLOWED_RESULT;
      },
    };

    const result = await safeVerify({ client, agentId: "agent_test" }, INPUT);

    expect(result).toEqual(ALLOWED_RESULT);
    expect(seenOptions).toBeUndefined();
  });

  it("returns the verify result unchanged when it settles before the timeout", async () => {
    let seenSignal: AbortSignal | undefined;
    const client: BehalfIDClient = {
      verify: async (_input, options) => {
        seenSignal = options?.signal;
        return ALLOWED_RESULT;
      },
    };

    const result = await safeVerify(
      { client, agentId: "agent_test", timeoutMs: 5000 },
      INPUT
    );

    expect(result).toEqual(ALLOWED_RESULT);
    expect(seenSignal?.aborted).toBe(false);
  });

  it("still fails closed when verify rejects before the timeout", async () => {
    const client: BehalfIDClient = {
      verify: async () => {
        throw new Error("simulated network failure");
      },
    };

    const result = await safeVerify(
      { client, agentId: "agent_test", timeoutMs: 5000 },
      INPUT
    );

    expect(result.allowed).toBe(false);
    expect(result.requestId).toBe("req_verify_unavailable");
  });

  it("remains compatible with legacy clients that declare verify(input) only", async () => {
    // One-parameter verify functions still satisfy BehalfIDClient — the extra
    // options argument is simply ignored and the request is not cancelled.
    const legacyClient: BehalfIDClient = {
      verify: async (input: VerifyInput) => ({
        ...ALLOWED_RESULT,
        requestId: `req_for_${input.agentId}`,
      }),
    };

    const result = await safeVerify(
      { client: legacyClient, agentId: "agent_test", timeoutMs: 5000 },
      INPUT
    );

    expect(result.allowed).toBe(true);
    expect(result.requestId).toBe("req_for_agent_test");
  });
});
