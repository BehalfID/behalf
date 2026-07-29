import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "behalf-prot-prompt-"));
}

async function loadModules(home: string) {
  vi.resetModules();
  stubCliHome(home);
  const protection = await import("../packages/cli/src/lib/protection/index.js");
  const activation = await import("../packages/cli/src/lib/activation.js");
  const prompt = await import("../packages/cli/src/lib/prompt.js");
  return { protection, activation, prompt };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("prompt choice persistence / suppression", () => {
  it("saved repository suppresses future prompts for descendants", async () => {
    const home = tempHome();
    const { protection } = await loadModules(home);
    const root = protection.canonicalizePath(join(home, "project"));
    const child = join(root, "packages", "app");
    mkdirSync(child, { recursive: true });

    protection.applyPromptChoice({ mode: "repository", root }, { cwd: root });

    const result = protection.resolveActivation({ cwd: child, interactive: true });
    expect(result.shouldPrompt).toBe(false);
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe("repository");
    expect(result.repositoryRoot).toBe(root);
  });

  it("sibling repositories are independent", async () => {
    const home = tempHome();
    const { protection } = await loadModules(home);
    const repoA = protection.canonicalizePath(join(home, "repo-a"));
    const repoB = protection.canonicalizePath(join(home, "repo-b"));
    mkdirSync(repoA, { recursive: true });
    mkdirSync(repoB, { recursive: true });

    protection.applyPromptChoice({ mode: "repository", root: repoA }, { cwd: repoA });

    expect(protection.resolveActivation({ cwd: repoA, interactive: true }).shouldPrompt).toBe(
      false
    );
    expect(protection.resolveActivation({ cwd: repoB, interactive: true }).shouldPrompt).toBe(
      true
    );
  });

  it("not-now does not persist a permanent disable", async () => {
    const home = tempHome();
    const { protection } = await loadModules(home);

    const skipped = protection.applyPromptChoice({ mode: "disabled" }, { cwd: home });
    expect(skipped.enabled).toBe(false);

    const { store } = protection.readActivationStore();
    expect(store.alwaysEnabled).toBe(false);
    expect(store.repositories).toEqual([]);
    expect(store.timed).toEqual([]);

    expect(protection.resolveActivation({ cwd: home, interactive: true }).shouldPrompt).toBe(
      true
    );
  });

  it("always-on suppresses prompts", async () => {
    const home = tempHome();
    const { protection } = await loadModules(home);

    protection.applyPromptChoice({ mode: "always" }, { cwd: home });
    const result = protection.resolveActivation({ cwd: home, interactive: true });
    expect(result.shouldPrompt).toBe(false);
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe("always");
  });

  it("timed choice expires and prompts again after expiry", async () => {
    const home = tempHome();
    const { protection } = await loadModules(home);

    const start = new Date("2026-07-01T10:00:00.000Z");
    protection.applyPromptChoice(
      { mode: "timed", duration: "1h" },
      { cwd: home, now: start }
    );

    const during = protection.resolveActivation({
      cwd: home,
      interactive: true,
      now: new Date("2026-07-01T10:30:00.000Z"),
    });
    expect(during.shouldPrompt).toBe(false);
    expect(during.mode).toBe("timed");

    const after = protection.resolveActivation({
      cwd: home,
      interactive: true,
      now: new Date("2026-07-01T11:30:00.000Z"),
    });
    expect(after.shouldPrompt).toBe(true);
    expect(after.enabled).toBe(false);
  });
});

describe("mocked select → promptActivationChoice", () => {
  it("maps select answers into applyPromptChoice without hanging", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);

    vi.doMock("../packages/cli/src/lib/prompt.js", async () => {
      const actual = await vi.importActual<typeof import("../packages/cli/src/lib/prompt.js")>(
        "../packages/cli/src/lib/prompt.js"
      );
      return {
        ...actual,
        select: vi.fn(async (_q: string, options: Array<{ value: string }>) => {
          // Always pick "Always enable" from the primary menu.
          const always = options.find((o) => o.value === "always");
          return (always?.value ?? options[0]!.value) as never;
        }),
      };
    });

    const activation = await import("../packages/cli/src/lib/activation.js");
    const protection = await import("../packages/cli/src/lib/protection/index.js");

    const choice = await activation.promptActivationChoice({ cwd: home });
    expect(choice).toEqual({ mode: "always" });

    const resolution = protection.applyPromptChoice(choice, { cwd: home });
    expect(resolution.mode).toBe("always");
    expect(resolution.enabled).toBe(true);

    const next = await activation.resolveLaunchActivation({
      cwd: home,
      interactive: true,
      stderr: { write: () => true },
    });
    expect(next.shouldPrompt).toBe(false);
    expect(next.mode).toBe("always");

    vi.doUnmock("../packages/cli/src/lib/prompt.js");
  });

  it("resolveLaunchActivation skips select when noninteractive", async () => {
    const home = tempHome();
    vi.resetModules();
    stubCliHome(home);

    const select = vi.fn();
    vi.doMock("../packages/cli/src/lib/prompt.js", async () => {
      const actual = await vi.importActual<typeof import("../packages/cli/src/lib/prompt.js")>(
        "../packages/cli/src/lib/prompt.js"
      );
      return { ...actual, select };
    });

    const activation = await import("../packages/cli/src/lib/activation.js");
    const resolution = await activation.resolveLaunchActivation({
      cwd: home,
      interactive: false,
      stderr: { write: () => true },
    });

    expect(select).not.toHaveBeenCalled();
    expect(resolution.shouldPrompt).toBe(false);
    expect(resolution.enabled).toBe(true);
    expect(resolution.source).toBe("default");

    vi.doUnmock("../packages/cli/src/lib/prompt.js");
  });
});
