import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const VERIFIER = join(
  process.cwd(),
  "scripts",
  "release",
  "verify-cli-package-metadata.mjs"
);

const CANONICAL = {
  name: "@behalfid/cli",
  version: "0.2.11",
  bin: {
    behalf: "dist/index.js",
    behalfid: "dist/index.js",
  },
  engines: { node: ">=18" },
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/BehalfID/behalf.git",
    directory: "packages/cli",
  },
};

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writePkg(overrides: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "behalf-cli-meta-"));
  tempDirs.push(dir);
  const pkg = {
    ...CANONICAL,
    ...overrides,
    bin: {
      ...CANONICAL.bin,
      ...((overrides.bin as Record<string, string> | undefined) ?? {}),
    },
    repository: {
      ...CANONICAL.repository,
      ...((overrides.repository as Record<string, string> | undefined) ?? {}),
    },
    engines: {
      ...CANONICAL.engines,
      ...((overrides.engines as Record<string, string> | undefined) ?? {}),
    },
  };
  if (overrides.repository === undefined && "repository" in overrides) {
    delete (pkg as { repository?: unknown }).repository;
  }
  if (overrides.bin === undefined && "bin" in overrides) {
    delete (pkg as { bin?: unknown }).bin;
  }
  if (overrides.engines === undefined && "engines" in overrides) {
    delete (pkg as { engines?: unknown }).engines;
  }
  if ("license" in overrides && overrides.license === undefined) {
    delete (pkg as { license?: unknown }).license;
  }
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify(pkg, null, 2));
  return path;
}

function run(
  pkgPath: string,
  expectedVersion = "0.2.11",
  expectedRepo = "BehalfID/behalf"
) {
  return spawnSync(
    process.execPath,
    [VERIFIER, pkgPath, expectedVersion, expectedRepo],
    { encoding: "utf8" }
  );
}

describe("verify-cli-package-metadata", () => {
  it("accepts the canonical git+ repository URL and bin paths", () => {
    const path = writePkg();
    const result = run(path);
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toMatch(/verify-cli-package-metadata: OK/);
    expect(result.stdout).toContain(
      "repository.url: git+https://github.com/BehalfID/behalf.git"
    );
  });

  it("rejects lowercase organization casing", () => {
    const path = writePkg({
      repository: { url: "git+https://github.com/behalfid/behalf.git" },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.url must exactly equal/);
  });

  it("rejects plain HTTPS browser URL", () => {
    const path = writePkg({
      repository: { url: "https://github.com/BehalfID/behalf" },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.url must exactly equal/);
  });

  it("rejects missing git+ prefix", () => {
    const path = writePkg({
      repository: { url: "https://github.com/BehalfID/behalf.git" },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.url must exactly equal/);
  });

  it("rejects missing .git suffix", () => {
    const path = writePkg({
      repository: { url: "git+https://github.com/BehalfID/behalf" },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.url must exactly equal/);
  });

  it("rejects wrong repository", () => {
    const path = writePkg({
      repository: { url: "git+https://github.com/BehalfID/other.git" },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.url must exactly equal/);
  });

  it("rejects wrong package version", () => {
    const path = writePkg({ version: "0.2.10" });
    const result = run(path, "0.2.11");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/version must be "0\.2\.11"/);
  });

  it("rejects leading ./ bin paths", () => {
    const path = writePkg({
      bin: {
        behalf: "./dist/index.js",
        behalfid: "./dist/index.js",
      },
    });
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/bin\.behalf must be "dist\/index\.js"/);
  });

  it("rejects missing repository.directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "behalf-cli-meta-"));
    tempDirs.push(dir);
    const path = join(dir, "package.json");
    writeFileSync(
      path,
      JSON.stringify({
        name: "@behalfid/cli",
        version: "0.2.11",
        bin: {
          behalf: "dist/index.js",
          behalfid: "dist/index.js",
        },
        engines: { node: ">=18" },
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/BehalfID/behalf.git",
        },
      })
    );
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository\.directory must be "packages\/cli"/);
  });
});
