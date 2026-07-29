# Scoped agent activation — readiness report

**Branch:** `feature/scoped-agent-activation`  
**Date:** 2026-07-28  
**Final status:** `READY FOR MERGE WITH DOCUMENTED ENVIRONMENT LIMITATIONS`

## Final status

`READY FOR MERGE WITH DOCUMENTED ENVIRONMENT LIMITATIONS`

Publication status: **NOT PUBLISHED**  
Merge status: **NOT MERGED**  
Tag status: **NOT TAGGED**

Limitations that remain environmental (not blocking merge):

1. Live Cursor / Claude Code / Codex **GUI** sessions were not interactively driven (would hang automation). Interactive prompt UX was validated via **fake-TTY arrow-key `select()`** plus **fixture-binary `launchTool`** for all three agents.
2. Symlink tests skip with reason when the OS denies symlink/junction creation (`EPERM`).
3. CLI `0.2.16` release candidate is packed and verified locally but **not published**.

## Architecture verified

| Area | Result |
|------|--------|
| Central resolver | Yes |
| Persistence (atomic `protection.json`) | Yes |
| Path containment (canonicalize / realpath) | Yes |
| Session propagation | Yes — well-formed `actsess_*` + `ENABLED=1` only; cannot downgrade stronger scopes |
| Precedence | Yes |
| Noninteractive default-on | Yes |

## Interactive validation

Method legend: **fixture wrapper** = real `launchTool` / prompt code with fixture agent binary + mocked spawn; **fake-TTY** = real arrow-key `select()` renderer; **resolver-only** = not used as sole evidence for launch paths.

| Integration | Wrapper | PTY/prompt | Choices | Child launch | Env | Args | Exit code | Method |
|-------------|---------|------------|---------|--------------|-----|------|-----------|--------|
| Cursor | Yes | Yes | repo / not-now / session / timed / required | Yes | Yes | Yes | Yes | fixture wrapper + fake-TTY transcript |
| Claude Code | Yes | Yes | same | Yes | Yes | Yes | Yes | fixture wrapper + fake-TTY transcript |
| Codex | Yes | Yes | same | Yes | Yes | Yes | Yes | fixture wrapper + fake-TTY transcript |

Transcripts: `artifacts/scoped-activation/pty/`

Real GUI executables: present on PATH in this environment but **not** launched interactively.

## Filesystem validation

| Case | Result |
|------|--------|
| Nested inheritance | PASS |
| Deceptive siblings (`project-old`, `project2`) | PASS |
| Symlink to repo root (junction/symlink) | PASS when OS allows; skip on EPERM |
| Symlink escape outside protected root | PASS — no inheritance via textual path |
| Broken symlink | PASS — not treated as inside |
| Git standard repo | PASS |
| Linked git worktree (`.git` file) | PASS — activation keyed by **canonical worktree path** |
| Nested git repo override | PASS |
| Deleted worktree path | PASS — elsewhere prompts again |

## Tooling (ESLint)

| Check | Result |
|-------|--------|
| Touched-file eslint | **PASS** (`--max-warnings 0`) |
| Root cause | Pre-existing: root override `brace-expansion: ^5.0.8` broke `minimatch@3` (`require('brace-expansion')` expected a function; v5 exports `{ expand }`). Reproduced on `main` worktree. |
| Fix | `minimatch@3` → `npm:minimatch@10.2.5` while keeping `brace-expansion: ^5.0.8` (0 audit vulns) |
| `npm audit` | **0 vulnerabilities** |

## Release candidate

| Field | Value |
|-------|--------|
| Package | `@behalfid/cli` |
| Version | `0.2.16` |
| Tarball | `artifacts/scoped-activation/release-candidate/behalfid-cli-0.2.16.tgz` |
| SHA-256 | `900948A49F316A4D951E9FACA1FDDD4E3DA4A4B560E53CD4ED77AFC44E41DDCD` |
| Installed `--version` | `0.2.16` |
| `protection --help` | lists status/enable/disable/reset/list |
| Package integrity | **OK** (local 0.2.16 > published 0.2.15 — PENDING publish) |
| Publication | **NOT PUBLISHED** |

## Automated tests

| Command | Result |
|---------|--------|
| `npm run build:cli` | PASS |
| Protection + managed + run-gate + version/artifact suite | **118 passed**, 1 skipped |
| `npm run check:package-integrity` | PASS |
| `npm run test:pack-smoke` | PASS |
| Touched-file eslint | PASS |
| Scenario harness `validate-scoped-activation.mjs` | 18/18 (prior) |
| Root Next production build | **Not run** (no app changes) |

## Security findings

| Attempt | Outcome |
|---------|---------|
| Bare `BEHALFID_ENABLED=0/1` | Ignored without well-formed session id |
| Malformed / short / non-`actsess_` session ids | Ignored |
| Well-formed session + `ENABLED=0` vs always-on | Cannot downgrade |
| Well-formed session + `ENABLED=0` vs repository | Cannot downgrade |
| Required + `--no-behalf` / spoofed session disable | Cannot bypass |
| Symlink escape | Canonical realpath — no false inheritance |
| Deceptive path prefix | Rejected |
| Bad durations | Rejected |
| Malformed protection.json | Backup + warning |

**Trust model:** `BEHALFID_SESSION_ID` is **correlation**, not authentication. Only launcher-shaped `actsess_*` ids with `ENABLED=1` activate session scope; disable via env cannot weaken stronger scopes.

## Git

- **Branch:** `feature/scoped-agent-activation`
- **Working tree:** clean
- **Merge:** NOT MERGED
- **Release/tag/publish:** NOT PUBLISHED / NOT TAGGED
- **Commits on branch (`main..HEAD`):**
  - `ebdba78` Add scoped activation resolver and persistence
  - `a3af426` Document CLI protection activation scopes
  - `354cd0d` Wire scoped activation into CLI commands and agent launches
  - `3ce7905` Add tests for scoped agent activation
  - `6050e96` Fix protection docs to match shipped CLI commands
  - `608102b` fix(cli): require session id with BEHALFID_ENABLED
  - `86ade24` docs: add scoped agent activation readiness report
  - `b454783` fix(cli): harden scoped activation environment handling
  - `082c045` test(cli): validate interactive protection prompts through pty
  - `97f4907` test(cli): cover symlink, git worktree, and session spoof activation
  - `28b2c77` fix(tooling): restore scoped activation lint validation
  - `bc3dd3b` chore(cli): prepare 0.2.16 release candidate
  - `3db186d` docs(cli): finalize scoped activation readiness report
