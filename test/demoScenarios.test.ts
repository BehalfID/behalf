import { describe, expect, it } from "vitest";
import { runDemoScenario } from "@/lib/demoScenarios";

describe("runDemoScenario", () => {
  it("allowed-read returns allowed", () => {
    const result = runDemoScenario("allowed-read");
    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
    expect(result.requestId).toMatch(/^req_/);
    expect(result.timestamp).toBeTruthy();
  });

  it("over-limit-purchase returns denied", () => {
    const result = runDemoScenario("over-limit-purchase");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.reason).toMatch(/maxAmount/i);
    expect(result.risk).toBe("high");
  });

  it("blocked-action returns denied", () => {
    const result = runDemoScenario("blocked-action");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.reason).toMatch(/blocked/i);
  });

  it("missing-permission returns denied with no active permission", () => {
    const result = runDemoScenario("missing-permission");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no active permission/i);
  });

  it("approval-purchase returns approval required", () => {
    const result = runDemoScenario("approval-purchase");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(true);
    expect(result.risk).toBe("medium");
  });

  it("missing-resource returns denied due to resource mismatch", () => {
    const result = runDemoScenario("missing-resource");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.reason).toMatch(/resource/i);
  });

  it("manual-guidance returns denied (no permissions)", () => {
    const result = runDemoScenario("manual-guidance");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no active permission/i);
  });

  it("each call returns a unique requestId", () => {
    const a = runDemoScenario("allowed-read");
    const b = runDemoScenario("allowed-read");
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("scenarioId is included in the result", () => {
    const result = runDemoScenario("over-limit-purchase");
    expect(result.scenarioId).toBe("over-limit-purchase");
  });
});
