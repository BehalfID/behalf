import { describe, expect, it, vi } from "vitest";
import { createCliProgram } from "../src/cli.js";
import type { Installer } from "../src/interfaces/Installer.js";

describe("createCliProgram", () => {
  it("exposes version and the public command surface", () => {
    const program = createCliProgram({ version: "0.1.0-test" });

    expect(program.name()).toBe("behalf-install");
    expect(program.version()).toBe("0.1.0-test");

    const commandNames = program.commands.map((command) => command.name()).sort();
    expect(commandNames).toEqual(["doctor", "install", "status", "uninstall", "upgrade"]);
  });

  it("prints help that mentions the public commands", async () => {
    const program = createCliProgram({ version: "0.1.0-test" });
    program.exitOverride();

    let helpText = "";
    program.configureOutput({
      writeOut: (string) => {
        helpText += string;
      },
      writeErr: (string) => {
        helpText += string;
      },
    });

    try {
      await program.parseAsync(["node", "behalf-install", "--help"]);
    } catch (error) {
      // Commander throws on exitOverride for help.
      expect(error).toMatchObject({ code: "commander.helpDisplayed" });
    }

    expect(helpText).toContain("install");
    expect(helpText).toContain("doctor");
    expect(helpText).toContain("upgrade");
    expect(helpText).toContain("uninstall");
    expect(helpText).toContain("status");
    expect(helpText).toContain("--json");
  });

  it("parses global --json without error", async () => {
    const installer = createMockInstaller();
    const program = createCliProgram({
      version: "0.1.0-test",
      context: { installer },
    });
    program.exitOverride();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await program.parseAsync(["node", "behalf-install", "--json", "status"]);
      expect(program.opts().json).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});

function createMockInstaller(): Installer {
  return {
    install: vi.fn(),
    upgrade: vi.fn(),
    uninstall: vi.fn(),
    doctor: vi.fn(),
    status: vi.fn(async () => ({
      installed: false,
      installedVersion: null,
      installerVersion: "0.1.0-test",
      installedAt: null,
      updatedAt: null,
      configuredClients: [],
      registeredRuntimes: [],
    })),
  };
}
