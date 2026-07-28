import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { appendProtectionEvent } from "./audit.js";
import { canonicalizePath, pathsEqual } from "./paths.js";
import type {
  ActivationSource,
  ActivationStore,
  BehalfActivationDecision,
  ListedDecision,
  ResetDecisionsScope,
  RepositoryDecision,
} from "./types.js";

export const PROTECTION_FILE_NAME = "protection.json";

/** Empty local store. Session decisions are never persisted here. */
export function emptyActivationStore(): ActivationStore {
  return {
    version: 1,
    alwaysEnabled: false,
    timed: [],
    repositories: [],
  };
}

/**
 * Resolve `~/.behalf` at call time so tests can stub `homedir()` /
 * `vi.resetModules()` without a stale module-level path.
 */
export function getProtectionDir(): string {
  return join(homedir(), ".behalf");
}

export function getProtectionFilePath(): string {
  return join(getProtectionDir(), PROTECTION_FILE_NAME);
}

function ensureProtectionDir(): void {
  const dir = getProtectionDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function newDecisionId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("base64url")}`;
}

function isExpired(expiresAt: string | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * Drop expired timed entries. Returns purged decisions for audit callers.
 */
export function purgeExpiredTimed(
  store: ActivationStore,
  now: Date = new Date()
): BehalfActivationDecision[] {
  const kept: BehalfActivationDecision[] = [];
  const purged: BehalfActivationDecision[] = [];
  for (const entry of store.timed) {
    if (isExpired(entry.expiresAt, now)) purged.push(entry);
    else kept.push(entry);
  }
  store.timed = kept;
  return purged;
}

/**
 * Deduplicate repository entries by canonical root; newer `updatedAt` /
 * `createdAt` wins. Mutates and returns the store.
 */
export function dedupeRepositories(store: ActivationStore): ActivationStore {
  const byRoot = new Map<string, RepositoryDecision>();
  for (const entry of store.repositories) {
    const root = canonicalizePath(entry.root);
    const normalized: RepositoryDecision = {
      ...entry,
      root,
      identity: entry.identity ?? { kind: "path", value: root },
    };
    const existing = byRoot.get(rootKey(root));
    if (!existing) {
      byRoot.set(rootKey(root), normalized);
      continue;
    }
    const existingTs = Date.parse(existing.updatedAt ?? existing.createdAt);
    const nextTs = Date.parse(normalized.updatedAt ?? normalized.createdAt);
    if (!Number.isFinite(existingTs) || nextTs >= existingTs) {
      byRoot.set(rootKey(root), normalized);
    }
  }
  store.repositories = [...byRoot.values()];
  return store;
}

function rootKey(canonicalRoot: string): string {
  return process.platform === "win32"
    ? canonicalRoot.toLowerCase()
    : canonicalRoot;
}

function normalizeStore(raw: ActivationStore, now: Date): {
  store: ActivationStore;
  purged: BehalfActivationDecision[];
} {
  const store: ActivationStore = {
    version: 1,
    alwaysEnabled: Boolean(raw.alwaysEnabled),
    timed: Array.isArray(raw.timed) ? [...raw.timed] : [],
    repositories: Array.isArray(raw.repositories) ? [...raw.repositories] : [],
  };
  const purged = purgeExpiredTimed(store, now);
  dedupeRepositories(store);
  return { store, purged };
}

function auditExpired(purged: BehalfActivationDecision[]): void {
  for (const entry of purged) {
    appendProtectionEvent("protection.expired", {
      mode: "timed",
      decisionId: entry.id,
      expiresAt: entry.expiresAt,
    });
  }
}

/**
 * Atomic write: temp file in the same directory, then renameSync.
 * Best-effort concurrent safety; on Windows, unlink destination before rename
 * when the target already exists.
 */
export function atomicWriteFile(filePath: string, contents: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  );
  writeFileSync(tmp, contents, { mode: 0o600 });
  try {
    renameSync(tmp, filePath);
  } catch {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      renameSync(tmp, filePath);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore cleanup failure
      }
      throw err;
    }
  }
}

function persist(store: ActivationStore, now: Date = new Date()): void {
  purgeExpiredTimed(store, now);
  dedupeRepositories(store);
  ensureProtectionDir();
  atomicWriteFile(
    getProtectionFilePath(),
    JSON.stringify(store, null, 2) + "\n"
  );
}

/**
 * Read `~/.behalf/protection.json`.
 * On malformed JSON: backup to `protection.json.corrupt-<timestamp>`, return
 * a warning, and start from an empty store (never silently destroy).
 */
export function readActivationStore(
  now: Date = new Date()
): { store: ActivationStore; warning?: string } {
  const path = getProtectionFilePath();
  if (!existsSync(path)) {
    return { store: emptyActivationStore() };
  }

  let rawText: string;
  try {
    rawText = readFileSync(path, "utf-8");
  } catch {
    return { store: emptyActivationStore() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${PROTECTION_FILE_NAME}.corrupt-${stamp}`;
    const backupPath = join(getProtectionDir(), backupName);
    try {
      ensureProtectionDir();
      writeFileSync(backupPath, rawText, { mode: 0o600 });
    } catch {
      // best effort backup
    }
    const warning =
      `Malformed ${PROTECTION_FILE_NAME}; backed up to ${backupName} and starting fresh.`;
    return { store: emptyActivationStore(), warning };
  }

  if (!parsed || typeof parsed !== "object") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${PROTECTION_FILE_NAME}.corrupt-${stamp}`;
    const backupPath = join(getProtectionDir(), backupName);
    try {
      ensureProtectionDir();
      writeFileSync(backupPath, rawText, { mode: 0o600 });
    } catch {
      // best effort
    }
    return {
      store: emptyActivationStore(),
      warning: `Invalid ${PROTECTION_FILE_NAME} shape; backed up to ${backupName} and starting fresh.`,
    };
  }

  const { store, purged } = normalizeStore(parsed as ActivationStore, now);
  if (purged.length > 0) {
    auditExpired(purged);
    // Persist purge so expired entries do not linger
    try {
      persist(store, now);
    } catch {
      // read still succeeds with in-memory purge
    }
  }
  return { store };
}

export function writeActivationStore(
  store: ActivationStore,
  now: Date = new Date()
): void {
  const next: ActivationStore = {
    version: 1,
    alwaysEnabled: Boolean(store.alwaysEnabled),
    timed: Array.isArray(store.timed) ? [...store.timed] : [],
    repositories: Array.isArray(store.repositories)
      ? [...store.repositories]
      : [],
  };
  const purged = purgeExpiredTimed(next, now);
  dedupeRepositories(next);
  if (purged.length > 0) auditExpired(purged);
  persist(next, now);
}

export function enableAlways(source: ActivationSource = "user"): void {
  const { store } = readActivationStore();
  store.alwaysEnabled = true;
  writeActivationStore(store);
  appendProtectionEvent("protection.enabled.always", { source });
}

export function disableAlways(): void {
  const { store } = readActivationStore();
  store.alwaysEnabled = false;
  writeActivationStore(store);
}

export function upsertRepositoryDecision(
  root: string,
  enabled: boolean,
  source: ActivationSource = "user"
): RepositoryDecision {
  const { store } = readActivationStore();
  const canonical = canonicalizePath(root);
  const nowIso = new Date().toISOString();
  const key = rootKey(canonical);
  const existingIdx = store.repositories.findIndex(
    (r) => rootKey(canonicalizePath(r.root)) === key
  );

  let decision: RepositoryDecision;
  if (existingIdx >= 0) {
    const prev = store.repositories[existingIdx];
    decision = {
      ...prev,
      root: canonical,
      enabled,
      updatedAt: nowIso,
      source,
      identity: { kind: "path", value: canonical },
    };
    store.repositories[existingIdx] = decision;
  } else {
    decision = {
      id: newDecisionId("actrepo"),
      root: canonical,
      enabled,
      createdAt: nowIso,
      updatedAt: nowIso,
      source,
      identity: { kind: "path", value: canonical },
    };
    store.repositories.push(decision);
  }

  writeActivationStore(store);
  if (enabled) {
    appendProtectionEvent("protection.enabled.repository", {
      source,
      repositoryRoot: canonical,
      decisionId: decision.id,
    });
  }
  return decision;
}

export function removeRepositoryDecision(root: string): boolean {
  const { store } = readActivationStore();
  const canonical = canonicalizePath(root);
  const before = store.repositories.length;
  store.repositories = store.repositories.filter(
    (r) => !pathsEqual(canonicalizePath(r.root), canonical)
  );
  if (store.repositories.length === before) return false;
  writeActivationStore(store);
  return true;
}

export function addTimedDecision(
  expiresAt: string,
  source: ActivationSource = "user"
): BehalfActivationDecision {
  const { store } = readActivationStore();
  const nowIso = new Date().toISOString();
  const decision: BehalfActivationDecision = {
    id: newDecisionId("acttime"),
    mode: "timed",
    enabled: true,
    createdAt: nowIso,
    expiresAt,
    source,
  };
  store.timed.push(decision);
  writeActivationStore(store);
  appendProtectionEvent("protection.enabled.timed", {
    source,
    decisionId: decision.id,
    expiresAt,
  });
  return decision;
}

/**
 * List local decisions for CLI display. Does not include org/managed-profile.
 */
export function listDecisions(now: Date = new Date()): ListedDecision[] {
  const { store } = readActivationStore(now);
  const out: ListedDecision[] = [];

  if (store.alwaysEnabled) {
    out.push({
      kind: "always",
      enabled: true,
      mode: "always",
      source: "user",
    });
  }

  for (const t of store.timed) {
    out.push({
      kind: "timed",
      id: t.id,
      enabled: t.enabled,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
      source: t.source,
      lastUsedAt: t.lastUsedAt,
      mode: "timed",
    });
  }

  for (const r of store.repositories) {
    out.push({
      kind: "repository",
      id: r.id,
      enabled: r.enabled,
      root: r.root,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      source: r.source,
      mode: "repository",
    });
  }

  return out;
}

/**
 * Reset local activation decisions only. Never touches org/managed-profile
 * remote configuration.
 */
export function resetDecisions(scope: ResetDecisionsScope): void {
  const { store } = readActivationStore();
  let changed = false;

  if (scope.always) {
    if (store.alwaysEnabled) {
      store.alwaysEnabled = false;
      changed = true;
    }
  }

  if (scope.timed) {
    if (store.timed.length > 0) {
      store.timed = [];
      changed = true;
    }
  }

  if (scope.repositories === true) {
    if (store.repositories.length > 0) {
      store.repositories = [];
      changed = true;
    }
  } else if (typeof scope.repositories === "string") {
    const canonical = canonicalizePath(scope.repositories);
    const next = store.repositories.filter(
      (r) => !pathsEqual(canonicalizePath(r.root), canonical)
    );
    if (next.length !== store.repositories.length) {
      store.repositories = next;
      changed = true;
    }
  }

  if (changed) {
    writeActivationStore(store);
    appendProtectionEvent("protection.reset", {
      always: Boolean(scope.always),
      timed: Boolean(scope.timed),
      repositories:
        scope.repositories === true
          ? "all"
          : typeof scope.repositories === "string"
            ? scope.repositories
            : undefined,
    });
  }
}

/**
 * Update `lastUsedAt` on a timed decision (or no-op if id not found).
 */
export function touchDecision(id: string, now: Date = new Date()): boolean {
  const { store } = readActivationStore(now);
  const idx = store.timed.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  store.timed[idx] = {
    ...store.timed[idx],
    lastUsedAt: now.toISOString(),
  };
  writeActivationStore(store, now);
  return true;
}

/** Active (non-expired, enabled) timed decision with the latest expiry, if any. */
export function findActiveTimedDecision(
  store: ActivationStore,
  now: Date = new Date()
): BehalfActivationDecision | null {
  let best: BehalfActivationDecision | null = null;
  for (const entry of store.timed) {
    if (!entry.enabled) continue;
    if (isExpired(entry.expiresAt, now)) continue;
    if (
      !best ||
      Date.parse(entry.expiresAt ?? "") > Date.parse(best.expiresAt ?? "")
    ) {
      best = entry;
    }
  }
  return best;
}
