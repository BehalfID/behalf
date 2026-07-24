import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../packages/cli/src/lib/client";
import {
  printCaughtError,
  printError,
  redactSecrets,
  setJsonMode,
} from "../packages/cli/src/lib/output";

describe("CLI printError / ApiError", () => {
  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("redacts secrets in human and JSON modes", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setJsonMode(false);
    printError("Bearer bhf_sk_super_secret_value failed with bhf_dev_super_secret_value");
    setJsonMode(true);
    printError("webhook secret whsec_super_secret_value failed", {
      code: "network",
      hint: "retry with bhf_pass_super_secret_value",
    });

    const calls = JSON.stringify(errorSpy.mock.calls);
    expect(calls).not.toContain("bhf_sk_super_secret_value");
    expect(calls).not.toContain("bhf_dev_super_secret_value");
    expect(calls).not.toContain("whsec_super_secret_value");
    expect(calls).not.toContain("bhf_pass_super_secret_value");
    expect(calls).toContain("Bearer [redacted]");
    expect(JSON.parse(String(errorSpy.mock.calls[1]?.[0]))).toMatchObject({
      error: expect.stringContaining("whsec_[redacted]"),
      code: "network",
      hint: expect.stringContaining("bhf_pass_[redacted]"),
    });
  });

  it("surfaces ApiError code and hint via printCaughtError", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ApiError("Agent limit reached.", {
      status: 402,
      code: "AGENT_LIMIT_REACHED",
      hint: "Upgrade to Pro to continue.",
    });

    setJsonMode(false);
    printCaughtError(err);
    setJsonMode(true);
    printCaughtError(err);

    expect(errorSpy.mock.calls[0]?.[0]).toBe(
      "Error: [AGENT_LIMIT_REACHED] Agent limit reached."
    );
    expect(errorSpy.mock.calls[1]?.[0]).toBe("Hint: Upgrade to Pro to continue.");
    expect(JSON.parse(String(errorSpy.mock.calls[2]?.[0]))).toEqual({
      error: "Agent limit reached.",
      code: "AGENT_LIMIT_REACHED",
      hint: "Upgrade to Pro to continue.",
    });
  });

  it("allows explicit hint/code overrides on printCaughtError", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setJsonMode(true);
    printCaughtError(new Error("boom"), { code: "local", hint: "try again" });
    expect(JSON.parse(String(errorSpy.mock.calls[0]?.[0]))).toEqual({
      error: "boom",
      code: "local",
      hint: "try again",
    });
  });

  it("redactSecrets covers passport tokens", () => {
    expect(redactSecrets("tok=bhf_pass_abcdefghijklmnopqrstuvwxyz")).toContain(
      "bhf_pass_[redacted]"
    );
  });
});
