/** Supported AI coding clients that the installer can detect and configure. */
export type AiClientId =
  | "cursor"
  | "claude-code"
  | "claude-desktop"
  | "codex"
  | "vscode"
  | "windsurf";

/** Package managers the installer can detect and use. */
export type PackageManagerId = "npm" | "pnpm" | "yarn" | "bun";

/** Operating systems supported by the installer. */
export type OperatingSystemId = "darwin" | "linux" | "win32";

/** Outcome of an individual diagnostic check. */
export type CheckStatus = "pass" | "fail" | "warn" | "skip";

/** CLI output format. */
export type OutputFormat = "human" | "json";
