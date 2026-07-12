import { describe, expect, it } from "vitest";
import { runDemoScenario, type DemoScenarioId } from "@/lib/demoScenarios";

describe("runDemoScenario", () => {
  it("github-read-allowed returns allowed", () => {
    const result = runDemoScenario("github-read-allowed");
    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
    expect(result.requestId).toMatch(/^req_/);
    expect(result.timestamp).toBeTruthy();
  });

  it("migration-denied returns denied", () => {
    const result = runDemoScenario("migration-denied");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.reason).toMatch(/no active permission/i);
    expect(result.risk).toBe("high");
  });

  it("push-main-denied returns denied for blocked action", () => {
    const result = runDemoScenario("push-main-denied");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.reason).toMatch(/blocked/i);
  });

  it("secret-write-denied returns denied", () => {
    const result = runDemoScenario("secret-write-denied");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blocked|permission/i);
  });

  it("deploy-approval returns approval required", () => {
    const result = runDemoScenario("deploy-approval");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(true);
    expect(result.risk).toBe("medium");
  });

  it("dependency-approval returns approval required", () => {
    const result = runDemoScenario("dependency-approval");
    expect(result.allowed).toBe(false);
    expect(result.approvalRequired).toBe(true);
  });

  it("each call returns a unique requestId", () => {
    const a = runDemoScenario("github-read-allowed");
    const b = runDemoScenario("github-read-allowed");
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("scenarioId is included in the result", () => {
    const id: DemoScenarioId = "deploy-approval";
    const result = runDemoScenario(id);
    expect(result.scenarioId).toBe(id);
  });
});
