import { describe, expect, it } from "vitest";
import {
  BEHALF_CLI_BANNER_COMPACT,
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
    const narrow = formatCliBanner({ columns: 32, useColor: false });
    expect(narrow).toBe(BEHALF_CLI_BANNER_COMPACT);
  });
});
