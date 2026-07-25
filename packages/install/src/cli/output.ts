export interface CliOutput {
  readonly json: boolean;
  /** Write structured JSON to stdout. */
  writeJson(data: unknown): void;
  /** Write a human-readable line to stdout (ignored in JSON mode). */
  writeLine(message: string): void;
  /** Write a human-readable error line to stderr. */
  writeError(message: string): void;
}

export function createCliOutput(json: boolean): CliOutput {
  return {
    json,
    writeJson(data: unknown) {
      console.log(JSON.stringify(data, null, 2));
    },
    writeLine(message: string) {
      if (!json) {
        console.log(message);
      }
    },
    writeError(message: string) {
      if (json) {
        console.error(JSON.stringify({ error: message }));
      } else {
        console.error(`Error: ${message}`);
      }
    },
  };
}

/** Set process exit code from an operation result. */
export function setExitCode(success: boolean): void {
  process.exitCode = success ? 0 : 1;
}
