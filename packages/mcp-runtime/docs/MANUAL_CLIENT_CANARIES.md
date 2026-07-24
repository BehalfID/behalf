# Manual real-client canaries

**Status:** Live steps are **PENDING**. Automated protocol + installer tests in
this package / `@behalfid/install` do **not** substitute for the evidence below.

Do not mark any client as production-supported until its live evidence row is
filled with real captures from that host. Invented or simulated “live” results
are forbidden.

---

## Enforcement vs advisory (read before running)

| Surface | Package / entry | Guarantee |
|---------|-----------------|-----------|
| Config audit | `@behalfid/mcp-audit` | Read-only findings only |
| Advisory MCP tools | `@behalfid/cli` (`verify_action`) | Cooperative; agent can skip |
| **Fail-closed interceptor** | **`@behalfid/mcp-runtime`** | Tool call cannot reach downstream without allow |

These canaries validate the **interceptor** path only (`npx @behalfid/mcp-runtime`
or `npx @behalfid/install install --wrap …`).

---

## Shared prerequisites

1. Node.js ≥ 18 available on `PATH`.
2. A real BehalfID agent API key + agent id (never commit them).
3. At least one wrappable stdio MCP server already configured in the client
   (e.g. filesystem), **or** a sibling `behalfid` entry that fronts a downstream.
4. Policy fixtures on the platform:
   - **Allow** rule for a low-risk tool (e.g. `filesystem/read_file` or equivalent).
   - **Deny** rule for a distinct tool (e.g. a write / shell tool).
   - **Approval-required** rule for a third tool.
5. Capture directory: `canary-<client>-<YYYYMMDD>/` (local only; do not commit secrets).

### Required evidence artifacts (every client)

| Artifact | Filename suggestion | Must show |
|----------|---------------------|-----------|
| Pre-install config | `01-config-before.{json,toml}` | Original MCP servers intact |
| Post-install / wrap config | `02-config-after.{json,toml}` | Interceptor env present; unrelated keys preserved |
| Allow attempt | `03-allow.{png,log,json}` | Tool succeeded **and** platform verify log shows allow |
| Deny attempt | `04-deny.{png,log,json}` | Tool did **not** run; client shows DENIED / blocked |
| Approval required | `05-approval-pending.{png,log}` | Tool blocked; approval URL / id visible |
| Approval granted retry | `06-approval-granted.{png,log}` | After approve, retry succeeds; verify consumed grant |
| Approval denied / timeout | `07-approval-denied.{png,log}` | Still blocked; no downstream side effect |
| Network outage | `08-outage.{png,log}` | With verify unreachable (hosts block / bad `BEHALFID_VERIFY_URL`), tool blocked |
| Doctor / status | `09-doctor.txt` | `npx @behalfid/install doctor` output |
| Uninstall restore | `10-config-uninstalled.{json,toml}` | Original servers restored; `behalfid` entry gone |

Also record: client name + version, OS, `@behalfid/mcp-runtime` version,
`@behalfid/install` version, agent id (redact key), wall-clock UTC timestamps.

---

## Per-client procedures (live = PENDING)

### 1. Cursor — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | `~/.cursor/mcp.json` (`mcpServers`) |
| Install | `npx @behalfid/install install --clients cursor --wrap --agent-id … --api-key …` |
| Live evidence | **PENDING** — not captured |

Steps:

1. Copy `01-config-before.json` from `~/.cursor/mcp.json`.
2. Run install with `--wrap`. Capture `02-config-after.json`.
3. Restart Cursor. Confirm MCP servers reconnect.
4. In chat, invoke an **allowed** tool → capture success + dashboard verify row.
5. Invoke a **denied** tool → confirm no side effect (e.g. file not written).
6. Invoke **approval-required** → capture blocked message; approve in dashboard; retry.
7. Deny or let approval time out → capture blocked retry.
8. Point `BEHALFID_VERIFY_URL` at a closed port; reload; confirm fail-closed.
9. Run doctor; uninstall; capture restored config.

### 2. Claude Desktop — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Linux `~/.config/Claude/claude_desktop_config.json`; Windows `%APPDATA%\Claude\claude_desktop_config.json` |
| Format | `mcpServers` JSON |
| Live evidence | **PENDING** — not captured |

Same evidence set as Cursor. Restart Claude Desktop after config changes.
Do **not** treat Claude Desktop hooks (if any) as this interceptor.

### 3. Claude Code — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | `~/.claude.json` or project MCP config |
| Format | `mcpServers` JSON |
| Live evidence | **PENDING** — not captured |

Important: Claude Code may also have PreToolUse / hook behaviour owned by other
packages. These canaries only validate MCP servers routed through
`@behalfid/mcp-runtime`. If documenting hook outage behaviour, copy the
behaviour as implemented in that other package — do not invent fail-open/closed
claims here.

### 4. Codex — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | `~/.codex/config.toml` |
| Format | TOML `[mcp_servers.*]` |
| Live evidence | **PENDING** — not captured |

Confirm TOML keys other than `mcp_servers` (e.g. `model`) survive install,
wrap, upgrade, and uninstall. Capture before/after TOML files as evidence.

### 5. VS Code (Copilot MCP) — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | workspace `.vscode/mcp.json` or user `.../Code/User/mcp.json` |
| Format | `servers` JSON with `type: "stdio"` |
| Live evidence | **PENDING** — not captured |

Confirm `type: "stdio"` remains on wrapped entries and that non-stdio (`sse` /
`url`) servers are left untouched. Capture the `inputs` array if present — it
must survive wrap/uninstall.

### 6. Windsurf — **PENDING**

| Field | Value |
|-------|-------|
| Config path (typical) | `~/.codeium/windsurf/mcp_config.json` (alternate `~/.windsurf/mcp.json`) |
| Format | `mcpServers` JSON |
| Live evidence | **PENDING** — not captured |

Same evidence set as Cursor.

---

## Pass / fail criteria

A client canary **passes** only when **all** required artifacts exist and show:

1. Unrelated MCP servers and top-level settings preserved across install/wrap/uninstall.
2. Allow → downstream side effect observed **and** platform verify allow logged.
3. Deny / approval-pending / approval-denied / verify-outage → **no** downstream side effect.
4. Doctor healthy after install; reports registration failure after deliberate tampering (optional negative).
5. No secrets (API keys) committed to git.

Until then the client remains **not production-supported** for hard MCP enforcement.

---

## Fixture references (offline)

Round-trip fixtures used by automated tests (not live evidence):

`packages/install/test/fixtures/client-configs/`

- `cursor.mcp.json`
- `claude-desktop.mcp.json`
- `claude-code.mcp.json`
- `vscode.mcp.json`
- `windsurf.mcp.json`
- `codex.config.toml`
