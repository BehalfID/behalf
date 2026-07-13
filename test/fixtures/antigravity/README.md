# Antigravity hook payload fixtures

Sanitized `PreToolUse` payload shapes used by `test/cli-antigravity-fixtures.test.ts`.

## Provenance tiers

Every fixture declares a `provenance` field. Only three values are allowed:

| Provenance | Meaning |
|---|---|
| `documented` | Field names taken from official documentation: the Gemini CLI hooks reference (`docs/hooks/reference.md`, Apache-2.0 upstream of the Antigravity CLI) and Gemini CLI tool references. Not yet confirmed against a live Antigravity build. |
| `captured-cli` / `captured-ide` | Recorded from a live `agy` session / a live Antigravity IDE session with `behalf hook capture-schema` (see docs/ANTIGRAVITY.md, "Capturing real hook payloads"). **None exist yet — the directory `captured/` is empty until someone runs the capture procedure.** |
| `provisional` | Compatibility guesses inherited from Gemini CLI, Claude Code, or Windsurf conventions (camelCase variants, nested `toolCall`, `TargetFile`-style argument aliases). The gate tolerates these shapes defensively; they are NOT evidence of real Antigravity behavior. |

Until `captured-*` fixtures exist, treat every non-`documented` shape as
provisional and do not cite fixture coverage as proof of live compatibility.

## Adding a captured fixture

1. Follow the capture procedure in docs/ANTIGRAVITY.md to produce
   `~/.behalf/antigravity-captures.jsonl` (schema only — the capture hook
   records field names and JSON types, never values).
2. Reconstruct a minimal payload from the captured schema using placeholder
   values (`"/tmp/example.txt"`, `"echo ok"`). Never copy real prompts, file
   contents, commands, personal paths, credentials, or session IDs.
3. Save it under `captured/` as `<surface>-<tool>.json` with
   `"provenance": "captured-cli"` or `"captured-ide"`, plus the Antigravity
   version and OS in `"context"`.

## Fixture format

```json
{
  "description": "what this shape represents",
  "provenance": "documented | captured-cli | captured-ide | provisional",
  "source": "citation or capture context",
  "payload": { "tool_name": "...", "tool_input": {} }
}
```
