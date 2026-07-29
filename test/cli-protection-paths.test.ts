import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-prot-paths-"));
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

describe("canonicalizePath / isPathInsideOrEqual", () => {
  it("treats exact root as inside", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    mkdirSync(root, { recursive: true });
    expect(isPathInsideOrEqual(root, root)).toBe(true);
  });

  it("accepts a direct child", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    const child = canonicalizePath(join(root, "src"));
    mkdirSync(child, { recursive: true });
    expect(isPathInsideOrEqual(child, root)).toBe(true);
  });

  it("accepts a deeply nested child", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    const nested = canonicalizePath(join(root, "a", "b", "c", "file-dir"));
    mkdirSync(nested, { recursive: true });
    expect(isPathInsideOrEqual(nested, root)).toBe(true);
  });

  it("rejects a sibling path", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    const sibling = canonicalizePath(join(home, "other"));
    mkdirSync(root, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    expect(isPathInsideOrEqual(sibling, root)).toBe(false);
  });

  it("rejects deceptive prefix (project vs project-old)", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    const decoy = canonicalizePath(join(home, "project-old"));
    mkdirSync(root, { recursive: true });
    mkdirSync(decoy, { recursive: true });
    expect(isPathInsideOrEqual(decoy, root)).toBe(false);
    expect(isPathInsideOrEqual(join(decoy, "src"), root)).toBe(false);
  });

  it("handles paths with spaces", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "my project"));
    const child = canonicalizePath(join(root, "sub dir", "nested"));
    mkdirSync(child, { recursive: true });
    expect(isPathInsideOrEqual(child, root)).toBe(true);
    expect(isPathInsideOrEqual(join(home, "my project-extra"), root)).toBe(false);
  });

  it("normalizes mixed separators for containment", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const root = canonicalizePath(join(home, "project"));
    mkdirSync(join(root, "src", "lib"), { recursive: true });

    // Build a path with the alternate separator style where possible.
    const mixed =
      process.platform === "win32"
        ? `${root}\\src/lib`
        : `${root}/src\\lib`.replace(/\\/g, "/"); // on posix backslash is a name char; use forward only
    const child =
      process.platform === "win32"
        ? mixed
        : join(root, "src", "lib");

    expect(isPathInsideOrEqual(child, root)).toBe(true);
    expect(canonicalizePath(child)).toBe(canonicalizePath(join(root, "src", "lib")));
  });

  it("normalizes Windows drive-letter case (or is a no-op off Windows)", async () => {
    const home = tempHome();
    const { normalizeDriveLetter, canonicalizePath, isPathInsideOrEqual, pathsEqual } =
      await loadProtection(home);

    if (process.platform === "win32") {
      const upper = normalizeDriveLetter("c:\\Users\\Example\\project");
      expect(upper.startsWith("C:")).toBe(true);

      const root = canonicalizePath(home);
      const lowerDrive = root.charAt(0).toLowerCase() + root.slice(1);
      const upperDrive = root.charAt(0).toUpperCase() + root.slice(1);
      expect(pathsEqual(canonicalizePath(lowerDrive), canonicalizePath(upperDrive))).toBe(true);
      expect(isPathInsideOrEqual(join(lowerDrive, "child"), upperDrive)).toBe(true);
    } else {
      // Pure helper still exported; non-Windows leaves the string unchanged.
      expect(normalizeDriveLetter("/tmp/project")).toBe("/tmp/project");
      expect(normalizeDriveLetter("c:\\Users\\Example")).toBe("c:\\Users\\Example");
    }
  });
});

describe("findMatchingRepositoryDecision (deepest match)", () => {
  it("picks the nested repository over its parent", async () => {
    const home = tempHome();
    const {
      findMatchingRepositoryDecision,
      canonicalizePath,
      emptyActivationStore,
    } = await loadProtection(home);

    const parent = canonicalizePath(join(home, "monorepo"));
    const nested = canonicalizePath(join(parent, "apps", "web"));
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "marker.txt"), "x");

    const store = emptyActivationStore();
    store.repositories = [
      {
        id: "actrepo_parent",
        root: parent,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        source: "user",
      },
      {
        id: "actrepo_nested",
        root: nested,
        enabled: false,
        createdAt: "2026-01-02T00:00:00.000Z",
        source: "user",
      },
    ];

    const cwd = join(nested, "src");
    mkdirSync(cwd, { recursive: true });
    const match = findMatchingRepositoryDecision(cwd, store);
    expect(match).not.toBeNull();
    expect(match!.root).toBe(nested);
    expect(match!.decision.enabled).toBe(false);
  });

  it("falls back to parent when cwd is outside the nested root", async () => {
    const home = tempHome();
    const {
      findMatchingRepositoryDecision,
      canonicalizePath,
      emptyActivationStore,
    } = await loadProtection(home);

    const parent = canonicalizePath(join(home, "monorepo"));
    const nested = canonicalizePath(join(parent, "apps", "web"));
    mkdirSync(nested, { recursive: true });

    const store = emptyActivationStore();
    store.repositories = [
      {
        id: "actrepo_parent",
        root: parent,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        source: "user",
      },
      {
        id: "actrepo_nested",
        root: nested,
        enabled: false,
        createdAt: "2026-01-02T00:00:00.000Z",
        source: "user",
      },
    ];

    const siblingApp = join(parent, "apps", "api");
    mkdirSync(siblingApp, { recursive: true });
    const match = findMatchingRepositoryDecision(siblingApp, store);
    expect(match).not.toBeNull();
    expect(match!.root).toBe(parent);
    expect(match!.decision.enabled).toBe(true);
  });
});

describe("canonical scenario roots (project / project-old / project2)", () => {
  it("inherits for nested paths and rejects deceptive siblings", async () => {
    const home = tempHome();
    const {
      canonicalizePath,
      isPathInsideOrEqual,
      upsertRepositoryDecision,
      resolveActivation,
    } = await loadProtection(home);

    const project = canonicalizePath(join(home, "root", "project"));
    const nestedApi = canonicalizePath(join(project, "src", "api"));
    const projectOld = canonicalizePath(join(home, "root", "project-old"));
    const project2 = canonicalizePath(join(home, "root", "project2"));
    mkdirSync(nestedApi, { recursive: true });
    mkdirSync(projectOld, { recursive: true });
    mkdirSync(project2, { recursive: true });

    upsertRepositoryDecision(project, true, "user");

    expect(isPathInsideOrEqual(nestedApi, project)).toBe(true);
    expect(isPathInsideOrEqual(join(project, "src"), project)).toBe(true);
    expect(isPathInsideOrEqual(projectOld, project)).toBe(false);
    expect(isPathInsideOrEqual(project2, project)).toBe(false);

    expect(resolveActivation({ cwd: nestedApi, interactive: true }).mode).toBe("repository");
    expect(resolveActivation({ cwd: projectOld, interactive: true }).shouldPrompt).toBe(true);
    expect(resolveActivation({ cwd: project2, interactive: true }).shouldPrompt).toBe(true);
  });

  it("normalizes .. segments before containment", async () => {
    const home = tempHome();
    const { canonicalizePath, isPathInsideOrEqual } = await loadProtection(home);
    const project = canonicalizePath(join(home, "root", "project"));
    mkdirSync(join(project, "src"), { recursive: true });
    const viaDotDot = join(project, "src", "..", "src", "api");
    mkdirSync(canonicalizePath(viaDotDot), { recursive: true });
    expect(isPathInsideOrEqual(viaDotDot, project)).toBe(true);
    expect(isPathInsideOrEqual(join(project, "..", "project-old"), project)).toBe(false);
  });
});

describe("pathDepth helper", () => {
  it("counts segments without depending on trailing separators", async () => {
    const home = tempHome();
    const { pathDepth, canonicalizePath } = await loadProtection(home);
    const base = canonicalizePath(join(home, "a", "b"));
    mkdirSync(base, { recursive: true });
    expect(pathDepth(base)).toBeGreaterThan(pathDepth(canonicalizePath(home)));
    expect(pathDepth(base + sep)).toBe(pathDepth(base));
  });
});
