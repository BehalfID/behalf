import { describe, expect, it } from "vitest";
import { createCliProgram } from "../src/cli.js";

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
    const program = createCliProgram({ version: "0.1.0-test" });
    program.exitOverride();

    await program.parseAsync(["node", "behalf-install", "--json", "status"]);
    expect(program.opts().json).toBe(true);
  });
});
