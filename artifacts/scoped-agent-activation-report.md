# Scoped agent activation — readiness report

**Branch:** `feature/scoped-agent-activation`  
**Date:** 2026-07-28  
**Status:** `READY WITH LIMITATIONS`

## Status

`READY WITH LIMITATIONS`

All automated gates required for this feature pass (CLI build, protection/managed/run-gate tests, package-integrity after CLI `0.2.16` bump, pack-smoke, scenario harness). Interactive GUI launches of Cursor / Claude Code / Codex were **not** driven through a live TTY prompt in this environment; launch wiring for all three was validated via `launchTool` dry-run with captured child env/args, plus unit/integration tests.

## Architecture verified

| Area | Verified | Notes |
|------|----------|-------|
| Central resolver | Yes | `resolveActivation` / `resolveLaunchActivation` — single precedence path |
| Persistence | Yes | Atomic `~/.behalf/protection.json`; sessions env-only |
| Path containment | Yes | `path.relative` / canonicalize — not string prefix |
| Session propagation | Yes | `BEHALFID_SESSION_ID` + `BEHALFID_ENABLED` (+ mode/root) |
| Precedence | Yes | required → managed → flags → repo → timed → session → always → prompt / CI default-on |
| Noninteractive fallback | Yes | No hang; default-on for unresolved agent launches |

## Defects found during final validation

1. **Security:** Bare `BEHALFID_ENABLED=0` (without `BEHALFID_SESSION_ID`) could bypass always-on because it was treated as a weak session signal before always-on in precedence.  
   **Fix:** Require both env vars for session activation (`608102b`).
2. **Package integrity:** Local CLI content differed from published `@behalfid/cli@0.2.15`.  
   **Fix:** Bump to `0.2.16` (pending publish).
3. **Docs drift:** Precedence text still mentioned `BEHALFID_ENABLED` alone; aligned with the fix.

## Automated validation

| Command | Result | Counts / notes |
|---------|--------|----------------|
| `npm run build:cli` | PASS | `tsc` for `@behalfid/cli@0.2.16` |
| `npx vitest run` protection + managed + run-gate + standalone version | PASS | **90 passed**, 1 skipped (Linux-only bun binary) |
| Broader `test/cli-*.test.ts` suite (20 files) | PASS with flake | 224 passed; 2 session-policy route tests timed out once under load; **re-ran in isolation on branch: 26/26 PASS**; same tests PASS on `main` in isolation → treated as load flake, not branch regression |
| `npm run check:package-integrity` | PASS | CLI `0.2.16` > published `0.2.15` (PENDING publish) |
| `npm run test:pack-smoke` | PASS | pack-smoke: OK |
| `npx vitest run test/verify-cli-artifact.test.ts` | PASS | 2/2 |
| `npx eslint` on touched CLI paths | TOOLING FAIL | Pre-existing `Minimatch.braceExpand` / `expand is not a function` in ESLint 9.39.4 stack — not introduced by this branch |
| Root `next build` | NOT RUN | No app/Next changes on this branch |

## Manual / scenario validation (A–H)

Harness: `node scripts/dev/validate-scoped-activation.mjs` → **18/18 PASS**.  
Agent dry-run: `node scripts/dev/launch-dry-run-agents.mjs` (fake spawn; real `launchTool` path).

| Scenario | Result | Evidence |
|----------|--------|----------|
| A Repository + nested inheritance | PASS | Nested `src/api` → mode `repository`, status JSON enabled; root = project |
| B Sibling isolation | PASS | `project-old` / `project2` → `shouldPrompt=true` |
| C Not now | PASS | Re-prompts; not persisted |
| D Timed + expiry | PASS | Active at +30m; prompts after +90m (injected clock) |
| E Always-on | PASS | Unrelated repo activates without prompt |
| F Session | PASS | Env set; survives cwd change; does not persist after env cleared |
| G Required Managed Profile | PASS | `--no-behalf` + disabled repo + spoofed env still enabled/`managed-profile` |
| H Noninteractive | PASS | `protection status --json` exit 0 in 410ms; default-on without prompt |

### Interactive GUI prompt

**Not testable** in this run: opening live Cursor / Claude / Codex GUIs and answering the arrow-key prompt would hang the automation environment. Prompt UX is covered by unit tests (`select` mock) and the interactive `shouldPrompt` resolver path.

## Integration matrix

| Integration | Automated | Manual (GUI) | Result | Limitation |
|-------------|----------:|-------------:|--------|------------|
| Cursor | Yes (`launchTool` + launch tests + dry-run) | No live TTY/GUI | PASS (wiring) | Binary on PATH (`cursor.cmd`); GUI not interactively prompted |
| Claude Code | Yes (same + PreToolUse install observed in dry-run) | No live TTY/GUI | PASS (wiring) | Binary on PATH; GUI not interactively prompted |
| Codex | Yes (same + hooks/MCP install observed in dry-run) | No live TTY/GUI | PASS (wiring) | Binary on PATH; GUI not interactively prompted |

Dry-run results (all three): `enabled=1`, `mode=session`, session id present, `--behalf` stripped, `--keep-arg xyz` preserved, exit `0`.

## Security review

| Attempt | Outcome |
|---------|---------|
| Deceptive prefix (`project` vs `project-old` / `project2`) | Rejected |
| Nested inheritance | Accepted |
| `..` normalization | Contained correctly |
| Negative / huge / shell-like duration (`-1h`, `9999d`, `$(reboot)`) | Rejected |
| Malformed `protection.json` | Backup + warning; no silent destroy |
| Bare `BEHALFID_ENABLED=0` vs always-on | **Fixed** — cannot bypass |
| Required + `--no-behalf` / disabled repo / env spoof | Cannot bypass |
| Launch flag stripping / no shell interpolation | Args passed as argv array to `spawn`/`spawnSync` |

Local audit log only (`protection-events.jsonl`); secret-like keys denied in audit writer.

## Documentation verification

Compared `docs/CLI_PROTECTION_SCOPES.md` and `behalf protection --help` / `enable --help`:

- Commands match: `status`, `enable`, `disable`, `list`, `reset` (no `remove-repository`)
- Flags: `--session`, `--for`, `--repository`, `--always`
- Launch flags: `--behalf`, `--no-behalf`, `--behalf-for`, `--behalf-repository`
- Session env docs updated to require both variables

## Git state

**Branch:** `feature/scoped-agent-activation` (clean after report commit)

**Commits (`main..HEAD`):**

1. `ebdba78` — Add scoped activation resolver and persistence  
2. `a3af426` — Document CLI protection activation scopes  
3. `354cd0d` — Wire scoped activation into CLI commands and agent launches  
4. `3ce7905` — Add tests for scoped agent activation  
5. `6050e96` — Fix protection docs to match shipped CLI commands  
6. `608102b` — fix(cli): require session id with BEHALFID_ENABLED  

## Limitations

1. **No live interactive prompt** against real Cursor / Claude / Codex GUIs in this validation pass.  
2. **CLI not yet published** — integrity is PENDING at `0.2.16` until release workflow publishes.  
3. **ESLint invocation** on touched paths fails due to existing Minimatch tooling error in the workspace.  
4. **Symlink escape / Git worktree** path cases: containment uses `realpathSync` when paths exist; dedicated worktree/symlink matrix was not run as separate OS fixtures beyond canonicalize behavior.  
5. **Antigravity** is not in `MANAGED_TOOLS` — out of scope / N/A.

## Conclusion

Implementation is merge-ready from an automated and harness perspective, with explicit environment limitations on live IDE GUI prompting. Marked **READY WITH LIMITATIONS** (not `READY`) solely because Cursor / Claude Code / Codex were not manually interactively prompted end-to-end.
