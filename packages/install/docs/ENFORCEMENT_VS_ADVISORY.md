# Enforcement vs advisory

BehalfID ships three MCP-related surfaces. They are **not** interchangeable.

| Surface | Package | What it guarantees | What it does **not** guarantee |
|---------|---------|--------------------|--------------------------------|
| Read-only audit | `@behalfid/mcp-audit` | Structured findings about MCP config | Any runtime blocking |
| Advisory tools | `@behalfid/cli` MCP (`verify_action`, `get_permissions`) | A cooperative agent *can* ask before acting | Unavoidable enforcement — the agent may skip or ignore |
| **Fail-closed interceptor** | **`@behalfid/mcp-runtime`** | Stdio `tools/call` cannot reach the downstream server without an allow from BehalfID `verify()` | Coverage for agents that bypass MCP or rewrite config to remove the wrapper |

`@behalfid/install` can:

- register a sibling `behalfid` MCP entry, and/or
- `--wrap` existing stdio servers so they launch `@behalfid/mcp-runtime`

Only the wrapped / interceptor path is the enforcement boundary. Installing the
advisory CLI tools alone is **not** hard enforcement.

Failure behaviour of the interceptor is documented in
[`../mcp-runtime/docs/FAIL_CLOSED.md`](../mcp-runtime/docs/FAIL_CLOSED.md).

Manual real-client validation checklist (all live steps currently **PENDING**):
[`../mcp-runtime/docs/MANUAL_CLIENT_CANARIES.md`](../mcp-runtime/docs/MANUAL_CLIENT_CANARIES.md).
