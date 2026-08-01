/**
 * Parse a BehalfID browser-terminal command line.
 * Rejects OS shells and unsupported binaries; only `behalf` commands are accepted.
 */

export type ParsedBehalfCommand =
  | { kind: "empty" }
  | { kind: "rejected"; message: string }
  | { kind: "help" }
  | { kind: "doctor" }
  | { kind: "whoami" }
  | { kind: "agents_list" }
  | { kind: "agents_show"; agentId: string }
  | { kind: "permissions_list"; agentId: string }
  | {
      kind: "verify";
      agentId: string;
      action: string;
      vendor?: string;
      amount?: number;
      shadow?: boolean;
    }
  | { kind: "logs"; agentId?: string; limit?: number }
  | { kind: "config_get"; key?: string }
  | { kind: "config_set"; key: string; value: string }
  | { kind: "clear" };

const REJECTED_BINARIES = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "powershell",
  "pwsh",
  "cmd",
  "cmd.exe",
  "node",
  "nodejs",
  "python",
  "python3",
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "ssh",
  "sudo",
  "su",
  "chmod",
  "chown",
  "rm",
  "mv",
  "cp",
  "cat",
  "ls",
  "dir",
  "find",
  "grep",
  "awk",
  "sed",
  "perl",
  "ruby",
  "php",
  "docker",
  "kubectl",
  "git"
]);

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const raw = match[0];
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      tokens.push(raw.slice(1, -1).replace(/\\(["'\\])/g, "$1"));
    } else {
      tokens.push(raw);
    }
  }
  return tokens;
}

function flagValue(args: string[], names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    for (const name of names) {
      if (arg === name) return args[i + 1];
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function hasFlag(args: string[], names: string[]): boolean {
  return args.some((arg) => names.includes(arg));
}

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("-")) {
      // Skip value for known option forms: --foo bar / -a bar
      if (!arg.includes("=") && args[i + 1] && !args[i + 1]!.startsWith("-")) {
        i += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

export function parseBehalfCommand(rawInput: string): ParsedBehalfCommand {
  const trimmed = rawInput.trim();
  if (!trimmed) return { kind: "empty" };

  // Block obvious shell chaining / substitution before tokenization.
  if (/[;&|`$<>]|\$\(|\$\{/.test(trimmed)) {
    return {
      kind: "rejected",
      message:
        "Shell operators are not supported. Enter a single BehalfID command (for example: behalf agents list)."
    };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return { kind: "empty" };

  const binary = tokens[0]!.toLowerCase();
  if (REJECTED_BINARIES.has(binary) || binary.includes("/") || binary.includes("\\")) {
    return {
      kind: "rejected",
      message: `Unsupported command "${tokens[0]}". This terminal only runs BehalfID CLI commands (prefix with "behalf").`
    };
  }

  if (binary !== "behalf") {
    return {
      kind: "rejected",
      message: `Unknown command "${tokens[0]}". Try "behalf --help".`
    };
  }

  const args = tokens.slice(1).filter((t) => t !== "--json" && t !== "--no-banner");
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return { kind: "help" };
  }

  const command = args[0]!;
  const rest = args.slice(1);

  switch (command) {
    case "doctor":
      return { kind: "doctor" };
    case "whoami":
      return { kind: "whoami" };
    case "clear":
      return { kind: "clear" };
    case "agents": {
      const sub = rest[0];
      if (!sub || sub === "list" || sub === "ls") return { kind: "agents_list" };
      if (sub === "show" || sub === "get") {
        const agentId = rest[1] ?? positional(rest.slice(1))[0];
        if (!agentId) {
          return { kind: "rejected", message: "Usage: behalf agents show <agentId>" };
        }
        return { kind: "agents_show", agentId };
      }
      return {
        kind: "rejected",
        message: `Unsupported agents subcommand "${sub}". Supported: list, show.`
      };
    }
    case "permissions": {
      const sub = rest[0];
      if (sub === "list" || sub === "ls") {
        const agentId = rest[1] ?? positional(rest.slice(1))[0];
        if (!agentId) {
          return { kind: "rejected", message: "Usage: behalf permissions list <agentId>" };
        }
        return { kind: "permissions_list", agentId };
      }
      return {
        kind: "rejected",
        message: `Unsupported permissions subcommand "${sub ?? ""}". Supported: list.`
      };
    }
    case "verify": {
      const agentId = positional(rest)[0];
      const action = flagValue(rest, ["--action", "-a"]);
      const vendor = flagValue(rest, ["--vendor", "-v", "--resource", "-r"]);
      const amountRaw = flagValue(rest, ["--amount"]);
      const shadow = hasFlag(rest, ["--shadow"]);
      if (!agentId || !action) {
        return {
          kind: "rejected",
          message:
            "Usage: behalf verify <agentId> --action <action> [--vendor <vendor>] [--amount <n>] [--shadow]"
        };
      }
      let amount: number | undefined;
      if (amountRaw !== undefined) {
        amount = Number(amountRaw);
        if (!Number.isFinite(amount)) {
          return { kind: "rejected", message: "--amount must be a number." };
        }
      }
      return { kind: "verify", agentId, action, vendor, amount, shadow };
    }
    case "logs": {
      const agentId = flagValue(rest, ["--agent-id", "--agent"]) ?? positional(rest)[0];
      const limitRaw = flagValue(rest, ["--limit", "-n"]);
      let limit: number | undefined;
      if (limitRaw !== undefined) {
        limit = Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          return { kind: "rejected", message: "--limit must be an integer from 1 to 100." };
        }
      }
      return { kind: "logs", agentId, limit };
    }
    case "config": {
      const sub = rest[0];
      if (sub === "get") {
        return { kind: "config_get", key: rest[1] };
      }
      if (sub === "set") {
        const key = rest[1];
        const value = rest.slice(2).join(" ");
        if (!key || !value) {
          return { kind: "rejected", message: "Usage: behalf config set <key> <value>" };
        }
        return { kind: "config_set", key, value };
      }
      return {
        kind: "rejected",
        message: `Unsupported config subcommand "${sub ?? ""}". Supported: get, set.`
      };
    }
    default:
      return {
        kind: "rejected",
        message: `Unsupported command "behalf ${command}". Run "behalf --help" for browser-terminal commands.`
      };
  }
}
