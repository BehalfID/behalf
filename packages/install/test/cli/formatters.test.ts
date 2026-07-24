import { describe, expect, it, vi } from "vitest";
import { createCliOutput } from "../../src/cli/output.js";
import { renderInstallResult } from "../../src/cli/formatters.js";

describe("CLI formatters", () => {
  it("prints warning and error codes in human output", () => {
    const lines: string[] = [];
    const output = {
      json: false,
      writeJson() {},
      writeLine(message: string) {
        lines.push(message);
      },
      writeError() {},
    };

    renderInstallResult(
      {
        success: false,
        alreadyInstalled: false,
        version: "0.1.0",
        configuredClients: [],
        registeredRuntimes: [],
        warnings: [
          {
            code: "CLIENT_NOT_DETECTED",
            message: 'Requested client "codex" was not detected on this machine.',
          },
        ],
        errors: [
          {
            code: "DETECTION_FAILED",
            message: "No supported AI clients were found.",
            remediation: "Install a supported AI client.",
          },
        ],
      },
      output,
    );

    expect(lines.some((line) => line.includes("[CLIENT_NOT_DETECTED]"))).toBe(true);
    expect(lines.some((line) => line.includes("[DETECTION_FAILED]"))).toBe(true);
    expect(lines.some((line) => line.includes("→ Install a supported AI client."))).toBe(true);
  });

  it("emits structured JSON when json mode is enabled", () => {
    const writeJson = vi.fn();
    const output = createCliOutput(true);
    output.writeJson = writeJson;

    const result = {
      success: true,
      alreadyInstalled: true,
      version: "0.1.0",
      configuredClients: ["cursor" as const],
      registeredRuntimes: [],
      warnings: [],
      errors: [],
    };
    renderInstallResult(result, output);
    expect(writeJson).toHaveBeenCalledWith(result);
  });
});
