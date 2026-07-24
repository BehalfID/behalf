import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Delivery-integrity guard for the Node runtime contract.
 *
 * puppeteer / puppeteer-core declare `node >=22.12.0`. When CI pinned Node 20
 * the toolchain and the declared dependency tree disagreed, so `npm ci`
 * installed a dependency that could not run on the CI runtime. This suite keeps
 * the declared engine, the `.nvmrc` pin, and every `actions/setup-node` step in
 * lockstep so CI can never silently regress to a Node line the dependency tree
 * does not support.
 */

const ROOT = process.cwd();

type SemVer = { major: number; minor: number; patch: number };

function parseSemver(raw: string): SemVer {
  const cleaned = raw.trim().replace(/^v/, "").replace(/^>=?/, "").trim();
  const [major = "0", minor = "0", patch = "0"] = cleaned.split(".");
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** Returns true when `candidate` is >= `floor` under semver ordering. */
function satisfiesFloor(candidate: SemVer, floor: SemVer): boolean {
  if (candidate.major !== floor.major) return candidate.major > floor.major;
  if (candidate.minor !== floor.minor) return candidate.minor > floor.minor;
  return candidate.patch >= floor.patch;
}

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8"));
}

const rootPkg = readJson("package.json") as {
  engines?: { node?: string };
};
const lockfile = readJson("package-lock.json") as {
  packages: Record<string, { engines?: { node?: string } }>;
};

const puppeteerEngine = lockfile.packages["node_modules/puppeteer"]?.engines?.node;
const puppeteerCoreEngine =
  lockfile.packages["node_modules/puppeteer-core"]?.engines?.node;

describe("Node runtime contract", () => {
  it("declares a root engines.node requirement", () => {
    expect(rootPkg.engines?.node, "root package.json must declare engines.node").toBeTruthy();
  });

  it("root engines.node is at least as strict as puppeteer's requirement", () => {
    // If puppeteer bumps its floor, this fails until engines.node is raised to
    // match — the declared app runtime must never trail its own dependencies.
    expect(puppeteerEngine, "puppeteer engine missing from lockfile").toBeTruthy();
    expect(puppeteerCoreEngine, "puppeteer-core engine missing from lockfile").toBe(
      puppeteerEngine
    );

    const declared = parseSemver(rootPkg.engines!.node!);
    const required = parseSemver(puppeteerEngine!);
    expect(
      satisfiesFloor(declared, required),
      `engines.node (${rootPkg.engines!.node}) must satisfy puppeteer's ${puppeteerEngine}`
    ).toBe(true);
  });

  it(".nvmrc pins a supported LTS that satisfies the declared engine", () => {
    const nvmrc = readFileSync(join(ROOT, ".nvmrc"), "utf8").trim();
    expect(nvmrc, ".nvmrc must not be empty").toBeTruthy();

    const pinned = parseSemver(nvmrc);
    const declared = parseSemver(rootPkg.engines!.node!);

    // Even major line == a Node LTS release line.
    expect(pinned.major % 2, `.nvmrc (${nvmrc}) must pin an even LTS major`).toBe(0);
    expect(
      pinned.major >= declared.major,
      `.nvmrc major (${pinned.major}) must be >= engines.node major (${declared.major})`
    ).toBe(true);
  });

  it("every setup-node step resolves Node from .nvmrc, never a hardcoded pin", () => {
    const workflows = [
      ".github/workflows/ci.yml",
      ".github/workflows/cli-release.yml",
    ];

    for (const rel of workflows) {
      const yaml = readFileSync(join(ROOT, rel), "utf8");
      const setupNodeSteps = (yaml.match(/actions\/setup-node@/g) ?? []).length;
      const fileRefs = (yaml.match(/node-version-file:\s*["']?\.nvmrc["']?/g) ?? []).length;

      expect(setupNodeSteps, `${rel} should configure setup-node`).toBeGreaterThan(0);
      expect(
        fileRefs,
        `${rel}: every setup-node step must use node-version-file: .nvmrc`
      ).toBe(setupNodeSteps);
      expect(
        /node-version:\s*["']?\d/.test(yaml),
        `${rel} must not hardcode a numeric node-version`
      ).toBe(false);
    }
  });
});
