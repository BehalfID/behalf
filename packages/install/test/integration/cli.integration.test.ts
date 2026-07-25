import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliProgram } from "../../src/cli.js";
import { createDefaultInstaller } from "../../src/cli/createInstaller.js";
import {
  cleanupAllIntegrationFixtures,
  createIntegrationFixture,
  mockFetchOk,
} from "./helpers.js";

afterEach(async () => {
  await cleanupAllIntegrationFixtures();
  process.exitCode = 0;
});

function captureConsole() {
  const stdout: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    stdout.push(String(msg));
  });
  return {
    stdout,
    restore() {
      logSpy.mockRestore();
    },
  };
}

describe("integration: CLI", () => {
  it("runs install --json through the CLI handler", async () => {
    const fixture = await createIntegrationFixture({
      runtimeVersion: "1.0.0",
      fetchImpl: mockFetchOk,
    });

    const program = createCliProgram({
      context: { installer: fixture.installer },
    });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync(["node", "behalf-install", "--json"]);
    } finally {
      captured.restore();
    }

    expect(captured.stdout.join("\n")).toContain('"success": true');
    await fixture.cleanup();
  });

  it("returns exit code 1 for unhealthy doctor --json", async () => {
    const fixture = await createIntegrationFixture();
    const program = createCliProgram({
      context: { installer: fixture.installer },
    });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync(["node", "behalf-install", "doctor", "--json"]);
    } finally {
      captured.restore();
    }

    expect(process.exitCode).toBe(1);
    expect(captured.stdout.join("\n")).toContain('"healthy": false');
    await fixture.cleanup();
  });

  it("createDefaultInstaller wires real collaborators", () => {
    const installer = createDefaultInstaller();
    expect(installer).toBeDefined();
    expect(typeof installer.install).toBe("function");
    expect(typeof installer.doctor).toBe("function");
  });
});
