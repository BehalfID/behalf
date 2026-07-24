import { describe, expect, it } from "vitest";
import {
  callVerify,
  isValidVerifyDecision,
  VerifyMalformedError,
  VerifyTimeoutError,
  withVerifyTimeout,
} from "../src/verify.js";
import { allowDecision, ScriptedVerifyClient } from "./helpers/fakes.js";
import type { VerifyRequest } from "../src/types.js";

const sampleRequest: VerifyRequest = {
  agentId: "agent_1",
  action: "mcp_tool",
  resource: "mcp:filesystem:read_file",
};

describe("isValidVerifyDecision", () => {
  it("accepts a fully formed decision", () => {
    expect(isValidVerifyDecision(allowDecision())).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(isValidVerifyDecision(null)).toBe(false);
    expect(isValidVerifyDecision({ allowed: true })).toBe(false);
    expect(
      isValidVerifyDecision({
        requestId: "r",
        allowed: true,
        reason: "ok",
        risk: "extreme",
      }),
    ).toBe(false);
  });
});

describe("callVerify", () => {
  it("returns a validated decision", async () => {
    const client = new ScriptedVerifyClient([allowDecision()]);
    await expect(callVerify(client, sampleRequest)).resolves.toEqual(
      allowDecision(),
    );
  });

  it("throws VerifyMalformedError for invalid shapes", async () => {
    const client = new ScriptedVerifyClient([{ raw: { allowed: true } }]);
    await expect(callVerify(client, sampleRequest)).rejects.toBeInstanceOf(
      VerifyMalformedError,
    );
  });
});

describe("withVerifyTimeout", () => {
  it("rejects with VerifyTimeoutError when the client hangs", async () => {
    const client = withVerifyTimeout(
      new ScriptedVerifyClient([{ hangs: true }]),
      30,
    );

    await expect(client.verify(sampleRequest)).rejects.toBeInstanceOf(
      VerifyTimeoutError,
    );
  });

  it("returns promptly when the client responds", async () => {
    const client = withVerifyTimeout(
      new ScriptedVerifyClient([allowDecision()]),
      1_000,
    );

    await expect(client.verify(sampleRequest)).resolves.toEqual(allowDecision());
  });
});
