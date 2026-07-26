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

Node engines: packages declare `>=18` (action runtime `node20`). Monorepo app
root requires `>=22.12.0` for the Next.js app — that does **not** raise the
published package engines.

---

## Recommended release order

1. **`@behalfid/sdk@0.2.3`** — no workspace deps; already used by consumers.
2. **`@behalfid/mcp-audit@0.1.0`** — first publish (if shipping MCP suite).
3. **`@behalfid/mcp-runtime@0.1.0`** — first publish; needed before install.
4. **`@behalfid/egress-proxy@0.1.0`** — first publish; needed before CLI optional.
5. **`@behalfid/cli@0.2.15`** — after egress-proxy if advertising egress features.
6. **`@behalfid/install@0.1.0`** — after mcp-runtime (optionalDependency).
7. **`@behalfid/github-action`** — tag/ref release of the Action (not npm);
   rebuild `dist/` with `npm run build -w @behalfid/github-action` before tagging.

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

### GitHub Action

1. Move the major/minor tag (e.g. `v1`) back to the previous known-good commit
   **only** with explicit approval (this rewrites floating tags).
2. Prefer cutting `v1.0.1` (immutable tag) and updating docs to the new tag.

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
