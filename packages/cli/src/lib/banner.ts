/** Full-width ASCII banner for interactive terminal sessions. */
export const BEHALF_CLI_BANNER = String.raw`
  ____  _                 _ _     _ ___ 
 | __ )| |__   ___  _ __ | | |   | |_ _|
 |  _ \| '_ \ / _ \| '_ \| | | |   | || | 
 | |_) | | | | (_) | | | | | |___| || | 
 |____/|_| |_|\___/|_| |_|_|_____|_|___|
`.trimEnd();

export const BEHALF_CLI_BANNER_TAGLINE = "Agent permission gates";

/** Shown when the terminal is too narrow for the full banner. */
export const BEHALF_CLI_BANNER_COMPACT = "BehalfID - agent permission gates"; // pragma: allowlist secret // pragma: allowlist secret

const COPPER = "\x1b[38;2;216;138;99m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const BANNER_COMMANDS = new Set(["init", "doctor", "login", "whoami"]);
const SCRIPTED_COMMANDS = new Set([
  "verify",
  "hook",
  "health",
  "logs",
  "run",
  "claude",
  "codex",
  "cursor",
  "agents",
  "permissions",
  "webhooks",
  "passport",
  "scan",
  "config",
  "mcp",
  "logout",
  "internal-refresh-permissions"
]);

const GLOBAL_FLAGS = new Set(["--json", "--no-banner", "-h", "--help", "-V", "--version"]);

export function isBannerDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BEHALF_NO_BANNER?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function resolveCliCommand(argv: string[]): string | null {
  const positional = argv.filter((arg) => !arg.startsWith("-") && !GLOBAL_FLAGS.has(arg));
  if (positional.length > 0) return positional[0];
  if (argv.includes("--help") || argv.includes("-h")) return "__help__";
  if (argv.length === 0) return "__help__";
  return null;
}

export function shouldShowCliBanner(input: {
  argv: string[];
  jsonMode?: boolean;
  noBannerFlag?: boolean;
  stdoutIsTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (input.jsonMode) return false;
  if (input.noBannerFlag) return false;
  if (input.stdoutIsTTY === false) return false;
  if (isBannerDisabledByEnv(input.env)) return false;

  const command = resolveCliCommand(input.argv);
  if (!command) return false;
  // Root help / bare `behalf` still get the brand banner in interactive TTYs.
  if (command === "__help__") return true;
  if (SCRIPTED_COMMANDS.has(command)) return false;
  return BANNER_COMMANDS.has(command);
}

export function formatCliBanner(options?: {
  columns?: number;
  useColor?: boolean;
}): string {
  const columns = options?.columns ?? 80;
  const useColor = options?.useColor ?? false;
  const bannerLines = BEHALF_CLI_BANNER.trim().split("\n");
  const lines =
    columns < bannerLines[0].length + 4
      ? [BEHALF_CLI_BANNER_COMPACT]
      : [...bannerLines, BEHALF_CLI_BANNER_TAGLINE];

  if (!useColor) return lines.join("\n");

  return lines
    .map((line, index) => {
      if (index === lines.length - 1) return `${DIM}${line}${RESET}`;
      return `${COPPER}${line}${RESET}`;
    })
    .join("\n");
}

export function printCliBanner(options?: { columns?: number; useColor?: boolean }) {
  const text = formatCliBanner({
    columns: options?.columns ?? process.stdout.columns,
    useColor: options?.useColor ?? process.stdout.isTTY
  });
  console.log(`\n${text}\n`);
}

export function maybePrintCliBanner(input: {
  argv: string[];
  jsonMode?: boolean;
  noBannerFlag?: boolean;
  stdoutIsTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}) {
  if (!shouldShowCliBanner(input)) return;
  printCliBanner({
    columns: input.stdoutIsTTY === false ? 80 : process.stdout.columns,
    useColor: input.stdoutIsTTY !== false
  });
}
