# Package & release integrity checklist

**Scope:** npm packages under `packages/*` plus the private GitHub Action.
**Constraint for this phase:** prepare only — **do not** `npm publish`, create
GitHub Releases, deploy, push, or merge until an explicit human publish step.
That explicit step was completed for `@behalfid/sdk@0.2.3` and
`@behalfid/cli@0.2.15` on 2026-07-26; the remaining packages stay prepare-only.

Related scripts (run from repo root after `npm ci` and package builds):

```bash
npm run build -w @behalfid/sdk -w @behalfid/mcp-audit -w @behalfid/mcp-runtime \
  -w @behalfid/install -w @behalfid/egress-proxy -w @behalfid/cli -w @behalfid/github-action
node scripts/release/check-package-integrity.mjs
node scripts/release/pack-smoke.mjs
node scripts/release/verify-cli-package-metadata.mjs packages/cli/package.json <version> BehalfID/behalf
node scripts/release/verify-cli-artifact.mjs <path-to-cli.tgz> <version>
```

`check-package-integrity` LF-normalizes text file contents (`.md`, `.js`, …) before
hashing so Windows CRLF checkouts do not false-fail against LF npm tarballs; real
content and file-inventory drift still fail. Markdown is also pinned to LF via
`.gitattributes` (`*.md text eol=lf`).

---

## Inventory (this branch)

| Package | Local version | npm status | Notes |
| --- | --- | --- | --- |
| `@behalfid/sdk` | **0.2.3** | published **0.2.3** (current) | Published with npm provenance; rejected 0.2.2 tag remains immutable |
| `@behalfid/cli` | **0.2.15** | published **0.2.15** (current) | Latest CLI banner fix released to npm, GitHub, and Homebrew |
| `@behalfid/mcp-audit` | 0.1.0 | **unpublished** | Preview docs only |
| `@behalfid/mcp-runtime` | 0.1.0 | **unpublished** | Preview docs only |
| `@behalfid/install` | 0.1.0 | **unpublished** | Preview docs only; optional dep on mcp-runtime |
| `@behalfid/egress-proxy` | 0.1.0 | **unpublished** | Preview docs only; optional dep of CLI |
| `@behalfid/github-action` | 1.0.0 | **private** (not npm) | Distributed via `action.yml` + `dist/` |

---

## Dependency relationships

```
@behalfid/sdk              (standalone)
@behalfid/mcp-audit        (standalone)
@behalfid/mcp-runtime      (standalone; injectable verify client may wrap SDK at runtime)
@behalfid/egress-proxy    (standalone)
@behalfid/cli              optionalDependencies → @behalfid/egress-proxy@*
@behalfid/install          optionalDependencies → @behalfid/mcp-runtime@*
@behalfid/github-action    private; no workspace npm deps
```

Publish optional dependency **targets** before (or in the same wave as) their
dependents so first-time installs do not warn on missing optionals.

**Controlled unpublished package workflow:** `.github/workflows/package-release.yml`
(`workflow_dispatch` only; allowlist `mcp-audit` → `mcp-runtime` →
`egress-proxy` → `install`). Do not use it for SDK or CLI.

Node engines: packages declare `>=18` (action runtime `node20`). Monorepo app
root requires `>=22.12.0` for the Next.js app — that does **not** raise the
published package engines.

### Dependency advisory overrides (why)

Prefer compatible lockfile resolution. These root / install / example overrides
exist only where ranges cannot admit a fixed release:

| Override | Where | Why |
| --- | --- | --- |
| `brace-expansion: ^5.0.8` | root + `packages/install` | GHSA-mh99 has **no 1.x patch**; eslint’s `minimatch@3` still requests `^1.1.7`. Compatible CJS API; avoids eslint 10 major upgrade. |
| `esbuild: 0.28.1` (+ keep `@esbuild-kit/core-utils.esbuild: ^0.25.0`) | root + `packages/install` | `tsup@8.5` requests `^0.27.0` (excludes 0.28.1). Pin 0.28.1 for GHSA-g7r4; keep esbuild-kit on 0.25.x. Install also lists `esbuild@0.28.1` as a direct devDependency so the workspace lock cannot stick on 0.27.7. |
| `postcss: ^8.5.18` | root + example | Transitive via Next; keep patched PostCSS without unrelated majors. |
| `sharp: ^0.35.0` | root + example | `next@16.2.x` still optionalDepends on `sharp@^0.34.5`, which excludes 0.35.0. Override required for GHSA-f88m. sharp 0.35 / Next 16.2.11 both require Node `>=20.9.0` (example engines raised accordingly; monorepo root remains `>=22.12.0`). |

---

## Recommended release order

1. **`@behalfid/sdk@0.2.3`** — no workspace deps; already published (sdk-release.yml).
2. **`@behalfid/mcp-audit@0.1.0`** — first publish via package-release.yml (if shipping MCP suite).
3. **`@behalfid/mcp-runtime@0.1.0`** — first publish; needed before install.
4. **`@behalfid/egress-proxy@0.1.0`** — first publish; needed before CLI optional / advertising egress.
5. **`@behalfid/cli@0.2.15`** — already published (cli-release.yml); after egress-proxy if advertising egress features on a later CLI bump.
6. **`@behalfid/install@0.1.0`** — after mcp-runtime (optionalDependency).
7. **`@behalfid/github-action`** — Action tag/ref release (not npm); use an
   `action-v*` namespace (see tag isolation below). Rebuild `dist/` with
   `npm run build -w @behalfid/github-action` before tagging.

Skip unpublished packages in a wave if product is not ready; keep README
**Preview / unreleased** banners until their first publish.

---

## Pre-publish gates (each package)

- [ ] `npm run build -w <package>` succeeds
- [ ] `node scripts/release/check-package-integrity.mjs` reports PENDING or OK (never same-version drift)
- [ ] `node scripts/release/pack-smoke.mjs` PASS for the package
- [ ] Tarball contains expected `files`, `README.md`, `license` field, `engines.node`
- [ ] Bin packages: shebang on CLI entry + `--help` / `--version` where applicable
- [ ] No secrets (`.env`, credentials) inside `npm pack` listing
- [ ] Changelog / release notes drafted for humans
- [ ] For CLI: `verify-cli-package-metadata.mjs` + `verify-cli-artifact.mjs`

---

## Rollback plan (document only — execute only with explicit approval)

### npm packages already published (sdk, cli)

1. **Do not unpublish** unless within npm’s unpublish window and legally required;
   prefer `npm deprecate <pkg>@<bad> "message"` pointing to the last good version.
2. Publish a **forward fix** (`0.2.4` / `0.2.16`, etc.) that restores behavior.
3. If a bad version is critically broken, deprecate it immediately and pin docs /
   install instructions to the last good version.
4. Homebrew / standalone CLI binaries (if shipped for that version): publish
   corrected binaries and update formula SHAs via existing
   `scripts/release/render-homebrew-formula.mjs` flow — never rewrite history of
   already-downloaded artifacts silently.

### First-time publishes (mcp-*, install, egress-proxy)

1. If the first `0.1.0` is bad and still within npm unpublish policy **and**
   no meaningful external dependents exist, unpublish may be considered —
   otherwise deprecate and ship `0.1.1`.
2. Revert README “published” install commands back to **Preview / unreleased**
   if the package is withdrawn.

### GitHub Action — tag isolation (do not release Action in this wave)

`cli-release.yml` triggers on `v*` tags (`^v[0-9]+\.[0-9]+\.[0-9]+$`). Floating
or semver Action tags such as `v1` / `v1.0.0` would therefore match the CLI
release workflow. **Do not** create, move, or reuse those tags for the Action
while that contract remains.

Safe future options (document only — not executed here):

1. **Preferred namespace:** publish Action refs under `action-v1` /
   `action-v1.0.0` (or similar `action-v*` prefix) so they cannot satisfy the
   CLI `v*` filter.
2. **Alternative:** add a separately scoped Action workflow with its own tag
   pattern and leave CLI on `v*`.

Until one of those lands, consumers should pin the Action to a commit SHA or
an explicitly non-`v*` ref. Do **not** silently change the CLI release tag
contract in this phase.

Rollback notes if an Action tag is ever cut under a safe namespace:

1. Prefer cutting a new immutable `action-v1.0.1` (or equivalent) and updating
   docs to the new tag rather than moving floating majors.
2. Never move `sdk-v*`, `v0.2.15`, or other published CLI/SDK tags.

### Workspace consumers

1. Optional deps failing to resolve is non-fatal; document fallbacks
   (`BEHALFID_EGRESS_PROXY_CLI`, local `node packages/.../dist/cli.js`).
2. After rollback, re-run `check-package-integrity.mjs` and `pack-smoke.mjs`.

---

## Explicit non-goals for this checklist run

- No `npm publish`
- No GitHub Release creation
- No production deploy
- No secret or production data access
