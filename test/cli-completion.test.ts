import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { completionCommand } from "../packages/cli/src/commands/completion";
import {
  collectCompletionWords,
  isShellKind,
  renderCompletionScript,
} from "../packages/cli/src/lib/completion";

describe("CLI shell completion", () => {
  it("recognizes supported shells", () => {
    expect(isShellKind("bash")).toBe(true);
    expect(isShellKind("zsh")).toBe(true);
    expect(isShellKind("powershell")).toBe(true);
    expect(isShellKind("fish")).toBe(false);
  });

  it("collects top-level and nested command words", () => {
    const root = new Command("behalf");
    const agents = new Command("agents");
    agents.command("list");
    agents.command("create");
    root.addCommand(agents);
    root.addCommand(new Command("doctor"));
    root.addCommand(new Command("secret"), { hidden: true });

    const words = collectCompletionWords(root);
    expect(words).toContain("agents");
    expect(words).toContain("agents list");
    expect(words).toContain("agents create");
    expect(words).toContain("doctor");
    expect(words.join("\n")).not.toContain("secret");
  });

  it("renders bash/zsh/powershell scripts", () => {
    for (const shell of ["bash", "zsh", "powershell"] as const) {
      const script = renderCompletionScript(shell);
      expect(script).toContain("completion --words");
      expect(script.length).toBeGreaterThan(40);
    }
  });

  it("completion command is wireable onto a program", () => {
    const root = new Command("behalf");
    root.addCommand(new Command("doctor"));
    root.addCommand(completionCommand(root));
    expect(root.commands.some((c) => c.name() === "completion")).toBe(true);
  });
});
