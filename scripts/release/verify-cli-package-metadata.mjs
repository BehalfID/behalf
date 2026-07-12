#!/usr/bin/env node
/**
 * Fail closed on @behalfid/cli package.json metadata that would break npm
 * provenance or trigger npm bin path auto-correction.
 *
 * Usage:
 *   node scripts/release/verify-cli-package-metadata.mjs \
 *     <path-to-package.json> <expectedVersion> <expectedGitHubRepo>
 *
 * expectedGitHubRepo example: BehalfID/behalf
 * Expected repository.url: git+https://github.com/<expectedGitHubRepo>.git
 */
import { existsSync, readFileSync } from "node:fs";

const pkgPath = process.argv[2];
const expectedVersion = process.argv[3];
const expectedRepo = process.argv[4];

function fail(message) {
  console.error(`verify-cli-package-metadata: ${message}`);
  process.exit(1);
}

if (!pkgPath || !expectedVersion || !expectedRepo) {
  console.error(
    "Usage: node scripts/release/verify-cli-package-metadata.mjs <package.json> <expectedVersion> <expectedGitHubRepo>"
  );
  process.exit(2);
}

if (!existsSync(pkgPath)) {
  fail(`package.json not found: ${pkgPath}`);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
} catch (err) {
  fail(`failed to parse ${pkgPath}: ${err instanceof Error ? err.message : String(err)}`);
}

const expectedUrl = `git+https://github.com/${expectedRepo}.git`;

if (pkg.name !== "@behalfid/cli") {
  fail(`name must be "@behalfid/cli", got ${JSON.stringify(pkg.name)}`);
}

if (pkg.version !== expectedVersion) {
  fail(`version must be ${JSON.stringify(expectedVersion)}, got ${JSON.stringify(pkg.version)}`);
}

if (!pkg.repository || typeof pkg.repository !== "object") {
  fail("repository must be an object");
}

if (pkg.repository.type !== "git") {
  fail(`repository.type must be "git", got ${JSON.stringify(pkg.repository.type)}`);
}

if (pkg.repository.url !== expectedUrl) {
  fail(
    `repository.url must exactly equal ${JSON.stringify(expectedUrl)}, got ${JSON.stringify(pkg.repository.url)}`
  );
}

if (pkg.repository.directory !== "packages/cli") {
  fail(
    `repository.directory must be "packages/cli", got ${JSON.stringify(pkg.repository.directory)}`
  );
}

if (!pkg.bin || typeof pkg.bin !== "object") {
  fail("bin must be an object");
}

if (pkg.bin.behalf !== "dist/index.js") {
  fail(`bin.behalf must be "dist/index.js", got ${JSON.stringify(pkg.bin.behalf)}`);
}

if (pkg.bin.behalfid !== "dist/index.js") {
  fail(`bin.behalfid must be "dist/index.js", got ${JSON.stringify(pkg.bin.behalfid)}`);
}

if (!pkg.engines || typeof pkg.engines !== "object" || !pkg.engines.node) {
  fail("engines.node must be present");
}

if (!pkg.license) {
  fail("license must be present");
}

console.log(`verify-cli-package-metadata: OK`);
console.log(`  name: ${pkg.name}`);
console.log(`  version: ${pkg.version}`);
console.log(`  repository.url: ${pkg.repository.url}`);
console.log(`  repository.directory: ${pkg.repository.directory}`);
console.log(`  bin.behalf: ${pkg.bin.behalf}`);
console.log(`  bin.behalfid: ${pkg.bin.behalfid}`);
