import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-sess-spoof-"));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("session env trust model", () => {
  async function load(home: string) {
    vi.resetModules();
    stubCliHome(home);
    return import("../packages/cli/src/lib/protection/index.js");
  }

  it("rejects malformed / empty / too-long session ids", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_SESSION_ID, ENV_ENABLED, enableAlways } =
      await load(home);
    enableAlways();

    for (const bad of ["", "sess_nope", "actsess_", "x".repeat(200), "ACTSESS_upper"]) {
      const res = resolveActivation({
        cwd: home,
        interactive: false,
        env: {
          [ENV_SESSION_ID]: bad,
          [ENV_ENABLED]: "0",
        },
      });
      expect(res.mode).toBe("always");
      expect(res.enabled).toBe(true);
    }
  });

  it("ENABLED=0 with well-formed session id cannot downgrade always-on", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_SESSION_ID, ENV_ENABLED, enableAlways, createActivationSessionId } =
      await load(home);
    enableAlways();
    const res = resolveActivation({
      cwd: home,
      interactive: false,
      env: {
        [ENV_SESSION_ID]: createActivationSessionId(),
        [ENV_ENABLED]: "0",
      },
    });
    expect(res.enabled).toBe(true);
    expect(res.mode).toBe("always");
  });

  it("ENABLED=0 with session id cannot downgrade repository protection", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      ENV_SESSION_ID,
      ENV_ENABLED,
      upsertRepositoryDecision,
      canonicalizePath,
      createActivationSessionId,
    } = await load(home);
    const root = canonicalizePath(join(home, "repo"));
    mkdirSync(root, { recursive: true });
    upsertRepositoryDecision(root, true, "user");
    const res = resolveActivation({
      cwd: root,
      interactive: false,
      env: {
        [ENV_SESSION_ID]: createActivationSessionId(),
        [ENV_ENABLED]: "0",
      },
    });
    expect(res.enabled).toBe(true);
    expect(res.mode).toBe("repository");
  });

  it("ENABLED=1 without session id does not activate as session", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_ENABLED } = await load(home);
    const res = resolveActivation({
      cwd: home,
      interactive: true,
      env: { [ENV_ENABLED]: "1" },
    });
    expect(res.source).not.toBe("env");
    expect(res.shouldPrompt).toBe(true);
  });

  it("ENABLED=1 with well-formed session id activates (correlation, not auth)", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_SESSION_ID, ENV_ENABLED, createActivationSessionId } =
      await load(home);
    const sid = createActivationSessionId();
    const res = resolveActivation({
      cwd: home,
      interactive: true,
      env: { [ENV_SESSION_ID]: sid, [ENV_ENABLED]: "1" },
    });
    expect(res.enabled).toBe(true);
    expect(res.mode).toBe("session");
    expect(res.sessionId).toBe(sid);
  });

  it("random non-actsess session id is ignored even with ENABLED=1", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_SESSION_ID, ENV_ENABLED } = await load(home);
    const res = resolveActivation({
      cwd: home,
      interactive: true,
      env: { [ENV_SESSION_ID]: "random_session_abc123", [ENV_ENABLED]: "1" },
    });
    expect(res.source).not.toBe("env");
    expect(res.shouldPrompt).toBe(true);
  });

  it("required policy still wins over spoofed session disable", async () => {
    const home = tempHome();
    const { resolveActivation, ENV_SESSION_ID, ENV_ENABLED, createActivationSessionId } =
      await load(home);
    const res = resolveActivation({
      cwd: home,
      managedPolicyMode: "required",
      interactive: true,
      env: {
        [ENV_SESSION_ID]: createActivationSessionId(),
        [ENV_ENABLED]: "0",
      },
      flag: "disable",
    });
    expect(res.enabled).toBe(true);
    expect(res.mode).toBe("managed-profile");
  });
});
