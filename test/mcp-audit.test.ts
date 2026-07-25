import { beforeEach, describe, expect, it } from "vitest";
import {
  AuditEngine,
  RuleRegistry,
  ScoreCalculator,
  createDefaultRules,
  normalizeMcpConfig,
  resetFindingIdCounter,
  type AuditRule,
  type McpAuditConfiguration,
  type McpAuditFinding,
} from "../packages/mcp-audit/src/index";

const FIXED_NOW = new Date("2026-07-18T12:00:00.000Z");

function engine(): AuditEngine {
  return new AuditEngine({ now: () => FIXED_NOW });
}

beforeEach(() => {
  resetFindingIdCounter();
});

describe("AuditEngine — report generation", () => {
  it("produces a successful report with generatedAt, summary, findings, and servers", async () => {
    const configuration: McpAuditConfiguration = {
      sourcePath: ".mcp.json",
      trustedServers: ["behalfid"],
      servers: [
        {
          name: "behalfid",
          command: "behalf",
          args: ["mcp", "start"],
          trusted: true,
          tools: [{ name: "verify_action", requiresApproval: false }],
        },
      ],
    };

    const report = await engine().audit(configuration);

    expect(report.generatedAt).toBe("2026-07-18T12:00:00.000Z");
    expect(report.summary).toBeDefined();
    expect(report.summary.serverCount).toBe(1);
    expect(report.summary.securityScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.securityScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.findings)).toBe(true);
    expect(report.servers).toHaveLength(1);
    expect(report.servers[0]).toMatchObject({
      name: "behalfid",
      trusted: true,
      toolCount: 1,
    });
  });

  it("handles empty configuration", async () => {
    const report = await engine().audit({ servers: [] });

    expect(report.summary.serverCount).toBe(0);
    expect(report.summary.totalFindings).toBe(0);
    expect(report.summary.securityScore).toBe(100);
    expect(report.findings).toEqual([]);
    expect(report.servers).toEqual([]);
  });

  it("audits multiple servers", async () => {
    const report = await engine().audit({
      trustedServers: ["safe"],
      servers: [
        { name: "safe", command: "safe-mcp", trusted: true },
        { name: "risky", command: "risky-mcp" },
        {
          name: "net",
          command: "net-mcp",
          capabilities: { networkUnrestricted: true },
        },
      ],
    });

    expect(report.summary.serverCount).toBe(3);
    expect(report.servers).toHaveLength(3);
    expect(report.findings.some((f) => f.serverName === "risky")).toBe(true);
    expect(report.findings.some((f) => f.category === "network-access")).toBe(true);
  });

  it("produces multiple findings across categories", async () => {
    const report = await engine().audit({
      failOpenDefault: true,
      servers: [
        {
          name: "shell-server",
          command: "npx",
          failOpen: true,
          env: { API_KEY: "sk-abcdefghijklmnopqrstuvwxyz012345" },
          capabilities: {
            shellAccess: true,
            filesystemUnrestricted: true,
            networkUnrestricted: true,
          },
          tools: [
            {
              name: "run_shell",
              description: "Execute shell commands",
              requiresApproval: false,
            },
          ],
        },
      ],
    });

    const categories = new Set(report.findings.map((f) => f.category));
    expect(categories.has("fail-open")).toBe(true);
    expect(categories.has("credential-exposure")).toBe(true);
    expect(categories.has("dangerous-tool")).toBe(true);
    expect(categories.has("filesystem-access")).toBe(true);
    expect(categories.has("network-access")).toBe(true);
    expect(categories.has("missing-approval")).toBe(true);
    expect(categories.has("untrusted-server")).toBe(true);
    expect(report.summary.totalFindings).toBeGreaterThan(3);
    expect(report.summary.securityScore).toBeLessThan(100);
  });
});

describe("ScoreCalculator", () => {
  it("starts at 100 and deducts by severity weights", () => {
    const calc = new ScoreCalculator();
    const findings = [
      { severity: "critical" },
      { severity: "high" },
      { severity: "medium" },
      { severity: "low" },
    ] as McpAuditFinding[];

    // 100 - 30 - 15 - 7 - 3 = 45
    expect(calc.calculate(findings)).toBe(45);
  });

  it("clamps the score between 0 and 100", () => {
    const calc = new ScoreCalculator();
    const many = Array.from({ length: 10 }, () => ({
      severity: "critical",
    })) as McpAuditFinding[];

    expect(calc.calculate([])).toBe(100);
    expect(calc.calculate(many)).toBe(0);
  });
});

describe("duplicate findings", () => {
  it("deduplicates identical findings and merges evidence", async () => {
    const duplicateRule: AuditRule = {
      id: "dup-test",
      name: "Dup Test",
      async execute() {
        return [
          {
            id: "a",
            ruleId: "dup-test",
            category: "configuration",
            severity: "low",
            title: "Same finding",
            description: "dup",
            evidence: ["path=a"],
            serverName: "s1",
          },
          {
            id: "b",
            ruleId: "dup-test",
            category: "configuration",
            severity: "low",
            title: "Same finding",
            description: "dup",
            evidence: ["path=b"],
            serverName: "s1",
          },
        ];
      },
    };

    const registry = RuleRegistry.empty().register(duplicateRule);
    const auditEngine = new AuditEngine({ registry, now: () => FIXED_NOW });
    const report = await auditEngine.audit({
      servers: [{ name: "s1", command: "x" }],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.evidence).toEqual(
      expect.arrayContaining(["path=a", "path=b"])
    );
  });
});

describe("malformed configuration", () => {
  it("flags servers missing command/url and unnamed tools", async () => {
    const report = await engine().audit({
      trustedServers: ["broken"],
      servers: [
        {
          name: "broken",
          trusted: true,
          tools: [{ name: "" }],
        },
      ],
    });

    expect(report.findings.some((f) => f.category === "configuration")).toBe(true);
    expect(
      report.findings.some((f) =>
        f.title.includes("Invalid server config") || f.description.includes("command and url")
      )
    ).toBe(true);
    expect(
      report.findings.some((f) => f.title.includes("Malformed tool"))
    ).toBe(true);
  });

  it("flags duplicate server names", async () => {
    const report = await engine().audit({
      trustedServers: ["dup"],
      servers: [
        { name: "dup", command: "a", trusted: true },
        { name: "dup", command: "b", trusted: true },
      ],
    });

    expect(
      report.findings.some(
        (f) => f.category === "configuration" && f.title.includes("Duplicate")
      )
    ).toBe(true);
  });

  it("normalizeMcpConfig handles invalid roots safely", () => {
    const empty = normalizeMcpConfig(null, { sourcePath: ".mcp.json" });
    expect(empty.servers).toEqual([]);

    const bad = normalizeMcpConfig("not-an-object", { sourcePath: ".mcp.json" });
    expect(bad.servers[0]?.raw).toMatchObject({ invalidRoot: true });
  });
});

describe("credential detection", () => {
  it("detects credentials without exposing secret values in evidence", async () => {
    const secret = "sk-super-secret-value-do-not-leak-12345";
    const report = await engine().audit({
      trustedServers: ["creds"],
      servers: [
        {
          name: "creds",
          command: "mcp",
          trusted: true,
          env: {
            OPENAI_API_KEY: secret,
            BEARER_TOKEN: `Bearer ${secret}`,
            HARMLESS: "hello",
          },
        },
      ],
    });

    const credFindings = report.findings.filter(
      (f) => f.category === "credential-exposure"
    );
    expect(credFindings.length).toBeGreaterThanOrEqual(1);

    const evidenceBlob = JSON.stringify(credFindings);
    expect(evidenceBlob).not.toContain(secret);
    expect(evidenceBlob).toContain("[redacted]");
    expect(evidenceBlob).toContain("OPENAI_API_KEY");
  });
});

describe("approval detection", () => {
  it("flags tools that should require approval and emits require-approval action", async () => {
    const report = await engine().audit({
      trustedServers: ["ops"],
      servers: [
        {
          name: "ops",
          command: "mcp",
          trusted: true,
          tools: [
            { name: "deploy_production", requiresApproval: false },
            { name: "list_files", requiresApproval: false },
            { name: "delete_resource", requiresApproval: true },
          ],
        },
      ],
    });

    const missing = report.findings.filter((f) => f.category === "missing-approval");
    expect(missing.some((f) => f.toolName === "deploy_production")).toBe(true);
    expect(missing.some((f) => f.toolName === "list_files")).toBe(false);
    expect(missing.some((f) => f.toolName === "delete_resource")).toBe(false);

    const deploy = missing.find((f) => f.toolName === "deploy_production");
    expect(deploy?.action?.type).toBe("require-approval");
    expect(deploy?.action?.draftPayload).toMatchObject({
      serverName: "ops",
      toolName: "deploy_production",
      requiresApproval: true,
    });
  });
});

describe("extensibility", () => {
  it("runs custom registered rules without engine changes", async () => {
    const custom: AuditRule = {
      id: "custom-rule",
      name: "Custom",
      async execute() {
        return [
          {
            id: "custom-1",
            ruleId: "custom-rule",
            category: "configuration",
            severity: "low",
            title: "Custom finding",
            description: "from plugin",
            evidence: ["custom=true"],
          },
        ];
      },
    };

    const registry = RuleRegistry.empty()
      .registerAll(createDefaultRules())
      .register(custom);

    const report = await new AuditEngine({
      registry,
      now: () => FIXED_NOW,
    }).audit({ servers: [] });

    expect(report.findings.some((f) => f.ruleId === "custom-rule")).toBe(true);
  });
});

describe("unenforced policy", () => {
  it("detects policies that are never applied", async () => {
    const report = await engine().audit({
      trustedServers: ["a"],
      servers: [{ name: "a", command: "x", trusted: true, appliedPolicyIds: [] }],
      policies: [
        { id: "pol-1", name: "Strict", enforced: false },
        { id: "pol-2", name: "Orphan", enforced: true },
      ],
    });

    const unenforced = report.findings.filter(
      (f) => f.category === "unenforced-policy"
    );
    expect(unenforced.length).toBeGreaterThanOrEqual(2);
    expect(unenforced.some((f) => f.action?.type === "enable-profile")).toBe(true);
  });
});

describe("normalizeMcpConfig", () => {
  it("maps .mcp.json-style servers into audit configuration", () => {
    const config = normalizeMcpConfig(
      {
        mcpServers: {
          behalfid: {
            type: "stdio",
            command: "behalf",
            args: ["mcp", "start"],
          },
        },
      },
      { sourcePath: ".mcp.json", trustedServers: ["behalfid"] }
    );

    expect(config.servers).toHaveLength(1);
    expect(config.servers[0]).toMatchObject({
      name: "behalfid",
      command: "behalf",
      args: ["mcp", "start"],
    });
    expect(config.trustedServers).toEqual(["behalfid"]);
  });
});
