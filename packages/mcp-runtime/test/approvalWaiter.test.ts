import { describe, expect, it, vi } from "vitest";
import { createVerifyPollingApprovalWaiter } from "../src/approvalWaiter.js";
import {
  allowDecision,
  approvalRequiredDecision,
  denyDecision,
  invocation,
  ScriptedVerifyClient,
} from "./helpers/fakes.js";

describe("createVerifyPollingApprovalWaiter", () => {
  it("returns a granted decision once verify flips to allowed", async () => {
    const client = new ScriptedVerifyClient([
      approvalRequiredDecision(),
      allowDecision({ requestId: "req_granted" }),
    ]);
    const sleep = vi.fn(async () => {});
    const waiter = createVerifyPollingApprovalWaiter({
      verifyClient: client,
      agentId: "agent_1",
      pollIntervalMs: 1,
      timeoutMs: 1_000,
      sleep,
    });

    const result = await waiter({
      approvalId: "apr_123",
      invocation: invocation(),
      decision: approvalRequiredDecision(),
    });

    expect(result).toEqual({
      granted: true,
      decision: allowDecision({ requestId: "req_granted" }),
    });
    expect(sleep).toHaveBeenCalled();
  });

  it("returns denied when the platform clears approvalRequired without allowing", async () => {
    const client = new ScriptedVerifyClient([
      denyDecision({ reason: "human denied", approvalRequired: false }),
    ]);
    const waiter = createVerifyPollingApprovalWaiter({
      verifyClient: client,
      agentId: "agent_1",
      pollIntervalMs: 1,
      timeoutMs: 1_000,
      sleep: async () => {},
    });

    const result = await waiter({
      approvalId: "apr_123",
      invocation: invocation(),
      decision: approvalRequiredDecision(),
    });

    expect(result).toBe("denied");
  });

  it("keeps polling through transient verify failures until timeout, then denies", async () => {
    const client = new ScriptedVerifyClient([
      { throws: new Error("temporary outage") },
    ]);
    let now = 0;
    const realDateNow = Date.now;
    Date.now = () => now;

    try {
      const waiter = createVerifyPollingApprovalWaiter({
        verifyClient: client,
        agentId: "agent_1",
        pollIntervalMs: 10,
        timeoutMs: 50,
        sleep: async (ms) => {
          now += ms;
        },
      });

      const result = await waiter({
        approvalId: "apr_123",
        invocation: invocation(),
        decision: approvalRequiredDecision(),
      });

      expect(result).toBe("denied");
      expect(client.callCount).toBeGreaterThan(0);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("times out as denial when approval never resolves", async () => {
    const client = new ScriptedVerifyClient([approvalRequiredDecision()]);
    let now = 0;
    const realDateNow = Date.now;
    Date.now = () => now;

    try {
      const waiter = createVerifyPollingApprovalWaiter({
        verifyClient: client,
        agentId: "agent_1",
        pollIntervalMs: 5,
        timeoutMs: 20,
        sleep: async (ms) => {
          now += ms;
        },
      });

      const result = await waiter({
        approvalId: "apr_123",
        invocation: invocation(),
        decision: approvalRequiredDecision(),
      });

      expect(result).toBe("denied");
    } finally {
      Date.now = realDateNow;
    }
  });
});
