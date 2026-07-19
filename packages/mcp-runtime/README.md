# @behalfid/mcp-runtime

BehalfID Runtime MCP Protection Framework — the authorization, approval,
auditing, and policy enforcement layer between AI agents and MCP servers.

```
AI Agent → BehalfID Runtime → MCP Server
```

Every tool invocation must receive a decision before it may execute.
This package is **provider-agnostic** (Cursor, Claude Desktop, VS Code,
Windsurf, OpenAI-compatible agents) and does **not** perform static MCP
config auditing (see `@behalfid/mcp-audit` for that).

## Install

```bash
npm install @behalfid/mcp-runtime
```

## Quick start

```ts
import { BehalfRuntime } from "@behalfid/mcp-runtime";

const runtime = new BehalfRuntime({
  transport: {
    async callTool(server, tool, args) {
      // Host-provided MCP transport
      return { data: await mcp.call(server, tool, args) };
    },
  },
});

await runtime.grantPermission({
  id: "p1",
  action: "filesystem.read",
  effect: "allow",
  subjectId: "user_1",
});

const decision = await runtime.evaluate({
  sessionId: "sess_1",
  userId: "user_1",
  server: "filesystem",
  tool: "read_file",
  permission: "filesystem.read",
  arguments: { path: "/tmp/notes.txt" },
});

if (decision.type === "allow" || decision.type === "allow-with-audit") {
  await runtime.proxy!.execute(invocation, decision);
}
```

## Architecture

| Module | Role |
|--------|------|
| `BehalfRuntime` | Central engine — validate, evaluate, audit |
| `PolicyEngine` + `PolicyRegistry` | Pluggable authorization rules |
| `PermissionEngine` | Allow / deny / scoped / wildcard / expiration |
| `ApprovalEngine` | Interrupt execution (approve once / always / deny) |
| `RiskEngine` | Low → Critical scoring (extensible scorers) |
| `DecisionEngine` | Final allow / deny / require-approval / block-server |
| `AuditLogger` | Immutable events (arguments hashed, secrets redacted) |
| `ToolProxy` | Executes only after an allow decision |
| `EventBus` | Subscribe for dashboards / sync |

## Adding a policy

```ts
import { PolicyRegistry, type Policy } from "@behalfid/mcp-runtime";

const registry = PolicyRegistry.empty()
  .registerAll(createDefaultPolicies(permissions))
  .register(myPolicy);

const runtime = new BehalfRuntime({ policyRegistry: registry });
```

No runtime source changes required.

## Decision outcomes

`allow` · `allow-with-audit` · `require-approval` · `deny` · `block-server`

Default posture is **fail-closed**: abstain → deny.

## Non-goals

- Static MCP config auditing
- Frontend / approval UI
- Cloud sync or databases (in-memory stores with swappable interfaces)
- Authentication providers

## License

MIT
