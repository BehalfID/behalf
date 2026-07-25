import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../packages/cli/src/lib/config.js", () => ({
  readSession: vi.fn(),
}));

describe("requireSession", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the session cookie when logged in", async () => {
    const config = await import("../packages/cli/src/lib/config.js");
    vi.mocked(config.readSession).mockReturnValue("session=abc");
    const { requireSession } = await import("../packages/cli/src/lib/auth.js");
    expect(requireSession()).toBe("session=abc");
  });

  it("throws when not logged in", async () => {
    const config = await import("../packages/cli/src/lib/config.js");
    vi.mocked(config.readSession).mockReturnValue(null);
    const { requireSession } = await import("../packages/cli/src/lib/auth.js");
    expect(() => requireSession()).toThrow(/behalf login/);
  });
});
