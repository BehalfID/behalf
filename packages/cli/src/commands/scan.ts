import { Command } from "commander";
import { isJsonMode, printError, printJson } from "../lib/output.js";
import { scanProject, type Finding, type RiskLevel } from "../lib/scanner.js";

const RISK_COLOR: Record<RiskLevel, string> = {
  high:   "\x1b[31m",
  medium: "\x1b[33m",
  low:    "\x1b[36m",
};
const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";
const BOLD  = "\x1b[1m";

function riskLabel(risk: RiskLevel): string {
  const color = RISK_COLOR[risk];
  return `${color}${risk.toUpperCase().padEnd(6)}${RESET}`;
}

function printFinding(f: Finding): void {
  const resource = f.resource ? ` → ${f.resource}` : "";
  console.log(`  ${riskLabel(f.risk)}  ${BOLD}${f.name}${RESET}  ${DIM}${f.source}${RESET}`);
  console.log(`         action: ${f.action}${resource}`);
  console.log(`         reason: ${f.reason}`);
  if (f.command) {
    console.log(`        command: ${DIM}${f.command}${RESET}`);
  }
  console.log(`       ${DIM}→ ${f.suggestion}${RESET}`);
  console.log();
}

function groupByRisk(findings: Finding[]): Finding[] {
  const order: RiskLevel[] = ["high", "medium", "low"];
  return [...findings].sort((a, b) => order.indexOf(a.risk) - order.indexOf(b.risk));
}

export function scanCommand() {
  return new Command("scan")
    .description("inspect the local repo and suggest BehalfID policies for risky operations")
    .argument("[dir]", "directory to scan (defaults to current directory)", ".")
    .option("--json", "output machine-readable JSON (also accepted as a global flag)")
    .action(async (dir: string) => {
      try {
        const { resolve } = await import("node:path");
        const absDir = resolve(dir);

        if (!isJsonMode()) {
          console.log(`\nScanning ${absDir} ...\n`);
        }

        const result = scanProject(absDir);

        if (isJsonMode()) {
          printJson({
            dir: result.dir,
            findings: result.findings,
            summary: {
              total: result.findings.length,
              high:   result.findings.filter(f => f.risk === "high").length,
              medium: result.findings.filter(f => f.risk === "medium").length,
              low:    result.findings.filter(f => f.risk === "low").length,
            },
          });
          return;
        }

        const sorted = groupByRisk(result.findings);

        if (sorted.length === 0) {
          console.log("  No risky operations detected.\n");
          console.log(`  ${DIM}Checked: package.json scripts, Vercel/Netlify config, Prisma/Drizzle schema,${RESET}`);
          console.log(`  ${DIM}         Docker Compose, GitHub Actions, .env.example, shell scripts.${RESET}\n`);
          return;
        }

        const high   = sorted.filter(f => f.risk === "high").length;
        const medium = sorted.filter(f => f.risk === "medium").length;
        const low    = sorted.filter(f => f.risk === "low").length;

        const parts: string[] = [];
        if (high)   parts.push(`${RISK_COLOR.high}${high} high${RESET}`);
        if (medium) parts.push(`${RISK_COLOR.medium}${medium} medium${RESET}`);
        if (low)    parts.push(`${RISK_COLOR.low}${low} low${RESET}`);

        console.log(`Found ${sorted.length} potentially risky operation(s): ${parts.join(", ")}\n`);

        for (const f of sorted) {
          printFinding(f);
        }

        console.log(`${DIM}Replace <agentId> with your agent ID (e.g. agent_xxx).${RESET}`);
        console.log(`${DIM}Run \`behalf permissions create --help\` for all available options.${RESET}\n`);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
