#!/usr/bin/env node
/**
 * Pack each workspace package and install into a clean temp project.
 * Verifies bin entry points, exports, bundled files, license/readme, engines.
 *
 * Does NOT publish. Usage (repo root, after builds):
 *   node scripts/release/pack-smoke.mjs
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

function importFromInstalled(consumerDir, specifier, checkExpr) {
  const code = `
    const mod = await import(${JSON.stringify(specifier)});
    ${checkExpr}
    console.log('import ok', ${JSON.stringify(specifier)});
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: consumerDir,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `import ${specifier} failed`);
  if (r.stdout) process.stdout.write(r.stdout);
}

const PACKAGES = [
  {
    dir: "packages/sdk",
    name: "@behalfid/sdk",
    smoke: async (pkgRoot, ctx) => {
      assertReadmeLicense(pkgRoot);
      importFromInstalled(
        ctx.consumerDir,
        "@behalfid/sdk",
        `if (typeof mod.BehalfID !== 'function') throw new Error('BehalfID export missing');`
      );
      // Adapter export path exists in package.json exports.
      const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
      if (!pkg.exports?.["./adapters/openai"]) {
        throw new Error("missing exports ./adapters/openai");
      }
      console.log("sdk smoke ok", pkg.version);
    },
  },
  {
    dir: "packages/cli",
    name: "@behalfid/cli",
    smoke: async (pkgRoot, ctx) => {
      assertBin(pkgRoot, "behalf", "dist/index.js");
      assertBin(pkgRoot, "behalfid", "dist/index.js");
      assertShebang(join(pkgRoot, "dist/index.js"));
      const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
      assertReadmeLicense(pkgRoot);
      const ver = spawnSync(process.execPath, [join(pkgRoot, "dist/index.js"), "--version"], {
        cwd: pkgRoot,
        encoding: "utf8",
      });
      if (ver.status !== 0) throw new Error(ver.stderr || "cli --version failed");
      if (ver.stdout.trim() !== pkg.version) {
        throw new Error(`cli --version ${ver.stdout.trim()} !== ${pkg.version}`);
      }
      const binPath = join(
        ctx.binDir,
        process.platform === "win32" ? "behalf.cmd" : "behalf"
      );
      if (!existsSync(binPath) && !existsSync(join(ctx.binDir, "behalf"))) {
        throw new Error(`behalf bin not installed under ${ctx.binDir}`);
      }
      console.log("cli smoke ok", pkg.version);
    },
  },
  {
    dir: "packages/mcp-audit",
    name: "@behalfid/mcp-audit",
    smoke: async (pkgRoot, ctx) => {
      assertReadmeLicense(pkgRoot);
      importFromInstalled(
        ctx.consumerDir,
        "@behalfid/mcp-audit",
        `if (!('AuditEngine' in mod)) throw new Error('AuditEngine export missing');`
      );
      console.log("mcp-audit smoke ok");
    },
  },
  {
    dir: "packages/mcp-runtime",
    name: "@behalfid/mcp-runtime",
    smoke: async (pkgRoot, ctx) => {
      assertBin(pkgRoot, "behalfid-mcp-runtime", "dist/cli.js");
      assertShebang(join(pkgRoot, "dist/cli.js"));
      assertReadmeLicense(pkgRoot);
      importFromInstalled(
        ctx.consumerDir,
        "@behalfid/mcp-runtime",
        `if (!('McpRuntime' in mod)) throw new Error('McpRuntime export missing');`
      );
      console.log("mcp-runtime smoke ok");
    },
  },
  {
    dir: "packages/install",
    name: "@behalfid/install",
    smoke: async (pkgRoot, ctx) => {
      assertBin(pkgRoot, "behalf-install", "dist/cli.js");
      assertShebang(join(pkgRoot, "dist/cli.js"));
      assertReadmeLicense(pkgRoot);
      if (!existsSync(join(pkgRoot, "INSTALL_FOR_AI.md"))) {
        throw new Error("INSTALL_FOR_AI.md missing from packed install package");
      }
      if (!existsSync(join(pkgRoot, "spec"))) {
        throw new Error("spec/ missing from packed install package");
      }
      const help = spawnSync(process.execPath, [join(pkgRoot, "dist/cli.js"), "--help"], {
        cwd: pkgRoot,
        encoding: "utf8",
      });
      if (help.status !== 0) throw new Error(help.stderr || "install --help failed");
      const binPath = join(
        ctx.binDir,
        process.platform === "win32" ? "behalf-install.cmd" : "behalf-install"
      );
      if (!existsSync(binPath) && !existsSync(join(ctx.binDir, "behalf-install"))) {
        throw new Error(`behalf-install bin not installed under ${ctx.binDir}`);
      }
      console.log("install smoke ok");
    },
  },
  {
    dir: "packages/egress-proxy",
    name: "@behalfid/egress-proxy",
    smoke: async (pkgRoot, ctx) => {
      assertBin(pkgRoot, "behalfid-egress-proxy", "dist/cli.js");
      assertShebang(join(pkgRoot, "dist/cli.js"));
      assertReadmeLicense(pkgRoot);
      importFromInstalled(
        ctx.consumerDir,
        "@behalfid/egress-proxy",
        `if (!mod || typeof mod !== 'object') throw new Error('egress-proxy exports missing');`
      );
      console.log("egress-proxy smoke ok");
    },
  },
  {
    dir: "packages/github-action",
    name: "@behalfid/github-action",
    private: true,
    smoke: async () => {
      const dist = join(REPO_ROOT, "packages/github-action/dist/index.js");
      if (!existsSync(dist)) throw new Error("github-action dist/index.js missing — run build");
      const actionYml = join(REPO_ROOT, "packages/github-action/action.yml");
      const yml = readFileSync(actionYml, "utf8");
      if (!yml.includes("main: 'dist/index.js'") && !yml.includes('main: "dist/index.js"')) {
        throw new Error("action.yml main entry mismatch");
      }
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, "packages/github-action/package.json"), "utf8")
      );
      if (!pkg.private) throw new Error("github-action must remain private (not npm-published)");
      console.log("github-action smoke ok", pkg.version, "(private action)");
    },
  },
];

function assertBin(pkgRoot, binName, relativePath) {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  if (!pkg.bin || pkg.bin[binName] !== relativePath) {
    throw new Error(`bin.${binName} expected ${relativePath}, got ${JSON.stringify(pkg.bin?.[binName])}`);
  }
  if (!existsSync(join(pkgRoot, relativePath))) {
    throw new Error(`bin target missing: ${relativePath}`);
  }
}

function assertShebang(file) {
  const head = readFileSync(file, "utf8").slice(0, 48);
  if (!head.startsWith("#!/usr/bin/env node")) {
    throw new Error(`${file} missing node shebang`);
  }
}

function assertReadmeLicense(pkgRoot) {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  if (!pkg.license) throw new Error("missing license field in package.json");
  if (!existsSync(join(pkgRoot, "README.md"))) throw new Error("README.md missing from package");
  if (!pkg.engines?.node) throw new Error("missing engines.node");
}

function packPackage(pkgDir, outDir) {
  const r = spawnSync("npm", ["pack", "--pack-destination", outDir, "--silent"], {
    cwd: pkgDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `npm pack failed in ${pkgDir}`);
  const tgz = readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
  if (!tgz.length) throw new Error(`no tarball produced for ${pkgDir}`);
  return join(outDir, tgz.sort().at(-1));
}

async function main() {
  console.log("pack-smoke: starting");
  console.log(`node: ${process.version}`);
  let failed = 0;

  for (const entry of PACKAGES) {
    const pkgDir = join(REPO_ROOT, entry.dir);
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      console.error(`FAIL ${entry.name}: package.json missing`);
      failed++;
      continue;
    }
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    console.log(`\n== ${pkg.name}@${pkg.version} ==`);

    if (entry.private || pkg.private) {
      try {
        await entry.smoke();
        console.log(`PASS ${pkg.name} (private)`);
      } catch (err) {
        console.error(`FAIL ${pkg.name}:`, err.message || err);
        failed++;
      }
      continue;
    }

    // Ensure build artifacts exist for pack.
    if (pkg.files?.includes("dist") && !existsSync(join(pkgDir, "dist"))) {
      console.error(`FAIL ${pkg.name}: dist/ missing — build first`);
      failed++;
      continue;
    }

    const work = mkdtempSync(join(tmpdir(), "behalf-pack-smoke-"));
    try {
      const packDir = join(work, "pack");
      mkdirSync(packDir);
      const tgz = packPackage(pkgDir, packDir);
      console.log(`  packed ${tgz}`);

      const consumer = join(work, "consumer");
      mkdirSync(consumer);
      writeFileSync(
        join(consumer, "package.json"),
        JSON.stringify({ name: "smoke-consumer", private: true, type: "module" }, null, 2)
      );
      const install = spawnSync("npm", ["install", tgz, "--no-package-lock"], {
        cwd: consumer,
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      if (install.status !== 0) {
        throw new Error(install.stderr || install.stdout || "consumer npm install failed");
      }

      const installedRoot = join(consumer, "node_modules", ...pkg.name.split("/"));
      if (!existsSync(installedRoot)) {
        throw new Error(`installed package root missing: ${installedRoot}`);
      }

      await entry.smoke(installedRoot, {
        consumerDir: consumer,
        binDir: join(consumer, "node_modules", ".bin"),
      });
      console.log(`PASS ${pkg.name}`);
    } catch (err) {
      console.error(`FAIL ${pkg.name}:`, err.message || err);
      failed++;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  if (failed) {
    console.error(`\npack-smoke: FAILED (${failed})`);
    process.exit(1);
  }
  console.log("\npack-smoke: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
