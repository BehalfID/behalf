import { Command } from "commander";
import {
  collectCompletionWords,
  isShellKind,
  renderCompletionScript,
  type ShellKind,
} from "../lib/completion.js";

/**
 * Shell completion helpers. Commander has no built-in completion API (v13),
 * so we introspect the registered command tree and emit small scripts.
 */
export function completionCommand(root: Command) {
  const cmd = new Command("completion")
    .description("print shell completion script (bash | zsh | powershell)")
    .argument("[shell]", "bash | zsh | powershell")
    .option("--words", "print completion words (used by generated scripts)", false)
    .action((shell: string | undefined, opts: { words?: boolean }) => {
      if (opts.words) {
        for (const word of collectCompletionWords(root)) {
          console.log(word);
        }
        return;
      }

      if (!shell || !isShellKind(shell)) {
        throw new Error("Usage: behalf completion <bash|zsh|powershell>");
      }

      process.stdout.write(renderCompletionScript(shell as ShellKind));
    });

  return cmd;
}
