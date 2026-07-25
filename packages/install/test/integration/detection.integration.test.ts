import { afterEach, describe, expect, it } from "vitest";
import { HostPlatformDetector } from "../../src/detection/HostPlatformDetector.js";
import {
  cleanupAllIntegrationFixtures,
  createIntegrationFixture,
  mockFetchOk,
} from "./helpers.js";

afterEach(async () => {
  await cleanupAllIntegrationFixtures();
});

describe("integration: detection and verification", () => {
  it("detects all supported clients from real filesystem layout", async () => {
    const fixture = await createIntegrationFixture({
      packageManagers: ["npm", "pnpm", "yarn"],
    });

    const env = await fixture.detector.detectEnvironment();
    expect(env.clients.filter((c) => c.installed).map((c) => c.id).sort()).toEqual([
      "claude-code",
      "claude-desktop",
      "codex",
      "cursor",
      "vscode",
      "windsurf",
    ]);
    expect(env.packageManagers.sort()).toEqual(["npm", "pnpm", "yarn"]);

    await fixture.cleanup();
  });

  it("prefers pnpm when only pnpm is available", async () => {
    const fixture = await createIntegrationFixture({
      packageManagers: ["pnpm"],
    });

    const env = await fixture.detector.detectEnvironment();
    expect(env.packageManagers).toEqual(["pnpm"]);

    await fixture.cleanup();
  });

  it("returns healthy doctor report after successful install with verify endpoint", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    await fixture.installer.install({ verifyEndpoint: "https://example.test/api/verify" });
    const report = await fixture.installer.doctor({
      verifyEndpoint: "https://example.test/api/verify",
    });

    expect(report.healthy).toBe(true);
    expect(report.checks.every((c) => c.status === "pass")).toBe(true);

    await fixture.cleanup();
  });

  it("detects no clients when config directories are absent", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const root = await mkdtemp(join(tmpdir(), "behalf-empty-"));
    const homeDir = join(root, "home");
    const cwd = join(root, "project");

    const detector = new HostPlatformDetector({
      homeDir,
      cwd,
      platform: "linux",
      env: {},
      commandExists: async () => false,
    });

    const env = await detector.detectEnvironment();
    expect(env.clients.filter((c) => c.installed)).toEqual([]);

    await rm(root, { recursive: true, force: true });
  });
});
