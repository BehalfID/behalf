import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-prot-resolve-"));
}

async function loadProtection(home: string) {
  vi.resetModules();
  stubCliHome(home);
  return import("../packages/cli/src/lib/protection/index.js");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("resolveActivation precedence", () => {
  it("required managed profile wins over user disabled and --no-behalf", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      upsertRepositoryDecision,
      canonicalizePath,
    } = await loadProtection(home);

    const root = canonicalizePath(join(home, "repo"));
    mkdirSync(root, { recursive: true });
    upsertRepositoryDecision(root, false, "user");

    const byPolicy = resolveActivation({
      cwd: root,
      managedPolicyMode: "required",
      flag: "disable",
      interactive: false,
    });
    expect(byPolicy.enabled).toBe(true);
    expect(byPolicy.mode).toBe("managed-profile");
    expect(byPolicy.source).toBe("organization");
    expect(byPolicy.shouldPrompt).toBe(false);
  });

  it("managed profile wins over not-now / disabled store", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      applyPromptChoice,
      upsertRepositoryDecision,
      canonicalizePath,
    } = await loadProtection(home);

    const root = canonicalizePath(join(home, "repo"));
    mkdirSync(root, { recursive: true });
    applyPromptChoice({ mode: "disabled" }, { cwd: root });
    upsertRepositoryDecision(root, false, "user");

    const result = resolveActivation({
      cwd: root,
      managedPolicyMode: "managed",
      interactive: true,
    });
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe("managed-profile");
    expect(result.source).toBe("managed-profile");
    expect(result.shouldPrompt).toBe(false);
  });

  it("nested repository decision overrides parent repository", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      upsertRepositoryDecision,
      canonicalizePath,
    } = await loadProtection(home);

    const parent = canonicalizePath(join(home, "monorepo"));
    const nested = canonicalizePath(join(parent, "apps", "web"));
    mkdirSync(join(nested, "src"), { recursive: true });

    upsertRepositoryDecision(parent, true, "user");
    upsertRepositoryDecision(nested, false, "user");

    const result = resolveActivation({
      cwd: join(nested, "src"),
      interactive: false,
    });
    expect(result.enabled).toBe(false);
    expect(result.mode).toBe("disabled");
    expect(result.repositoryRoot).toBe(nested);
  });

  it("repository decision takes precedence over active timed", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      upsertRepositoryDecision,
      addTimedDecision,
      canonicalizePath,
    } = await loadProtection(home);

    const root = canonicalizePath(join(home, "repo"));
    mkdirSync(root, { recursive: true });
    const now = new Date("2026-07-01T12:00:00.000Z");
    addTimedDecision(new Date(now.getTime() + 3_600_000).toISOString());
    upsertRepositoryDecision(root, false, "user");

    const result = resolveActivation({ cwd: root, interactive: false, now });
    expect(result.enabled).toBe(false);
    expect(result.mode).toBe("disabled");
    expect(result.repositoryRoot).toBe(root);
  });

  it("ignores expired timed decisions via injected now", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      writeActivationStore,
      emptyActivationStore,
    } = await loadProtection(home);

    const now = new Date("2026-07-01T12:00:00.000Z");
    const store = emptyActivationStore();
    store.timed = [
      {
        id: "acttime_old",
        mode: "timed",
        enabled: true,
        createdAt: "2026-07-01T08:00:00.000Z",
        expiresAt: "2026-07-01T11:00:00.000Z",
        source: "user",
      },
    ];
    writeActivationStore(store, now);

    const result = resolveActivation({
      cwd: home,
      interactive: false,
      now,
    });
    // Expired timed ignored → noninteractive default-on
    expect(result.mode).not.toBe("timed");
    expect(result.shouldPrompt).toBe(false);
    expect(result.enabled).toBe(true);
    expect(result.source).toBe("default");
  });

  it("session activates only with BEHALFID_SESSION_ID and BEHALFID_ENABLED", async () => {
    const home = tempHome();
    const {
      resolveActivation,
      ENV_SESSION_ID,
      ENV_ENABLED,
      ENV_MODE,
    } = await loadProtection(home);

    const both = resolveActivation({
      cwd: home,
      interactive: false,
      env: {
        [ENV_SESSION_ID]: "actsess_test123",
        [ENV_ENABLED]: "1",
        [ENV_MODE]: "session",
      },
    });
    expect(both.enabled).toBe(true);
    expect(both.mode).toBe("session");
    expect(both.source).toBe("env");
    expect(both.sessionId).toBe("actsess_test123");

    // Session id alone (no ENABLED) is not an active session decision.
    const idOnly = resolveActivation({
      cwd: home,
      interactive: true,
      env: { [ENV_SESSION_ID]: "actsess_orphan" },
    });
    expect(idOnly.source).not.toBe("env");
    expect(idOnly.shouldPrompt).toBe(true);

    // Bare BEHALFID_ENABLED=0 must not bypass always-on (no session id).
    const { enableAlways } = await loadProtection(home);
    enableAlways();
    const spoofDisable = resolveActivation({
      cwd: home,
      interactive: false,
      env: { [ENV_ENABLED]: "0" },
    });
    expect(spoofDisable.enabled).toBe(true);
    expect(spoofDisable.mode).toBe("always");
    expect(spoofDisable.source).not.toBe("env");

    // Bare BEHALFID_ENABLED=1 alone is also insufficient without session id.
    const spoofEnable = resolveActivation({
      cwd: home,
      interactive: true,
      env: { [ENV_ENABLED]: "1" },
    });
    expect(spoofEnable.source).not.toBe("env");
    expect(spoofEnable.mode).toBe("always");
  });

  it("always-on applies when no more specific decision exists", async () => {
    const home = tempHome();
    const { resolveActivation, enableAlways } = await loadProtection(home);

    enableAlways();
    const result = resolveActivation({ cwd: home, interactive: true });
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe("always");
    expect(result.shouldPrompt).toBe(false);
  });

  it("interactive unresolved sets shouldPrompt true", async () => {
    const home = tempHome();
    const { resolveActivation } = await loadProtection(home);

    const result = resolveActivation({ cwd: home, interactive: true });
    expect(result.shouldPrompt).toBe(true);
    expect(result.enabled).toBe(false);
  });

  it("noninteractive unresolved does not hang and shouldPrompt is false", async () => {
    const home = tempHome();
    const { resolveActivation } = await loadProtection(home);

    const result = resolveActivation({ cwd: home, interactive: false });
    expect(result.shouldPrompt).toBe(false);
    // Default-on for agent launches (must not block CI).
    expect(result.enabled).toBe(true);
    expect(result.source).toBe("default");
  });
});
