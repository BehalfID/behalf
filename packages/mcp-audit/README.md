# @behalfid/mcp-audit

Read-only MCP configuration auditing for BehalfID. Analyzes configured MCP
servers, applies a pluggable rule set, and returns a structured
`McpAuditReport` with findings, evidence, remediation actions, and a security
score.

This package **never** modifies configuration files or executes MCP tools.

## Install

```bash
npm install @behalfid/mcp-audit
```

## Quick start

```ts
import { AuditEngine, normalizeMcpConfig } from "@behalfid/mcp-audit";

const configuration = normalizeMcpConfig(
  {
    mcpServers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/"],
      },
    },
  },
  { sourcePath: ".mcp.json", trustedServers: ["behalfid"] }
);

const engine = new AuditEngine();
const report = await engine.audit(configuration);

console.log(report.summary.securityScore);
console.log(report.findings);
```

## Architecture

| Component | Role |
|-----------|------|
| `AuditEngine` | Orchestrates a full audit run |
| `RuleRegistry` | Plugin registry for `AuditRule` implementations |
| `RuleEngine` | Executes every registered rule |
| `ScoreCalculator` | Scores findings (100 − severity weights, clamped 0–100) |
| `ReportBuilder` | Builds `McpAuditReport` (summary, servers, deduped findings) |

### Adding a rule

1. Implement `AuditRule`
2. Register it — **no engine changes required**

```ts
import { AuditEngine, RuleRegistry, createDefaultRules } from "@behalfid/mcp-audit";
import type { AuditRule, AuditContext, McpAuditFinding } from "@behalfid/mcp-audit";

class MyRule implements AuditRule {
  id = "my-rule";
  name = "My Rule";
  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    return [];
  }
}

const registry = RuleRegistry.empty()
  .registerAll(createDefaultRules())
  .register(new MyRule());

const engine = new AuditEngine({ registry });
```

## Built-in rules

| Rule | Category | Notes |
|------|----------|-------|
| Untrusted Server | `untrusted-server` | high — not trusted/approved |
| Dangerous Tool | `dangerous-tool` | shell / exec / process tools |
| Filesystem Access | `filesystem-access` | unrestricted / home / recursive |
| Network Access | `network-access` | outbound / fetch / HTTP / arbitrary URLs |
| Credential Exposure | `credential-exposure` | keys/tokens/secrets — values never in evidence |
| Missing Approval | `missing-approval` | emits `require-approval` action |
| Fail Open | `fail-open` | critical — allow when policy fails |
| Unenforced Policy | `unenforced-policy` | policies configured but not applied |
| Configuration Issues | `configuration` | duplicates, missing fields, malformed tools |

## Scoring

| Severity | Deduction |
|----------|-----------|
| critical | −30 |
| high | −15 |
| medium | −7 |
| low | −3 |

Final score is clamped to `[0, 100]`.

## License

MIT
