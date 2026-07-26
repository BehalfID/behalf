#!/usr/bin/env node
/**
 * Detect source/version drift between local workspace packages and npm.
 *
 * For each publishable workspace package:
 * - If the package is not on npm → report UNPUBLISHED (ok until first release).
 * - If local version === published version → pack local, download published,
 *   compare file inventories + content hashes; FAIL when they differ.
 * - If local version > published version → OK (pending publish).
 * - If local version < published version → FAIL (version went backwards).
 *
 * Does NOT publish. Safe to run in CI.
 *
 * Usage (repo root):
 *   node scripts/release/check-package-integrity.mjs
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

/** Packages owned by release integrity (npm-facing). github-action is private. */
const PACKAGE_DIRS = [
  "cli",
  "sdk",
  "mcp-audit",
  "mcp-runtime",
  "install",
  "egress-proxy",
];

const DEPENDENCY_EDGES = [
  { from: "@behalfid/cli", field: "optionalDependencies", to: "@behalfid/egress-proxy" },
  { from: "@behalfid/install", field: "optionalDependencies", to: "@behalfid/mcp-runtime" },
];

function fail(message) {
  console.error(`check-package-integrity: FAIL — ${message}`);
  process.exitCode = 1;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    // Avoid shell concatenation on Windows; npm.cmd is resolved via PATHEXT when shell is false
    // but spawn of bare "npm" needs shell on win32. Prefer npm via process.env.ComSpec only when needed.
    shell: process.platform === "win32",
    windowsHide: true,
    ...opts,
  });
  return result;
}

function parseSemver(v) {
  const m = String(v).replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function npmView(name, field) {
  const r = run("npm", ["view", name, field, "--json"], { cwd: REPO_ROOT });
  if (r.status !== 0) {
    const err = `${r.stderr || ""}${r.stdout || ""}`;
    if (/E404|404 Not Found/i.test(err)) return { missing: true };
    return { error: err.trim() || `npm view ${name} ${field} failed` };
  }
  const raw = (r.stdout || "").trim();
  if (!raw) return { missing: true };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { value: raw.replace(/^"|"$/g, "") };
  }
}

function listFiles(root) {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(relative(root, full).split("\\").join("/"));
    }
  }
  walk(root);
  return out.sort();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function extractTarball(tgz, dest) {
  const r = run("tar", ["-xzf", tgz, "-C", dest]);
  if (r.status !== 0) {
    throw new Error(r.stderr || `tar extract failed for ${tgz}`);
  }
}

function packLocal(pkgDir, outDir) {
  const r = run("npm", ["pack", "--pack-destination", outDir, "--silent"], {
    cwd: pkgDir,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `npm pack failed in ${pkgDir}`);
  }
  const files = readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
  if (files.length !== 1) {
    // pack-destination may accumulate; pick newest matching name
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    const expectedPrefix = `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}`;
    const match = files.filter((f) => f.startsWith(expectedPrefix));
    if (match.length === 0) {
      throw new Error(`could not find packed tarball for ${pkg.name} in ${outDir}`);
    }
    return join(outDir, match.sort().at(-1));
  }
  return join(outDir, files[0]);
}

function comparePackages(localPkgRoot, pubPkgRoot) {
  const localFiles = listFiles(localPkgRoot);
  const pubFiles = listFiles(pubPkgRoot);
  const onlyLocal = localFiles.filter((f) => !pubFiles.includes(f));
  const onlyPub = pubFiles.filter((f) => !localFiles.includes(f));
  const differing = [];
  for (const f of localFiles) {
    if (!pubFiles.includes(f)) continue;
    if (f === "package.json") {
      // Compare structural fields that matter for consumers; ignore pure formatting.
      const lj = JSON.parse(readFileSync(join(localPkgRoot, f), "utf8"));
      const pj = JSON.parse(readFileSync(join(pubPkgRoot, f), "utf8"));
      const keys = [
        "name",
        "version",
        "bin",
        "main",
        "types",
        "exports",
        "files",
        "engines",
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
        "type",
        "license",
      ];
      for (const k of keys) {
        if (JSON.stringify(lj[k] ?? null) !== JSON.stringify(pj[k] ?? null)) {
          differing.push(`package.json#${k}`);
        }
      }
      continue;
    }
    if (sha256File(join(localPkgRoot, f)) !== sha256File(join(pubPkgRoot, f))) {
      differing.push(f);
    }
  }
  return { onlyLocal, onlyPub, differing };
}

function loadWorkspacePackages() {
  /** @type {Map<string, {dir: string, pkg: any}>} */
  const map = new Map();
  for (const dirName of PACKAGE_DIRS) {
    const dir = join(PACKAGES_DIR, dirName);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) {
      fail(`missing ${pkgPath}`);
      continue;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    map.set(pkg.name, { dir, pkg });
  }
  return map;
}

function verifyDependencyEdges(packages) {
  console.log("\n== Dependency relationships ==");
  for (const edge of DEPENDENCY_EDGES) {
    const from = packages.get(edge.from);
    const to = packages.get(edge.to);
    if (!from) {
      fail(`missing package ${edge.from}`);
      continue;
    }
    if (!to) {
      fail(`missing dependency target ${edge.to}`);
      continue;
    }
    const range = from.pkg[edge.field]?.[edge.to];
    if (!range) {
      fail(`${edge.from} missing ${edge.field}.${edge.to}`);
      continue;
    }
    console.log(`  OK  ${edge.from} ${edge.field} → ${edge.to}@${range} (workspace ${to.pkg.version})`);
  }

  // github-action is private / not an npm dep of the others
  const actionPath = join(PACKAGES_DIR, "github-action", "package.json");
  if (existsSync(actionPath)) {
    const action = JSON.parse(readFileSync(actionPath, "utf8"));
    console.log(
      `  OK  @behalfid/github-action@${action.version} private=${Boolean(action.private)} (GitHub Action, not npm)`
    );
  }
}

function main() {
  console.log("check-package-integrity: starting");
  const packages = loadWorkspacePackages();
  verifyDependencyEdges(packages);

  console.log("\n== Published vs local ==");
  const work = mkdtempSync(join(tmpdir(), "behalf-integrity-"));
  try {
    for (const [name, { dir, pkg }] of packages) {
      if (pkg.private) {
        console.log(`  SKIP ${name} (private)`);
        continue;
      }

      const view = npmView(name, "version");
      if (view.error) {
        fail(`${name}: ${view.error}`);
        continue;
      }
      if (view.missing) {
        console.log(`  UNPUBLISHED  ${name}@${pkg.version} (local only — mark docs as preview)`);
        continue;
      }

      const publishedVersion = String(view.value);
      const cmp = cmpSemver(pkg.version, publishedVersion);
      if (cmp === null) {
        fail(`${name}: cannot compare versions local=${pkg.version} published=${publishedVersion}`);
        continue;
      }
      if (cmp < 0) {
        fail(`${name}: local ${pkg.version} is behind published ${publishedVersion}`);
        continue;
      }
      if (cmp > 0) {
        console.log(
          `  PENDING  ${name}: local ${pkg.version} > published ${publishedVersion} (ready to publish)`
        );
        continue;
      }

      // Same version → content must match published tarball.
      console.log(`  CHECKING ${name}@${pkg.version} (local version matches published)`);
      const localOut = mkdtempSync(join(work, "local-"));
      const pubOut = mkdtempSync(join(work, "pub-"));
      const localTgz = packLocal(dir, localOut);
      const packPub = run("npm", ["pack", `${name}@${publishedVersion}`, "--pack-destination", pubOut], {
        cwd: work,
      });
      if (packPub.status !== 0) {
        fail(`${name}: failed to download published tarball`);
        continue;
      }
      const pubTgzName = readdirSync(pubOut).find((f) => f.endsWith(".tgz"));
      if (!pubTgzName) {
        fail(`${name}: published tarball missing after npm pack`);
        continue;
      }
      const localExtract = mkdtempSync(join(work, "lex-"));
      const pubExtract = mkdtempSync(join(work, "pex-"));
      extractTarball(localTgz, localExtract);
      extractTarball(join(pubOut, pubTgzName), pubExtract);
      const diff = comparePackages(join(localExtract, "package"), join(pubExtract, "package"));
      if (diff.onlyLocal.length || diff.onlyPub.length || diff.differing.length) {
        fail(
          `${name}@${pkg.version} content differs from npm (bump version before reuse). ` +
            `onlyLocal=${diff.onlyLocal.length} onlyPub=${diff.onlyPub.length} differing=${diff.differing.length}`
        );
        for (const f of [...diff.onlyLocal.map((x) => `+${x}`), ...diff.onlyPub.map((x) => `-${x}`), ...diff.differing]) {
          console.error(`    ${f}`);
        }
      } else {
        console.log(`  OK  ${name}@${pkg.version} matches published tarball`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  if (process.exitCode) {
    console.error("\ncheck-package-integrity: FAILED");
    process.exit(process.exitCode);
  }
  console.log("\ncheck-package-integrity: OK");
}

main();
