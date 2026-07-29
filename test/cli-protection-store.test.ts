import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-prot-store-"));
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

describe("activation store persistence", () => {
  it("atomically saves protection.json under ~/.behalf", async () => {
    const home = tempHome();
    const {
      enableAlways,
      getProtectionFilePath,
      readActivationStore,
      PROTECTION_FILE_NAME,
    } = await loadProtection(home);

    enableAlways();
    const path = getProtectionFilePath();
    expect(path).toBe(join(home, ".behalf", PROTECTION_FILE_NAME));
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    expect(parsed.alwaysEnabled).toBe(true);
    expect(parsed.version).toBe(1);
    expect(readActivationStore().store.alwaysEnabled).toBe(true);
  });

  it("backs up malformed JSON and recovers with a warning", async () => {
    const home = tempHome();
    const {
      getProtectionDir,
      getProtectionFilePath,
      readActivationStore,
      PROTECTION_FILE_NAME,
    } = await loadProtection(home);

    mkdirSync(getProtectionDir(), { recursive: true });
    writeFileSync(getProtectionFilePath(), "{not-json", { mode: 0o600 });

    const result = readActivationStore();
    expect(result.store.alwaysEnabled).toBe(false);
    expect(result.store.repositories).toEqual([]);
    expect(result.warning).toMatch(/malformed|backed up/i);

    const backups = readdirSync(getProtectionDir()).filter((f) =>
      f.startsWith(`${PROTECTION_FILE_NAME}.corrupt-`)
    );
    expect(backups.length).toBe(1);
    expect(readFileSync(join(getProtectionDir(), backups[0]!), "utf-8")).toBe("{not-json");
  });

  it("replaces duplicate repository roots with the newer entry", async () => {
    const home = tempHome();
    const {
      upsertRepositoryDecision,
      readActivationStore,
      canonicalizePath,
      writeActivationStore,
      emptyActivationStore,
      dedupeRepositories,
    } = await loadProtection(home);

    const root = canonicalizePath(join(home, "repo"));
    mkdirSync(root, { recursive: true });

    // Seed two duplicates directly, then dedupe.
    const store = emptyActivationStore();
    store.repositories = [
      {
        id: "actrepo_old",
        root,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        source: "user",
      },
      {
        id: "actrepo_new",
        root,
        enabled: false,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
        source: "user",
      },
    ];
    dedupeRepositories(store);
    expect(store.repositories).toHaveLength(1);
    expect(store.repositories[0]!.id).toBe("actrepo_new");
    expect(store.repositories[0]!.enabled).toBe(false);

    writeActivationStore(store);
    upsertRepositoryDecision(root, true, "user");
    const after = readActivationStore().store;
    expect(after.repositories).toHaveLength(1);
    expect(after.repositories[0]!.enabled).toBe(true);
  });

  it("does not persist session decisions into protection.json", async () => {
    const home = tempHome();
    const {
      applyPromptChoice,
      readActivationStore,
      getProtectionFilePath,
    } = await loadProtection(home);

    const resolution = applyPromptChoice({ mode: "session" }, { cwd: home });
    expect(resolution.enabled).toBe(true);
    expect(resolution.mode).toBe("session");
    expect(resolution.sessionId).toMatch(/^actsess_/);

    const { store } = readActivationStore();
    expect(store.alwaysEnabled).toBe(false);
    expect(store.timed).toEqual([]);
    expect(store.repositories).toEqual([]);
    // File may or may not exist; if it does, it must not contain session ids.
    if (existsSync(getProtectionFilePath())) {
      const text = readFileSync(getProtectionFilePath(), "utf-8");
      expect(text).not.toContain("actsess_");
      expect(text).not.toContain(resolution.sessionId!);
    }
  });

  it("not-now / disabled prompt choice does not permanently disable", async () => {
    const home = tempHome();
    const { applyPromptChoice, readActivationStore, enableAlways } =
      await loadProtection(home);

    enableAlways();
    applyPromptChoice({ mode: "disabled" }, { cwd: home });
    // Skip is launch-local; always-on remains.
    expect(readActivationStore().store.alwaysEnabled).toBe(true);
    expect(readActivationStore().store.repositories).toEqual([]);
  });

  it("isolates reset scopes (always / timed / repositories)", async () => {
    const home = tempHome();
    const {
      enableAlways,
      addTimedDecision,
      upsertRepositoryDecision,
      resetDecisions,
      readActivationStore,
      canonicalizePath,
    } = await loadProtection(home);

    const rootA = canonicalizePath(join(home, "repo-a"));
    const rootB = canonicalizePath(join(home, "repo-b"));
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });

    enableAlways();
    addTimedDecision(new Date(Date.now() + 3_600_000).toISOString());
    upsertRepositoryDecision(rootA, true);
    upsertRepositoryDecision(rootB, false);

    resetDecisions({ timed: true });
    let store = readActivationStore().store;
    expect(store.alwaysEnabled).toBe(true);
    expect(store.timed).toEqual([]);
    expect(store.repositories).toHaveLength(2);

    resetDecisions({ repositories: rootA });
    store = readActivationStore().store;
    expect(store.repositories).toHaveLength(1);
    expect(store.repositories[0]!.root).toBe(rootB);
    expect(store.alwaysEnabled).toBe(true);

    resetDecisions({ always: true });
    store = readActivationStore().store;
    expect(store.alwaysEnabled).toBe(false);
    expect(store.repositories).toHaveLength(1);

    resetDecisions({ repositories: true });
    store = readActivationStore().store;
    expect(store.repositories).toEqual([]);
  });

  it("purges expired timed entries on read using injected now", async () => {
    const home = tempHome();
    const {
      readActivationStore,
      writeActivationStore,
      emptyActivationStore,
    } = await loadProtection(home);

    const now = new Date("2026-06-01T12:00:00.000Z");
    const expiredAt = "2026-06-01T11:00:00.000Z";
    const activeAt = "2026-06-01T14:00:00.000Z";

    const seed = emptyActivationStore();
    seed.timed = [
      {
        id: "acttime_expired",
        mode: "timed",
        enabled: true,
        createdAt: "2026-06-01T10:00:00.000Z",
        expiresAt: expiredAt,
        source: "user",
      },
      {
        id: "acttime_active",
        mode: "timed",
        enabled: true,
        createdAt: "2026-06-01T10:30:00.000Z",
        expiresAt: activeAt,
        source: "user",
      },
    ];
    writeActivationStore(seed, now);

    // Force-write then re-read with now so purge runs.
    const { store } = readActivationStore(now);
    expect(store.timed.map((t) => t.id)).toEqual(["acttime_active"]);
    expect(store.timed[0]!.expiresAt).toBe(activeAt);
  });
});
