# @behalfid/mcp-runtime

Policy Enforcement Point (PEP) for MCP tool invocations — library **and**
stdio interceptor.

```
AI Agent → mcp-runtime (stdio) → verify() → ALLOW | DENY | APPROVAL → Downstream MCP
```

This package does **not** implement policy, permissions, approvals, risk, or
audit storage. Those belong to the BehalfID platform.

Static config analysis: `@behalfid/mcp-audit`.

Phased plan: [docs/INTERCEPTOR_PLAN.md](./docs/INTERCEPTOR_PLAN.md).

## Install

```bash
npm install @behalfid/mcp-runtime
```

## Stdio interceptor (Phases 1–3)

Run as an MCP server that fronts a real downstream server. Every `tools/call`
goes through `verify()` before the child MCP is invoked.

```bash
export BEHALFID_API_KEY=bhf_sk_...
export BEHALFID_AGENT_ID=agent_...
export BEHALFID_DOWNSTREAM_COMMAND=npx
export BEHALFID_DOWNSTREAM_ARGS='["-y","@modelcontextprotocol/server-filesystem","/tmp"]'
export BEHALFID_DOWNSTREAM_SERVER=filesystem

npx @behalfid/mcp-runtime
# or: node node_modules/@behalfid/mcp-runtime/dist/cli.js
```

Example MCP client entry:

```json
{
  "mcpServers": {
    "behalfid": {
      "command": "npx",
      "args": ["-y", "@behalfid/mcp-runtime@0.1.0"],
      "env": {
        "BEHALFID_API_KEY": "bhf_sk_...",
        "BEHALFID_AGENT_ID": "agent_...",
        "BEHALFID_DOWNSTREAM_COMMAND": "npx",
        "BEHALFID_DOWNSTREAM_ARGS": "[\"-y\",\"@modelcontextprotocol/server-filesystem\",\"/tmp\"]",
        "BEHALFID_DOWNSTREAM_SERVER": "filesystem"
      }
    }
  }
}
```

Tools are exposed as `{server}__{tool}` (e.g. `filesystem__read_file`).

## Library PEP

```ts
import { McpRuntime } from "@behalfid/mcp-runtime";

const runtime = new McpRuntime({
  agentId: "agent_xxx",
  verifyClient: { verify: (input) => behalf.verify(input) },
  transport: { callTool: (server, tool, args) => mcp.call(server, tool, args) },
});

await runtime.execute(invocation);
```

## Fail closed

If verification throws, times out, or returns malformed data, the tool is
**not** executed.

## Phase 4 — host wrap

```bash
npx @behalfid/install install \
  --wrap \
  --agent-id agent_xxx \
  --api-key bhf_sk_xxx
```

Rewrites existing stdio MCP servers in place so they launch this package with
`BEHALFID_DOWNSTREAM_*` pointing at the original command. Uninstall restores
the saved originals.

Approval polling (default on): while `approvalRequired`, the interceptor re-calls
`verify()` until allowed, denied, or timeout. Disable with `BEHALFID_APPROVAL_POLL=0`.

## License

MIT
