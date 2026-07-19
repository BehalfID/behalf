# @behalfid/mcp-runtime

Policy Enforcement Point (PEP) for MCP tool invocations.

Intercepts every MCP tool call, authorizes it through BehalfID `verify()`,
enforces the decision, and proxies to the MCP server **only when allowed**.

```
AI Agent → mcp-runtime (PEP) → verify() → ALLOW | DENY | APPROVAL REQUIRED → MCP Server
```

This package does **not** implement policy, permissions, approvals, risk, or
audit storage. Those belong to the BehalfID platform.

For static MCP config analysis, see `@behalfid/mcp-audit`.

## Install

```bash
npm install @behalfid/mcp-runtime
```

## Quick start

```ts
import { McpRuntime, EventBus } from "@behalfid/mcp-runtime";
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const runtime = new McpRuntime({
  agentId: "agent_xxx",
  verifyTimeoutMs: 5_000,
  verifyClient: {
    // Platform API returns approvalRequired / approvalId; map as needed
    verify: (input) => behalf.verify(input) as ReturnType<typeof behalf.verify>,
  },
  transport: {
    async callTool(server, tool, args) {
      return { data: await mcp.call(server, tool, args) };
    },
  },
  eventBus: new EventBus(),
  waitForApproval: async ({ approvalId }) => {
    // Host polls existing BehalfID approval APIs / UI — not a second workflow
    return pollPlatformApproval(approvalId);
  },
});

const result = await runtime.execute({
  requestId: "req_1",
  sessionId: "sess_1",
  userId: "user_1",
  provider: "cursor",
  server: "filesystem",
  tool: "read_file",
  arguments: { path: "/tmp/notes.txt" },
  metadata: { cwd: "/project" },
});
```

## Responsibilities

| Keep | Do not implement |
|------|------------------|
| ToolProxy | PolicyEngine |
| McpTransport | PermissionEngine |
| EventBus | ApprovalEngine |
| Verify client + timeout | RiskEngine |
| Request / response mapping | Local audit database |
| Fail-closed enforcement | In-memory permission stores |

## Fail closed

If verification throws, times out, or returns malformed data, the tool is
**not** executed and a denial event is emitted.

## Events

`invocation.received` · `verification.started` · `verification.completed` ·
`verification.denied` · `approval.required` · `approval.granted` ·
`approval.denied` · `execution.started` · `execution.completed` ·
`execution.failed`

## License

MIT
