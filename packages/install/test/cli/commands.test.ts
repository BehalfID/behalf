import { describe, expect, it, vi } from "vitest";
import { createCliProgram } from "../../src/cli.js";
import type { Installer } from "../../src/interfaces/Installer.js";
import type {
  DoctorReport,
  InstallResult,
  StatusResult,
  UninstallResult,
  UpgradeResult,
} from "../../src/types/index.js";

function createMockInstaller(overrides: Partial<Installer> = {}): Installer {
  return {
    install: vi.fn(async (): Promise<InstallResult> => ({
      success: true,
      alreadyInstalled: false,
      version: "1.0.0",
      configuredClients: ["cursor"],
      registeredRuntimes: ["mcp-runtime"],
      warnings: [],
      errors: [],
    })),
    upgrade: vi.fn(async (): Promise<UpgradeResult> => ({
      success: true,
      previousVersion: "1.0.0",
      currentVersion: "2.0.0",
      migrated: true,
      configuredClients: ["cursor"],
      warnings: [],
      errors: [],
    })),
    uninstall: vi.fn(async (): Promise<UninstallResult> => ({
      success: true,
      removedClients: ["cursor"],
      removedRuntimes: ["mcp-runtime"],
      stateCleared: true,
      warnings: [],
      errors: [],
    })),
    doctor: vi.fn(async (): Promise<DoctorReport> => ({
      healthy: true,
      installerVersion: "0.1.0",
      installedVersion: "1.0.0",
      checkedAt: "2026-01-01T00:00:00.000Z",
      checks: [],
      runtimeInstalled: true,
      mcpRegistration: [],
      verifyEndpoint: {
        id: "verify-endpoint",
        name: "Verify endpoint",
        status: "pass",
        message: "ok",
      },
      packageVersions: {},
      configurationIntegrity: [],
    })),
    status: vi.fn(async (): Promise<StatusResult> => ({
      installed: true,
      installedVersion: "1.0.0",
      installerVersion: "0.1.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      configuredClients: [],
      registeredRuntimes: [],
    })),
    ...overrides,
  };
}

function captureConsole() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    stdout.push(String(msg));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
    stderr.push(String(msg));
  });
  return {
    stdout,
    stderr,
    restore() {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

describe("CLI command handlers", () => {
  it("runs install as the default command and emits JSON", async () => {
    const installer = createMockInstaller();
    const program = createCliProgram({
      version: "0.1.0-test",
      context: { installer },
    });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync(["node", "behalf-install", "--json"]);
    } finally {
      captured.restore();
    }

    expect(installer.install).toHaveBeenCalledOnce();
    expect(captured.stdout.join("\n")).toContain('"success": true');
  });

  it("runs status in human-readable mode", async () => {
    const installer = createMockInstaller();
    const program = createCliProgram({ context: { installer } });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync(["node", "behalf-install", "status"]);
    } finally {
      captured.restore();
    }

    expect(installer.status).toHaveBeenCalledOnce();
    expect(captured.stdout.join("\n")).toContain("Installed: yes");
  });

  it("runs doctor and sets unhealthy exit when report fails", async () => {
    const installer = createMockInstaller({
      doctor: vi.fn(async () => ({
        healthy: false,
        installerVersion: "0.1.0",
        installedVersion: null,
        checkedAt: "2026-01-01T00:00:00.000Z",
        checks: [
          {
            id: "runtime",
            name: "Runtime",
            status: "fail" as const,
            message: "missing",
          },
        ],
        runtimeInstalled: false,
        mcpRegistration: [],
        verifyEndpoint: {
          id: "verify-endpoint",
          name: "Verify endpoint",
          status: "skip" as const,
          message: "skipped",
        },
        packageVersions: {},
        configurationIntegrity: [],
      })),
    });
    const program = createCliProgram({ context: { installer } });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync(["node", "behalf-install", "doctor"]);
    } finally {
      captured.restore();
    }

    expect(process.exitCode).toBe(1);
    expect(captured.stdout.join("\n")).toContain("has issues");
    process.exitCode = 0;
  });

  it("passes parsed install flags to the installer", async () => {
    const installer = createMockInstaller();
    const program = createCliProgram({ context: { installer } });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync([
        "node",
        "behalf-install",
        "install",
        "--dry-run",
        "--force",
        "--clients",
        "cursor,vscode",
        "--verify-endpoint",
        "https://example.test/api/verify",
        "--json",
      ]);
    } finally {
      captured.restore();
    }

    expect(installer.install).toHaveBeenCalledWith({
      json: true,
      dryRun: true,
      force: true,
      clients: ["cursor", "vscode"],
      verifyEndpoint: "https://example.test/api/verify",
    });
  });

  it("passes keep-state to uninstall as clearState false", async () => {
    const installer = createMockInstaller();
    const program = createCliProgram({ context: { installer } });
    program.exitOverride();
    const captured = captureConsole();

    try {
      await program.parseAsync([
        "node",
        "behalf-install",
        "uninstall",
        "--keep-state",
        "--json",
      ]);
    } finally {
      captured.restore();
    }

    expect(installer.uninstall).toHaveBeenCalledWith({
      json: true,
      clearState: false,
    });
  });
});
