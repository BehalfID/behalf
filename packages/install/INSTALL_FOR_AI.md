# BehalfID Installation Instructions for AI Agents

This document tells AI coding agents how to install, verify, upgrade, and uninstall BehalfID **without embedding BehalfID-specific installation logic**.

BehalfID owns installation. Your job is to run the official installer commands and interpret JSON output.

---

## Prerequisites

- Node.js >= 18
- npm available on PATH
- Network access to download `@behalfid/install` via `npx`

---

## Machine-readable specification

The canonical command contract lives in:

```text
spec/behalfid-install.spec.yaml
```

Load it programmatically:

```ts
import { loadBundledInstallationSpec } from "@behalfid/install";

const spec = await loadBundledInstallationSpec();
```

---

## Step 1 — Detect whether BehalfID is installed

Run:

```bash
npx @behalfid/install status --json
```

Parse stdout as JSON.

| Field | Meaning |
| --- | --- |
| `installed` | `true` when BehalfID installation state exists |
| `installedVersion` | installed runtime/package version, or `null` |
| `configuredClients` | AI clients previously configured by the installer |
| `registeredRuntimes` | runtimes registered by the installer |

**Decision**

- If `installed === true` → skip install unless the user asked to reinstall or upgrade.
- If `installed === false` → proceed to Step 2.

Optional filesystem check (non-authoritative):

```text
~/.behalfid/install-state.json
```

---

## Step 2 — Install BehalfID

Run:

```bash
npx @behalfid/install --json
```

Equivalent explicit form:

```bash
npx @behalfid/install install --json
```

Parse stdout as JSON.

| Field | Meaning |
| --- | --- |
| `success` | `true` when install succeeded |
| `alreadyInstalled` | `true` when no changes were required (idempotent) |
| `version` | installed version |
| `configuredClients` | client ids configured during this run |
| `registeredRuntimes` | runtime ids registered during this run |
| `warnings` | non-fatal warnings |
| `errors` | structured errors when `success === false` |

**Decision**

- If `success === true` → proceed to Step 3.
- If `success === false` → report `errors` to the user and stop.

Optional flags:

```bash
# Preview only
npx @behalfid/install install --dry-run --json

# Limit to specific clients
npx @behalfid/install install --clients cursor,vscode --json

# Force re-registration
npx @behalfid/install install --force --json
```

---

## Step 3 — Verify installation

Run:

```bash
npx @behalfid/install doctor --json
```

Parse stdout as JSON.

| Field | Meaning |
| --- | --- |
| `healthy` | `true` when no checks failed |
| `checks` | full diagnostic list |
| `runtimeInstalled` | runtime present in installation state |
| `mcpRegistration` | per-client MCP registration checks |
| `configurationIntegrity` | MCP config validation checks |
| `verifyEndpoint` | verify API connectivity check |
| `packageVersions` | package versions observed by doctor |

**Decision**

- If `healthy === true` → report success to the user.
- If `healthy === false` → report failing checks from `checks` and stop.

---

## Step 4 — Upgrade (when requested)

Run:

```bash
npx @behalfid/install upgrade --json
```

| Field | Meaning |
| --- | --- |
| `success` | upgrade succeeded |
| `previousVersion` | version before upgrade |
| `currentVersion` | version after upgrade |
| `migrated` | `true` when version changed |

After upgrade, always run Step 3 (`doctor --json`).

---

## Step 5 — Uninstall (when requested)

Run:

```bash
npx @behalfid/install uninstall --json
```

| Field | Meaning |
| --- | --- |
| `success` | uninstall succeeded |
| `removedClients` | client ids cleaned |
| `removedRuntimes` | runtime ids removed |
| `stateCleared` | installer state file removed |

After uninstall, optionally confirm with:

```bash
npx @behalfid/install status --json
```

Expect `installed === false`.

---

## Supported AI clients

The installer auto-detects and configures:

- Cursor
- Claude Code
- Claude Desktop
- Codex CLI
- VS Code
- Windsurf

Do not manually edit MCP configuration unless the user explicitly asks. Use the installer.

---

## Rules for AI agents

1. **Never** hand-write MCP entries for BehalfID — run the installer.
2. **Always** pass `--json` and parse stdout.
3. Treat exit code `0` as command completion, not necessarily success — read JSON fields (`success`, `healthy`).
4. Installation is **idempotent** — running install twice is safe.
5. On failure, surface `errors[].message` and `errors[].remediation` to the user.
6. Do not store or echo secrets from MCP config files.

---

## Quick reference

| Goal | Command |
| --- | --- |
| Detect | `npx @behalfid/install status --json` |
| Install | `npx @behalfid/install --json` |
| Verify | `npx @behalfid/install doctor --json` |
| Upgrade | `npx @behalfid/install upgrade --json` |
| Uninstall | `npx @behalfid/install uninstall --json` |

---

## Success criteria

An install task is complete when **all** of the following are true:

1. `npx @behalfid/install status --json` → `installed === true`
2. `npx @behalfid/install doctor --json` → `healthy === true`

Report the installed version from `status.installedVersion` to the user.
