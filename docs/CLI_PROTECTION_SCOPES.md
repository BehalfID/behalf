# CLI protection activation scopes

When you start a supported coding agent through BehalfID, the CLI decides whether
**BehalfID protection** is already enabled for the current context. If nothing
applies yet, an interactive prompt asks you to choose a scope. That choice is
remembered and applied automatically on later launches.

Protection means verifying agent actions against your permissions and, when
policy requires it, asking for approval before sensitive actions run.

## Preferred prompt copy

Interactive launches use this wording:

```text
Enable BehalfID protection?

BehalfID verifies AI-agent actions against your permissions and can require approval before sensitive actions execute.

❯ For this session
  For a limited time
  For this repository
  Always enable
  Not now
```

Arrow keys move the selection; Enter confirms. On non-TTY stdin, the CLI falls
back to a numbered list. Ctrl+C cancels.

When you pick **For this repository**, the CLI confirms the detected root:

```text
Enable BehalfID protection for this repository?

~/projects/example

This applies to the repository root and all subdirectories.
```

When you pick **For a limited time**, a second prompt offers **1 hour**,
**4 hours**, **8 hours**, **24 hours**, or **Custom** (for example `30m` or `2h`).

If your organization requires protection, the CLI does **not** offer a bypass:

```text
BehalfID protection is required by your organization for this workspace.
```

## Scopes

| Scope | Prompt label | What it means | Persisted? |
|-------|--------------|---------------|------------|
| **Session** | For this session | Protection stays on for this agent process tree via environment variables. Changing directories mid-session does not drop it. | No — env only |
| **Timed** | For a limited time | Protection stays on until an absolute expiry timestamp. No background daemon is required; expiry is checked at resolve time. | Yes — `~/.behalf/protection.json` |
| **Repository** | For this repository | Protection applies to the repository root and every descendant path under it (path containment). | Yes |
| **Always** | Always enable | Protection is enabled for all local launches (unless a higher-precedence rule disables or org policy overrides). | Yes |
| **Not now** | Not now | Skip protection for **this launch only**. Does not clear saved always / timed / repository decisions. | No |
| **Disabled (repository)** | via `behalf protection disable --repository` | Persistently turn protection **off** for that repository root (and its descendants) until you enable again or reset. | Yes |

### Session vs “Not now” vs persistent disable

- **For this session** — enable now; child processes inherit `BEHALFID_SESSION_ID` and `BEHALFID_ENABLED`.
- **Not now** — decline once. The next interactive launch can prompt again.
- **`disable --repository`** — remember “off” for that repo so later launches in that tree do not prompt and stay unprotected (unless organization / managed-profile policy requires protection).

## How repository inheritance works

Repository decisions use **canonical path containment**, not string prefix matching.

Internally the CLI:

1. Resolves paths to absolute, normalized forms (`canonicalizePath`)
2. Uses `realpath` when the path exists
3. On Windows, normalizes drive-letter case
4. Decides containment with `path.relative` (`isPathInsideOrEqual`)

### Sibling directories are not the same repo

Enabling protection for `project` does **not** cover `project-old`:

| Path | Contained by `…/project`? |
|------|---------------------------|
| `…/project` | Yes |
| `…/project/src/app.ts` | Yes |
| `…/project-old` | **No** |
| `…/project-old/README.md` | **No** |

String-prefix logic would wrongly treat `project-old` as inside `project`. Containment does not.

### Nested repositories can override parents

If both a parent and a nested root have decisions, the **deepest matching root** wins.

Example:

- Parent `~/work/monorepo` → enabled
- Nested `~/work/monorepo/apps/risky` → disabled

Launches under `apps/risky` follow the nested **disabled** decision. Launches under other monorepo paths follow the parent **enabled** decision.

### Path examples by platform

**macOS / Linux**

```text
Repository root:  /Users/alex/src/acme
Covered:          /Users/alex/src/acme/packages/api
Not covered:      /Users/alex/src/acme-old
Not covered:      /Users/alex/src/acme2
```

**Windows**

```text
Repository root:  C:\Users\Alex\src\acme
Covered:          C:\Users\Alex\src\acme\packages\api
Covered:          c:\users\alex\src\acme\README.md   (drive/case normalized)
Not covered:      C:\Users\Alex\src\acme-old
Not covered:      D:\Users\Alex\src\acme             (different drive)
```

## Decision precedence

When a launch resolves activation, rules apply in this order (first match wins):

1. **Organization / required Managed Profile** (`required`) — protection **on**; cannot be bypassed by flags, store, or “Not now”
2. **Managed Profile** (`managed`) — protection **on**; no prompt
3. **Explicit launch flags** (`--behalf`, `--no-behalf`, `--behalf-for`, `--behalf-repository`) — override local preferences only; disable is ignored under required policy
4. **Deepest matching repository decision** (nested or ancestor, via containment) — enabled or disabled
5. **Active timed decision** (not expired; absolute `expiresAt`)
6. **Session environment** (`BEHALFID_SESSION_ID` **and** `BEHALFID_ENABLED` together)
7. **Always enable** (user-wide)
8. **Interactive, unresolved** — show the prompt
9. **Noninteractive / CI, unresolved** — default **on** for agent launches (does not hang; preserves historical `behalf <tool>` behavior)

Organization and Managed Profile policy are authoritative for the managed launch path. Local activation scopes never weaken a `required` decision.

## Timed expiration

Timed activation stores an absolute ISO expiry (for example `2026-07-28T02:00:00.000Z`).

- Durations such as `30m`, `1h`, `4h`, `8h`, and `24h` are converted to that timestamp at enable time
- No daemon watches the clock; each launch (and store read/write) checks expiry and drops expired entries
- After expiry, resolution continues down the precedence list (and may prompt again)

## Session environment propagation

When protection is enabled for a session (or default-on in CI), the child agent process receives:

| Variable | Purpose |
|----------|---------|
| `BEHALFID_SESSION_ID` | Stable id for this activation session (`actsess_…`) |
| `BEHALFID_ENABLED` | `1` when protection is on, `0` when off |
| `BEHALFID_ACTIVATION_MODE` | Active mode (`session`, `timed`, `repository`, `always`, `disabled`, `managed-profile`, …) |
| `BEHALFID_REPOSITORY_ROOT` | Canonical repo root when applicable |

Because these travel with the process environment, **changing the working directory during a session does not drop protection**. Session choices are **not** written to `protection.json`. Resolution only treats an env session as active when **both** `BEHALFID_SESSION_ID` and `BEHALFID_ENABLED` are set — a bare `BEHALFID_ENABLED=0` cannot bypass always-on or other local decisions.

Local decisions that *are* persisted live in `~/.behalf/protection.json`. Optional audit lines go to `~/.behalf/logs/protection-events.jsonl` (no secrets).

## Launch paths

Managed Profiles install shims that call BehalfID before the real tool:

```text
cursor / claude / codex  →  shim  →  behalf __shim-launch <tool> …
```

You can also launch directly:

```bash
behalf cursor
behalf claude
behalf codex
```

Both paths resolve activation and apply enforcement when protection is enabled. Direct `behalf <tool>` launches use the same scoped activation model; Managed Profile shims additionally resolve workspace session policy (`unmanaged` / `managed` / `required`) and that policy takes precedence as above.

See [packages/cli/README.md](../packages/cli/README.md) for Managed Profile install, PATH, and required-mode details.

### Launch flags

On `behalf cursor`, `behalf claude`, `behalf codex`, and `behalf run <tool>`:

| Flag | Effect |
|------|--------|
| `--behalf` | Force enable for this launch (session) |
| `--no-behalf` | Skip protection for this launch (blocked when policy is `required`) |
| `--behalf-for <duration>` | Enable timed protection (for example `--behalf-for 4h`) |
| `--behalf-repository` | Enable for the detected repository root |
| `--behalf-repository <path>` | Enable for an explicit repository path |

Behalf-specific flags are stripped before remaining arguments are forwarded to the agent.

Examples:

```bash
behalf claude --behalf
behalf codex --no-behalf
behalf cursor --behalf-for 4h
behalf claude --behalf-repository
behalf cursor --behalf-repository ~/src/acme -- .
```

## Noninteractive and CI behavior

The CLI does **not** prompt when:

- stdin is not a TTY
- `CI` is set (non-empty, and not `0` / `false`)
- a flag already determines activation
- the resolver sets `shouldPrompt: false` (saved decision, org policy, session env, …)

Unresolved noninteractive agent launches **default to protection on** with a fresh session id so CI and scripts do not hang and historical always-on `behalf <tool>` behavior is preserved.

## Inspect and manage decisions

Commands follow the `behalf protection …` convention.

### Status

```bash
behalf protection status
behalf protection status --cwd /path/to/dir
behalf protection status --json
```

Shows whether protection is active for the current directory (or `--cwd`), why (scope / source), repository root, expiration when timed, and whether organization / Managed Profile enforcement applies.

### Enable

```bash
behalf protection enable --session
behalf protection enable --for 4h
behalf protection enable --repository
behalf protection enable --repository /path/to/repo
behalf protection enable --always
```

| Option | Scope |
|--------|--------|
| `--session` | This session only (env; not stored in `protection.json`) |
| `--for <duration>` | Timed until absolute expiry |
| `--repository` | Detected repository root (optional path) |
| `--always` | User-wide always-on |

### Disable

```bash
behalf protection disable --repository
behalf protection disable --repository /path/to/repo
behalf protection disable --always
```

`--repository` persists a repository **disabled** decision for that root (not the same as **Not now**). `--always` clears the user-wide always-on setting. You can pass both in one invocation.

To clear stored repository decisions entirely (instead of storing an explicit disable), use reset:

```bash
behalf protection reset --repositories
```

That removes all local repository decisions. Organization / Managed Profile remote configuration is never modified.
### List

```bash
behalf protection list
behalf protection list --json
```

Lists stored always / timed / repository decisions without secrets.

### Reset

```bash
behalf protection reset --always
behalf protection reset --timed
behalf protection reset --repositories
behalf protection reset --all
```

Specify at least one of `--always`, `--timed`, `--repositories`, or `--all`. Clears **local** activation decisions only. It never deletes Managed Profile or organization remote configuration. After reset, the next interactive launch can prompt again (unless org policy still requires protection).

## Related documentation

- [CLI — Managed Profiles](../packages/cli/README.md) — shims, session policy, required mode, pause
- [Enforcement architecture](./ENFORCEMENT_ARCHITECTURE.md) — how enforcement tiers relate to coding-agent launches
- [Capability matrix](./CAPABILITY_MATRIX.md) — what is production-supported today
