import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type AuditModule = {
  AuditEngine: new (opts?: { now?: () => Date }) => {
    audit: (configuration: unknown) => Promise<unknown>;
  };
  normalizeMcpConfig: (
    raw: unknown,
    options?: { sourcePath?: string; trustedServers?: string[] }
  ) => unknown;
};

async function loadAuditModule(): Promise<AuditModule> {
  const require = createRequire(import.meta.url);
  try {
    return require("@behalfid/mcp-audit") as AuditModule;
  } catch {
    // Monorepo fallback when the package is not linked into node_modules.
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, "../../../mcp-audit/dist/index.js"),
      join(here, "../../../mcp-audit/src/index.ts"),
    ];
    for (const candidate of candidates) {
      try {
        return (await import(pathToFileURL(candidate).href)) as AuditModule;
      } catch {
        // try next
      }
    }
    throw new Error(
      "Could not load @behalfid/mcp-audit. Build packages/mcp-audit or install the dependency."
    );
  }
}

export async function runLocalMcpAudit(
  raw: unknown,
  options?: { sourcePath?: string; trustedServers?: string[] }
) {
  const mod = await loadAuditModule();
  const configuration = mod.normalizeMcpConfig(raw, {
    sourcePath: options?.sourcePath ?? ".mcp.json",
    trustedServers: options?.trustedServers ?? ["behalfid", "behalf"],
  });
  const engine = new mod.AuditEngine();
  const report = (await engine.audit(configuration)) as {
    generatedAt: string;
    summary: {
      securityScore: number;
      totalFindings: number;
      bySeverity: Record<string, number>;
      serverCount: number;
    };
    findings: Array<{
      id: string;
      severity: string;
      category: string;
      title: string;
      description: string;
      serverName?: string;
      remediation?: string;
      evidence: string[];
    }>;
    servers: Array<{
      name: string;
      trusted: boolean;
      toolCount: number;
      findingCount: number;
      riskLevel: string;
    }>;
  };
  return report;
}
