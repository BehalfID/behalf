# Google Antigravity Integration

Status as of 2026-07-13. Covers BehalfID's integration with Google Antigravity
(the Antigravity IDE / "Antigravity 2.0" and the `agy` CLI).

> **Status: verification and audit integration; enforcement unsupported on
> tested Antigravity CLI 1.1.2.** A Windows live canary proved that `agy` loads
> and invokes the enabled global PreToolUse hook and that BehalfID records the
> verification. The allowed canary executed and logged an allowed decision.
> The first denied canary exposed a forced-exit crash, which was fixed. On the
> repeated denied canary, the hook returned valid deny JSON and clean exit code
> 2 and BehalfID logged `command_blocked`, but `agy` still executed the command.
> Denied actions may therefore execute. Do not rely on this integration as an
> execution boundary. The MCP layer is advisory, and no Antigravity surface is
> currently classified as enforced.

## What Antigravity is (verified)

Google Antigravity is Google's agent-first development platform:

- **Antigravity IDE** — a VS Code fork with an agent manager surface.
- **Antigravity CLI** (`agy`) — terminal agent, released at Google I/O 2026
  (May 19, 2026) as the successor to Gemini CLI. Google's transition
  announcement confirms it "retains … Agent Skills, Hooks, Subagents, and
  Extensions (now Antigravity plugins)".
- **Antigravity SDK** (Python) — a library for building custom agents. Its
  in-process hooks are a separate surface and are not covered by this
  integration.

The IDE and CLI share configuration under `~/.gemini/`:

| File | Purpose |
|---|---|
| `~/.gemini/config/hooks.json` | Global hooks (shared by IDE + CLI) |
| `~/.gemini/config/mcp_config.json` | Shared MCP server config (Antigravity 2.0) |
| `~/.gemini/antigravity/mcp_config.json` | Earlier per-product MCP config path |
| `<workspace>/.agents/hooks.json` | Workspace-local hooks (only loaded for trusted folders) |

Antigravity supports **PreToolUse / PostToolUse command hooks**: before a tool
call, the harness pipes a JSON payload to the configured command on stdin. The
documented convention treats `{"decision":"deny", ...}` or non-zero exit as a
blocking result. **Tested `agy` 1.1.2 on Windows did not honor that contract:**
it invoked the hook and caused a denied server verification, then executed the
command despite valid deny JSON and clean exit code 2. Hooks run with a
**sanitized environment** — only a whitelist of variables reaches the hook
process, so BehalfID's hook reads configuration from
`~/.behalf/config.json`, never from env vars.

Antigravity supports **MCP servers** (stdio via `command`/`args`, remote HTTP
via `serverUrl`/`headers`) in both the IDE and the CLI. MCP is advisory:
nothing in Antigravity forces the agent to consult a given MCP tool before
acting.

Sources: [Gemini CLI → Antigravity CLI transition (official)](https://github.com/google-gemini/gemini-cli/discussions/27274),
[antigravity-cli releases + CHANGELOG (official)](https://github.com/google-antigravity/antigravity-cli),
[Gemini CLI hooks reference (Apache-2.0 upstream of the Antigravity CLI)](https://github.com/google-gemini/gemini-cli/tree/main/docs/hooks),
[GitHub MCP server Antigravity install guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-antigravity.md),
[Antigravity hooks documentation](https://antigravity.google/docs/hooks),
plus real-world hook integrations against the shipping product (e.g.
[manaflow-ai/cmux#4768](https://github.com/manaflow-ai/cmux/issues/4768)). These
sources describe the intended protocol; the failed live canary below is the
authority for BehalfID's `agy` 1.1.2 enforcement classification.

## What BehalfID installs

`behalf antigravity install` sets up two layers:

1. **Verification and audit layer — PreToolUse hook.** A `behalfid` namespace
   entry in `~/.gemini/config/hooks.json` runs `behalf hook antigravity`
   before every tool call in the IDE and the CLI. The hook:
   - normalizes the Antigravity tool call to a BehalfID action
     (see mapping below),
   - builds a sanitized `policyContext` containing only the file path or
     command string plus `cwd`/`home` — file contents, edit bodies, and
     prompts are never forwarded,
   - calls `POST /api/verify`, which evaluates permissions,
     `allowedPaths`/`deniedPaths`/`deniedCommands` constraints, and the
     approval policy, and writes a verification log entry,
   - allows with `{}` (an explicit no-opinion — the hook never emits
     `{"decision":"allow"}`, so Antigravity's own review prompts are never
     suppressed), or
   - returns `{"decision":"deny","reason":…}` on stdout **and** exit code 2
     for a denied verification. This is a valid hook denial response, but
     tested `agy` 1.1.2 ignored it and executed the command.
2. **Advisory layer — MCP server.** A `behalfid` entry
   (`behalf mcp start`, stdio) in Antigravity's MCP config exposing
   `verify_action` and `get_permissions` so agents can check permissions and
   surface approval instructions conversationally. This layer is context
   only; it enforces nothing.

### Tool → action mapping

Antigravity's harness exposes Windsurf-heritage tool names in the IDE and
Gemini-heritage names in the CLI. Both are mapped:

| Antigravity tools | BehalfID action | Resource |
|---|---|---|
| `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `write_file`, `replace`, `edit_file`, `create_file`, `delete_file`, `remove_file` | `write_file` | `filesystem` |
| `view_file`, `read_file`, `read_many_files`, `view_code_item` | `read_file` | `filesystem` |
| `run_command`, `run_shell_command` | `execute_command` | `shell` |
| `web_fetch`, `google_web_search`, `search_web`, `read_url_content`, `browser_*` | `browse_web` | request hostname, or `web` |
| `mcp_{server}_{tool}` (documented FQN), `mcp__{server}__{tool}` (provisional alias), or any tool with an `mcp_context` server name | `mcp_tool` | MCP server name |
| `task`, `agent`, `run_subagent`, `spawn_subagent`, `delegate_task` | `spawn_agent` | `agent` |

### Unknown tools

A tool name that does not map to a BehalfID action is **not** assumed safe:

- **Legacy `required` handler mode returns a denial for unknown tools.** A new,
  renamed, plugin-supplied, or undocumented tool does not receive a positive
  verification. This handler response does not stop execution on tested `agy`
  1.1.2. The only allowlisted exceptions are the tools below, each
  independently documented as a metadata-only local listing operation (never
  inferred from the name):

  | Allowlisted tool | Evidence (official Gemini CLI tool reference, the Apache-2.0 upstream of the Antigravity CLI) |
  |---|---|
  | `list_directory` | "Lists the names of files and subdirectories directly within a specified path." (docs/tools/file-system.md, read) |
  | `glob` | "Finds files matching specific glob patterns across the workspace." (docs/tools/file-system.md, read) |

  These tools still expose filesystem metadata such as names and directory
  structure, even though they do not directly return file contents.

- **`grep_search` and `search_file_content` are intentionally unmapped.** They
  search file contents and therefore must be subject to `read_file`
  permissions, `allowedPaths`, `deniedPaths`, approvals, and verification
  logging. Their path or search-root argument schemas have not been
  established by a live Antigravity payload capture. Until they are captured,
  the hook does not guess their argument fields: legacy `required` mode
  returns an unrecognized-tool denial, while `advisory` mode warns and
  continues without calling `/api/verify`. A future mapping to `read_file`
  requires captured schemas.

- **`advisory` mode: unknown tools are allowed with an explicit stderr
  warning** ("unrecognized tool … — allowing without verification"), so the
  gap is visible instead of silent.

### Required binding arguments

For mapped actions, the hook requires the arguments that identify the action
before it will verify. A target-dependent verification is never sent with an
absent target and then described as evaluated:

| Action | Minimum binding argument |
|---|---|
| `execute_command` | non-empty command string |
| `write_file` / `read_file` | non-empty file path |
| `browse_web` | URL for `read_url_content` / `browser_navigate`; URL **or** prompt for `web_fetch` (its documented argument is a URL-carrying `prompt`); non-empty query for search tools; other `browser_*` interactions carry no target argument |
| `mcp_tool` | non-empty MCP server identity (from `mcp_context` or the tool-name FQN) |
| `spawn_agent` | none — the action itself is the policy target |

When a binding argument is missing, empty, or the tool arguments are not a
JSON object (including nested `toolCall.args`), the legacy `required` handler
mode returns a local denial without calling BehalfID; `advisory` mode warns
that target policy constraints cannot be evaluated and verifies the
action-level permission only. A local denial produces no server-side log and,
on tested `agy` 1.1.2, is not an execution boundary.

## Installation

```bash
npm install -g @behalfid/cli     # provides the `behalf` binary
behalf init                      # configure agent ID + API key (~/.behalf/config.json)
behalf antigravity install       # advisory-outage mode (default)
```

`behalf antigravity install --enforce` is rejected. Live validation showed
that `agy` 1.1.2 ignored a valid denial, so the option cannot truthfully offer
fail-closed execution behavior.

Restart the Antigravity IDE and any running `agy` sessions afterwards — hooks
are loaded at session start.

Other commands:

```bash
behalf antigravity status        # verification / audit / advisory MCP status
behalf antigravity install --dry-run
behalf antigravity install --skip-mcp
behalf antigravity uninstall
behalf doctor                    # includes Antigravity hook + MCP checks
```

## Authentication

The hook authenticates to BehalfID with the agent API key (`bhf_sk_…`) from
`~/.behalf/config.json` (written by `behalf init` or
`behalf config set api-key …`). Environment variables are **not** a supported
credential path for the Antigravity hook: Antigravity executes hooks with a
sanitized environment, so `BEHALFID_API_KEY` would silently never arrive.
The config file is written with mode `0600`.

Identity sent with every verification: the configured `agentId` (account and
workspace resolution happens server-side from the API key). Repository and
workspace identity travel as `cwd` inside the sanitized policy context; the
server canonicalizes paths against it.

## Hook decision modes (not host enforcement)

The handler has advisory and legacy required decision modes. These describe
the hook's output when verification cannot complete; they do not establish
what the host will execute.

| Condition | `advisory` (default) hook response | Legacy `required` hook response |
|---|---|---|
| BehalfID denies the action | Deny JSON + exit 2; `agy` may execute | Deny JSON + exit 2; `agy` may execute |
| Approval required, not yet granted | Deny JSON + exit 2; `agy` may execute | Deny JSON + exit 2; `agy` may execute |
| Oversized policy context (> 16 KB path/command) | Deny JSON + exit 2; `agy` may execute | Deny JSON + exit 2; `agy` may execute |
| BehalfID unreachable / API timeout (10 s) | Allowed with warning | Deny JSON + exit 2; `agy` may execute |
| Invalid or missing credentials | Allowed with warning | Deny JSON + exit 2; `agy` may execute |
| Malformed or oversized hook payload | Allowed with warning | Deny JSON + exit 2; `agy` may execute |
| Payload missing a tool name | Allowed with warning | Deny JSON + exit 2; `agy` may execute |
| Tool arguments not a JSON object | Allowed with warning (treated as missing) | Deny JSON + exit 2; `agy` may execute |
| Missing/empty binding argument (command, path, URL, MCP server) | Verified without target, with warning | Local deny JSON + exit 2; `agy` may execute |
| Unknown tool (not mapped, not allowlisted) | Allowed with warning, no verification | Unrecognized-tool deny + exit 2; `agy` may execute |
| Content-search tool pending payload capture (`grep_search`, `search_file_content`) | Allowed with warning, no verification | Unrecognized-tool deny + exit 2; `agy` may execute |
| Metadata-only allowlisted tool (`list_directory`, `glob`) | Allowed (no verify call) | Allowed (no verify call) |

New `behalf antigravity install --enforce` requests are rejected. Existing config
may still contain `antigravityEnforcement: "required"` from an older CLI and
will change handler output, but it does not create a fail-closed host boundary.
`behalf antigravity status` and `behalf doctor` report enforcement as
unsupported. The MCP layer is explicitly advisory.

## Example policy

Verify and audit shell commands and file writes for an agent. This example
requests approval for writes outside `src/`:

```bash
behalf permissions create agent_xxx --action execute_command -r shell
behalf permissions create agent_xxx --action write_file -r filesystem \
  --allowed-paths 'src/**' --requires-approval
behalf permissions create agent_xxx --action read_file -r filesystem
```

Any Antigravity tool call that maps to an action with no active permission
produces a denied verification and a deny hook response. Tested `agy` 1.1.2
may still execute it.

## How advisory approvals work

On tested `agy` 1.1.2 this flow records and communicates approval state, but
cannot prevent execution before approval because the host ignored a valid
denial.

1. The agent attempts a mapped action; the hook returns
   "approval required. Visit your BehalfID Action Inbox to approve, then retry
   the action."
2. A pending approval request appears in the Action Inbox, **bound to the
   exact canonical target** — the complete command string or the lexically
   canonicalized file path (SHA-256 fingerprint).
3. A human approves it in the dashboard. Self-approval restrictions and
   authority levels apply server-side.
4. The agent retries the same action. The server atomically consumes the
   grant (single-use) and allows exactly that target once.
5. A retry with a different command/path does not match the fingerprint and
   creates a new pending request. A second identical retry after consumption
   requires a new approval.

## Live canary conclusion

The Windows `agy` 1.1.2 canary is conclusive:

1. The `/hooks panel` showed the global `[behalfid] .*` PreToolUse hook loaded,
   enabled, and containing one hook.
2. The allowed command canary executed and produced an allowed
   `execute_command` verification.
3. The initial denied canary produced a server-side `command_blocked`
   decision and valid deny output, then exposed the Windows forced-exit/libuv
   crash. That result was inconclusive about host blocking.
4. Commit `ac1b948657f6c6de4f7a1fa27fcda431bfb8b881` replaced forced exit with
   graceful `process.exitCode`; the standalone built hook then emitted valid
   deny JSON, wrote the denial to stderr, and exited cleanly with code 2.
5. A fresh `agy` session repeated `echo behalfid-canary`. BehalfID recorded a
   distinct denied verification for that exact live attempt (`execute_command`,
   vendor `shell`, reason `command_blocked`). Nevertheless, `agy` executed the
   command and printed `behalfid-canary`.

This proves the hook was loaded and invoked; missing configuration, stale
session state, and hook-loading failure are ruled out. Tested `agy` 1.1.2 is
observed and audited but **non-enforcing**. A future protocol or hook event may
only be adopted after official Antigravity documentation or a successful
host-only live blocking canary.

## Upstream issue template (secret-free)

**Title:** Windows `agy` 1.1.2 executes a tool after enabled PreToolUse hook
returns deny JSON and exit 2

**Environment:** Antigravity CLI 1.1.2 on Windows; global PreToolUse hook shown
as enabled in `/hooks panel`.

Create `C:/tmp/antigravity-deny-repro.mjs`:

```js
process.stdout.write('{"decision":"deny","reason":"canary denied"}\n');
process.stderr.write('canary denied\n');
process.exitCode = 2;
```

Add an enabled global hook in `~/.gemini/config/hooks.json`:

```json
{
  "blocking-repro": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          { "type": "command", "command": "node C:/tmp/antigravity-deny-repro.mjs" }
        ]
      }
    ]
  }
}
```

Restart `agy`, confirm the hook is enabled in `/hooks panel`, and ask it to run
`echo antigravity-hook-canary`. Running the hook directly emits valid deny
JSON and exits normally with code 2. **Expected:** `agy` does not execute the
command. **Observed with the equivalent BehalfID hook:** the hook ran and a
distinct denied verification was recorded, but `agy` executed the command and
printed the marker. This reproduction contains no BehalfID URL, agent ID, API
key, cookie, command content beyond the public canary marker, or other secret.

## Inspecting activity

Every mapped tool call that reaches BehalfID (allowed or denied) produces a
verification log entry:

```bash
behalf logs tail            # live stream
behalf logs list --limit 50
```

or the dashboard's Activity view. Approval decisions appear in the Action
Inbox with the bound command/path preview (secrets redacted server-side).

## Payload formats and provenance

The hook parses several payload shapes defensively. They are **not** equally
trustworthy. Three tiers (mirrored in `test/fixtures/antigravity/`):

| Tier | Shapes | Basis |
|---|---|---|
| **Documented** | snake_case envelope (`tool_name`, `tool_input`, `session_id`, `cwd`, `mcp_context`); Gemini-heritage tool names (`run_shell_command` + `command`, `write_file` + `file_path`, `read_file` + `absolute_path`, `web_fetch` + `prompt`, `google_web_search` + `query`); MCP FQN `mcp_{server}_{tool}` | Official Gemini CLI hooks + tool references (the Apache-2.0 upstream of the Antigravity CLI) |
| **Captured** | none yet | Live `agy` / IDE sessions via `behalf hook capture-schema` — **no captures exist in this repo yet** |
| **Provisional** | camelCase variants (`toolName`, `toolInput`), nested `toolCall.args`, Windsurf-heritage IDE tool names (`write_to_file`, `run_command`, `view_file`, `TargetFile`/`CommandLine` argument aliases), `mcp__{server}__{tool}`, `browser_*` | Compatibility guesses inherited from Gemini/Claude/Windsurf conventions and secondary write-ups. Tolerated so shape drift follows the documented handler response behavior instead of a misread — but never treat provisional coverage as evidence of live compatibility |

### Capturing real hook payloads

`behalf hook capture-schema` is a diagnostic hook that records only the
payload **schema** — event name, top-level field names, the tool name, and
argument field names with their JSON types. Argument values, prompts, file
contents, paths, and credentials are never written. It always allows the call
and never verifies anything; remove it when done.

1. Temporarily add a capture entry alongside the verification hook in
   `~/.gemini/config/hooks.json`:

   ```json
   "behalfid-capture": {
     "PreToolUse": [
       { "matcher": ".*",
         "hooks": [ { "type": "command", "command": "behalf hook capture-schema" } ] }
     ]
   }
   ```

2. Restart Antigravity, run a short session exercising the tools you care
   about (a file write, a shell command, a browser action, a subagent task,
   an MCP tool).
3. Inspect `~/.behalf/antigravity-captures.jsonl` (one JSON line per tool
   call).
4. Remove the `behalfid-capture` entry and restart.
5. Turn interesting schemas into fixtures under
   `test/fixtures/antigravity/captured/` following the sanitization rules in
   `test/fixtures/antigravity/README.md`, and promote the corresponding tool
   names/aliases from provisional to captured.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Denied canary command executes | This is the confirmed `agy` 1.1.2 behavior even when the enabled hook runs, BehalfID denies, and the hook returns valid deny JSON plus exit 2. Treat the integration as verification/audit only. |
| Hook returns a local denial for every call | A legacy `required` config may be active while BehalfID is unreachable or credentials are invalid. Fix connectivity/credentials, or run `behalf antigravity install --advisory`; do not assume the host honors the denial. |
| "not configured (agent ID or API key missing)" warnings | Run `behalf init` — the hook reads `~/.behalf/config.json`, not env vars. |
| Install fails with "not valid JSON" | Repair or back up the reported file; BehalfID never overwrites malformed config. |
| Hook works in CLI but not IDE (or vice versa) | Both read `~/.gemini/config/hooks.json`, but only for trusted folders; restart the surface that misses the hook and re-run the canary on it. |
| Debug tracing | Run the hook manually: `echo '{"tool_name":"run_command","tool_input":{"command":"ls"}}' | BEHALFID_DEBUG=1 behalf hook antigravity`. (The env var does not propagate through Antigravity's sanitized hook environment.) |

Confirmed Windows hook shutdown defect: hook subcommands used
`process.exit(await handler())`. After a verification fetch returned a denial,
the forced exit ran while Node/libuv handles were closing, emitted
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c`,
and replaced the intended exit code 2 with crash status `-1073740791`. Hook
subcommands now assign `process.exitCode = await handler()` so Node drains
cleanly. The built-CLI regression exits normally with code 2 and the repeated
live canary no longer hit the assertion. The repeated canary still failed
enforcement: `agy` 1.1.2 ignored the valid deny result and executed the
command.

## Removal / rollback

```bash
behalf antigravity uninstall
```

Removes the `behalfid` hooks namespace and the `behalfid` MCP entries, leaves
every other entry untouched, and clears the stored legacy hook decision mode.
Restart Antigravity sessions to drop the hook.

All config writes are atomic (temp file + rename — an interruption can never
leave a truncated file), preserve the target file's permissions, and write a
pre-change backup to `<file>.behalfid.bak` before modifying an existing file.
Full manual rollback: `mv <file>.behalfid.bak <file>` for each modified file,
or delete the `behalfid` keys from `~/.gemini/config/hooks.json` and the
`mcpServers.behalfid` entries from the MCP config files.

## Known limitations

- **The hook verifies and audits calls that Antigravity routes through
  PreToolUse. It does not govern execution on tested `agy` 1.1.2.** Anything
  Antigravity executes without firing PreToolUse is not seen at all. Hook
  coverage of IDE browser actions, background agents, and internal tools has
  not been independently verified.
- **A user with local file access can remove the hook** (edit
  `~/.gemini/config/hooks.json`). Antigravity has no documented org-managed,
  tamper-proof hook deployment. This is the same trust boundary as the Claude
  Code integration. Local configuration is not tamper-resistant.
- **Workspace-local hooks are not managed.** BehalfID installs globally;
  `<workspace>/.agents/hooks.json` is left to the user.
- **No post-execution outcome recording.** Audit evidence is decision-time
  (the verification log). A PostToolUse audit event needs a server-side
  ingestion endpoint that does not exist yet.
- **No Antigravity plugin package.** Plugins exist ("Extensions, now
  Antigravity plugins") and can reportedly carry hooks, but Google has not
  published a stable public manifest spec; shipping one would mean inventing
  undocumented fields. The CLI installer is the supported distribution path.
- **Subagents:** Antigravity documents subagents and nested tool
  confirmations; whether every subagent tool call fires PreToolUse is not
  officially documented. Validate with the canary inside a subagent task.
- **Hosted/cloud execution** (Google-hosted agent runs, if/where offered) has
  no local hooks file; it is out of scope for this integration.
- Antigravity's own permission system (`settings.json` `permission.allow`,
  "Always Approve", execution modes) is independent of and complementary to
  BehalfID; the hook never modifies it.

## Validation matrix

Populated only with facts verified as of 2026-07-13. The `agy` 1.1.2 denied
canary demonstrated execution after a valid denial, so that surface is
explicitly non-enforcing. No other Antigravity surface qualifies as enforced.

| Capability / surface | Status |
|---|---|
| Advisory MCP | **Available, advisory only** (config layer implemented; stdio server is the existing `behalf mcp start`) |
| PreToolUse verification and audit | **Implemented and observed live** (hook invoked; allowed and denied server verifications recorded) |
| CLI (`agy`) enforcement | **Unsupported on tested 1.1.2** (valid deny JSON + clean exit 2 ignored; command executed) |
| IDE enforcement | **Unvalidated and unsupported as a claim** |
| Browser tools | **Unverified** (hook coverage of IDE browser actions unknown) |
| Background tasks | **Unverified** (hook firing not officially documented) |
| Subagents | **Unverified** (nested tool confirmations documented; hook firing not documented) |
| Plugins | **Unverified** (no public manifest spec; legacy `required` handler mode returns local denials for unknown tools, but host enforcement is unproven) |
| Hosted/API agents | **Unsupported** (no local hook surface) |

Detail per surface:

| Surface | MCP available | Pre-action verification | Audit | Execution boundary |
|---|---|---|---|---|
| Desktop/IDE (Antigravity) | Yes (advisory) | PreToolUse hooks (documented; shared hooks.json) — pending IDE canary | Decision-time verification log only | Unvalidated; do not rely on it |
| CLI (`agy`) | Yes (advisory) | PreToolUse hook observed live | Allowed and denied decision-time logs observed | **No on tested 1.1.2** |
| Hosted/API | Unverified | No local hook surface | No | No |
| Background agents | Shares config | Unknown — canary required | Decision-time log if hooks fire | Unknown; do not rely on it |
| Subagents | Shares config | Unknown — canary required | Decision-time log if hooks fire | Unknown; do not rely on it |

## Future validation and MCP independence

The failed `agy` 1.1.2 canary is definitive for that version; repeating it
cannot establish enforcement. Use this procedure only to audit a later host
version or an independently tested IDE surface. Prerequisites once:

```bash
npm install -g @behalfid/cli
behalf agents create --name "Antigravity Canary" --save
behalf permissions create <agent_id> --action execute_command -r shell
behalf antigravity install
# restart the Antigravity IDE and any running `agy` sessions
behalf antigravity status
```

Use this dedicated agent only for validation. Before proceeding, confirm it
has exactly one applicable active `execute_command` permission: the permission
created above. Record that permission's ID, then execute each step and record
it in the results template below.

For `agy` 1.1.2, steps 2 and 3 have already been completed: the allowed action
executed and logged an allowed verification; the repeated denied action logged
`command_blocked` but also executed. Server-side denial and valid hook output
are audit evidence, not enforcement evidence.

1. **Capture a sanitized PreToolUse payload from `agy`.** Add the
   `behalfid-capture` entry from "Capturing real hook payloads" above to
   `~/.gemini/config/hooks.json`, restart, then in `agy` ask the agent to run
   `echo capture-test` and to write a scratch file. Verify schema lines in
   `~/.behalf/antigravity-captures.jsonl` contain field names/types only.
   Remove the capture entry afterwards.
2. **Allowed command executes.** In the surface under test, ask the agent to
   run `echo ok`.
   Expect execution, and an allowed `execute_command` entry in
   `behalf logs tail`.
3. **Denied command does not execute.** Revoke the permission used in step 2:
   `behalf permissions revoke <permission_id>`. Confirm it is inactive before
   creating the constrained replacement:
   `behalf permissions create <agent_id> --action execute_command -r shell --denied-commands behalfid-canary`.
   Confirm the replacement is the only applicable active `execute_command`
   permission, then ask the agent to run `echo behalfid-canary`. Record the
   deny verification, hook output/exit, and whether the command executes.
   Only `hook fired: yes / executed: no` establishes a boundary for a new
   surface or host version. Tested `agy` 1.1.2 produced `executed: yes`.
4. **Confirm `--enforce` is rejected.** Run
   `behalf antigravity install --enforce`. Expect an unsupported/live-canary-
   failed error and no configuration change.
5. **Repeat steps 2–3 in the Antigravity IDE** (editor agent panel and the
   agent manager surface).
6. **Repeat step 3 inside a subagent.** Ask the agent to delegate the canary
   command to a subagent task. Record whether the hook fired at the subagent
   depth.
7. **Repeat step 3 inside a background task.** Ask the agent to run the
   canary as a background/async task. Record whether the hook fired.
8. **Test at least one browser action.** Ask the IDE agent to open a page in
   the browser surface. Record whether a PreToolUse event fired (check
   `behalf logs tail` for a `browse_web` verification, or use the capture
   hook), the deny response, and whether execution still occurs.
9. **MCP server starts independently of the hook.** Start from a normal
    `behalf antigravity install`, with both the hook and MCP registration
    present. Back up the hook configuration:

    ```bash
    cp ~/.gemini/config/hooks.json ~/.gemini/config/hooks.json.mcp-canary.bak
    ```

    Manually edit `~/.gemini/config/hooks.json` as valid JSON and remove only
    its top-level `behalfid` hook namespace. Do not change the MCP config;
    confirm `mcpServers.behalfid` remains in the active Antigravity MCP
    configuration. Restart Antigravity and confirm `verify_action` and
    `get_permissions` remain available and respond. Restore the exact hook
    configuration and restart again:

    ```bash
    cp ~/.gemini/config/hooks.json.mcp-canary.bak ~/.gemini/config/hooks.json
    ```

    Do **not** use `behalf antigravity uninstall` for this test: that command
    removes both the hook and the BehalfID MCP registration.

Finally: `behalf antigravity uninstall`, restart, and confirm the canary
command executes again (hook fully removed, rollback verified).

### Validation results template

Copy one row per test run. The recorded `agy` 1.1.2 result is "hook fired: yes
/ executed: yes" and must remain classified non-enforcing. Only a later host
version or different surface showing "hook fired: yes / executed: no" may be
considered for a surface-specific enforcement claim.

```
Antigravity version: ................ (agy --version / IDE About)
Operating system:    ................
BehalfID CLI:        ................ (behalf --version)
Date:                ................
Canary agent ID:     ................ (dedicated test agent)
Allowed permission:  ................ (step 2; revoked before step 3)
Denied permission:   ................ (step 3; the sole active replacement)
```

| # | Surface (CLI/IDE/subagent/background/browser) | Tool name | Hook fired? | BehalfID received verification? (`behalf logs`) | Execution occurred? | Expected | Actual | Pass? |
|---|---|---|---|---|---|---|---|---|
| 2 | CLI 1.1.2 (recorded) | run_shell_command (single unrestricted permission) | yes | allowed | yes | allowed + executed | allowed + executed | yes |
| 3 | CLI 1.1.2 (recorded) | run_shell_command (sole constrained replacement permission) | yes | denied: command_blocked | **yes** | deny emitted; host must not execute | command executed | **no** |
| 4 | CLI | `--enforce` install | n/a | n/a | n/a | option rejected, config unchanged | | |
| 5a | IDE | (repeat 2) | | | | allowed + executed | | |
| 5b | IDE | (repeat 3) | | | | deny emitted, not executed | | |
| 6 | Subagent | (canary) | | | | record execution outcome | | |
| 7 | Background task | (canary) | | | | record execution outcome | | |
| 8 | Browser | (browser action) | | | | verification logged; record outcome | | |
| 9 | MCP | verify_action | n/a | | n/a | advisory tools respond without hook | | |
