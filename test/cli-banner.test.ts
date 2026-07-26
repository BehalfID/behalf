import { describe, expect, it } from "vitest";
import {
  BEHALF_CLI_BANNER,
  BEHALF_CLI_BANNER_COMPACT,
  BEHALF_CLI_BANNER_MIN_COLUMNS,
  formatCliBanner,
  isBannerDisabledByEnv,
  resolveCliCommand,
  shouldShowCliBanner
} from "../packages/cli/src/lib/banner";

describe("CLI banner", () => {
  it("shows for human-facing commands only", () => {
    expect(shouldShowCliBanner({ argv: ["doctor"], stdoutIsTTY: true })).toBe(true);
    expect(shouldShowCliBanner({ argv: ["init"], stdoutIsTTY: true })).toBe(true);
    expect(shouldShowCliBanner({ argv: ["login"], stdoutIsTTY: true })).toBe(true);
    expect(shouldShowCliBanner({ argv: ["whoami"], stdoutIsTTY: true })).toBe(true);
  });

  it("hides for scripted or machine-readable commands", () => {
    expect(shouldShowCliBanner({ argv: ["verify", "agent_test"], stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["hook"], stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["scan", "--json"], jsonMode: true, stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["health"], stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["agents", "list"], stdoutIsTTY: true })).toBe(false);
  });

  it("hides when --json, --no-banner, non-tty, or BEHALF_NO_BANNER is set", () => {
    expect(shouldShowCliBanner({ argv: ["doctor"], jsonMode: true, stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["doctor"], noBannerFlag: true, stdoutIsTTY: true })).toBe(false);
    expect(shouldShowCliBanner({ argv: ["doctor"], stdoutIsTTY: false })).toBe(false);
    expect(
      shouldShowCliBanner({
        argv: ["doctor"],
        stdoutIsTTY: true,
        env: { BEHALF_NO_BANNER: "1" }
      })
    ).toBe(false);
    expect(isBannerDisabledByEnv({ BEHALF_NO_BANNER: "true" })).toBe(true);
  });

  it("shows for root help", () => {
    expect(resolveCliCommand([])).toBe("__help__");
    expect(shouldShowCliBanner({ argv: [], stdoutIsTTY: true })).toBe(true);
    expect(shouldShowCliBanner({ argv: ["--help"], stdoutIsTTY: true })).toBe(true);
  });

  it("uses a compact fallback on narrow terminals", () => {
    const narrow = formatCliBanner({
      columns: Math.max(1, BEHALF_CLI_BANNER_MIN_COLUMNS - 1),
      useColor: false
    });
    expect(narrow).toBe(BEHALF_CLI_BANNER_COMPACT);
  });

  it("renders the current B art without a wordmark on art lines", () => {
    const artLines = BEHALF_CLI_BANNER.split("\n");
    const wide = formatCliBanner({ columns: 80, useColor: false });

    expect(wide).toBe([...artLines, "Agent permission gates"].join("\n"));
    expect(artLines.every((line) => !line.includes("BehalfID"))).toBe(true);
    expect(BEHALF_CLI_BANNER_MIN_COLUMNS).toBe(
      Math.max(...artLines.map((line) => line.length)) + 4
    );
  });

  it("colors the B monogram when color is enabled", () => {
    const colored = formatCliBanner({ columns: 80, useColor: true });
    expect(colored).toContain("\x1b[38;2;216;138;99m");
    expect(colored).toContain(BEHALF_CLI_BANNER.split("\n")[0].trim());
  });
});
