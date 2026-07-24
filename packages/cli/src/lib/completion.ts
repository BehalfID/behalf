import { Help, type Command } from "commander";

export type ShellKind = "bash" | "zsh" | "powershell";

export function isShellKind(value: string): value is ShellKind {
  return value === "bash" || value === "zsh" || value === "powershell";
}

const help = new Help();

/** Visible (non-hidden) command names under a Commander node, sorted. */
export function listVisibleCommandNames(cmd: Command): string[] {
  return help
    .visibleCommands(cmd)
    .map((c) => c.name())
    .filter((name) => Boolean(name) && name !== "help")
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Collect top-level and one-level nested completions as "cmd" / "cmd sub".
 * Enough for interactive tab-complete without a heavy completion framework.
 */
export function collectCompletionWords(root: Command): string[] {
  const words = new Set<string>();
  for (const top of help.visibleCommands(root)) {
    const name = top.name();
    if (!name || name === "help") continue;
    words.add(name);
    for (const sub of listVisibleCommandNames(top)) {
      words.add(`${name} ${sub}`);
    }
  }
  return [...words].sort((a, b) => a.localeCompare(b));
}

export function renderCompletionScript(shell: ShellKind, binName = "behalf"): string {
  switch (shell) {
    case "bash":
      return renderBash(binName);
    case "zsh":
      return renderZsh(binName);
    case "powershell":
      return renderPowerShell(binName);
  }
}

function renderBash(bin: string): string {
  return `# BehalfID CLI bash completion
# Install: eval "$(${bin} completion bash)"
_${bin}_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local tops
  tops="$(${bin} completion --words 2>/dev/null | awk 'NF==1 {print}' | tr '\\n' ' ')"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${tops}" -- "\${cur}") )
    return
  fi
  local subs
  subs="$(${bin} completion --words 2>/dev/null | awk -v p="\${prev}" '\$1==p && NF==2 {print \$2}' | tr '\\n' ' ')"
  COMPREPLY=( $(compgen -W "\${subs}" -- "\${cur}") )
}
complete -F _${bin}_completion ${bin}
`;
}

function renderZsh(bin: string): string {
  return `# BehalfID CLI zsh completion
# Install: eval "$(${bin} completion zsh)"
_${bin}_completion() {
  local -a tops subs
  local line
  while IFS= read -r line; do
    if [[ "$line" != *" "* ]]; then
      tops+=("$line")
    fi
  done < <(${bin} completion --words 2>/dev/null)
  if (( CURRENT == 2 )); then
    _describe 'behalf commands' tops
    return
  fi
  local prev="\${words[CURRENT-1]}"
  subs=()
  while IFS= read -r line; do
    if [[ "$line" == "$prev "* ]]; then
      subs+=("\${line#$prev }")
    fi
  done < <(${bin} completion --words 2>/dev/null)
  _describe 'behalf subcommands' subs
}
compdef _${bin}_completion ${bin}
`;
}

function renderPowerShell(bin: string): string {
  return `# BehalfID CLI PowerShell completion
# Install: Invoke-Expression (& ${bin} completion powershell | Out-String)
Register-ArgumentCompleter -Native -CommandName ${bin} -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @(& ${bin} completion --words 2>$null)
  $tokens = @($commandAst.CommandElements | ForEach-Object { "$_" })
  if ($tokens.Count -le 1) {
    $words | Where-Object { $_ -notmatch ' ' -and $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }
  $prev = $tokens[$tokens.Count - 1]
  if ($wordToComplete) { $prev = $tokens[$tokens.Count - 2] }
  $prefix = "$prev "
  $words | Where-Object { $_.StartsWith($prefix) } | ForEach-Object {
    $sub = $_.Substring($prefix.Length)
    if ($sub -like "$wordToComplete*") {
      [System.Management.Automation.CompletionResult]::new($sub, $sub, 'ParameterValue', $sub)
    }
  }
}
`;
}
