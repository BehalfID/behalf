import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { scanProject, type Finding } from "../packages/cli/src/lib/scanner";

// ── helpers ──────────────────────────────────────────────────────────────

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "behalf-scan-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

function findingsFor(findings: Finding[], action: string): Finding[] {
  return findings.filter(f => f.action === action);
}

// ── package.json script detection ─────────────────────────────────────────

describe("scanProject — package.json scripts", () => {
  it("detects a deploy script by name", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "deploy:prod": "vercel --prod" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "deploy")).toBe(true);
  });

  it("detects a deploy script from vercel CLI command body", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "ship": "vercel --prod" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "deploy" && f.resource === "vercel.com")).toBe(true);
  });

  it("detects Netlify deploy", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "publish": "netlify deploy --prod" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.resource === "netlify.com")).toBe(true);
  });

  it("detects prisma migrate deploy", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "migrate": "prisma migrate deploy" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:migrate")).toBe(true);
  });

  it("detects drizzle-kit push", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "db:push": "drizzle-kit push" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:migrate")).toBe(true);
  });

  it("detects prisma migrate reset as destructive", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "db:nuke": "prisma migrate reset --force" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:destroy")).toBe(true);
    expect(findings.find(f => f.action === "db:destroy")?.risk).toBe("high");
  });

  it("detects stripe script by name", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "stripe:seed": "stripe fixtures" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "payment")).toBe(true);
  });

  it("detects seed script", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "db:seed": "tsx scripts/seed.ts" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:seed")).toBe(true);
  });

  it("detects rm -rf in script command", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "clean": "rm -rf dist node_modules" },
    }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "file:delete")).toBe(true);
  });

  it("produces a suggestion string containing behalf permissions create", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "deploy:prod": "vercel --prod" },
    }));
    const { findings } = scanProject(dir);
    const f = findings.find(f => f.action === "deploy");
    expect(f?.suggestion).toMatch(/behalf permissions create/);
  });

  it("returns empty findings for a package.json with no risky scripts", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "dev": "next dev", "lint": "eslint .", "test": "vitest" },
    }));
    const { findings } = scanProject(dir);
    // May still get 0 findings for benign scripts
    const risky = findings.filter(f => f.action === "deploy" || f.action === "db:migrate");
    expect(risky).toHaveLength(0);
  });

  it("handles malformed package.json gracefully", () => {
    const dir = tempDir();
    write(dir, "package.json", "{ not valid json }}}");
    expect(() => scanProject(dir)).not.toThrow();
    const { findings } = scanProject(dir);
    // No package.json findings expected
    expect(findings.filter(f => f.source === "package.json")).toHaveLength(0);
  });

  it("handles missing package.json gracefully", () => {
    const dir = tempDir();
    expect(() => scanProject(dir)).not.toThrow();
  });
});

// ── Vercel / Netlify config ───────────────────────────────────────────────

describe("scanProject — Vercel and Netlify config", () => {
  it("detects vercel.json", () => {
    const dir = tempDir();
    write(dir, "vercel.json", JSON.stringify({ framework: "nextjs" }));
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source === "vercel.json" && f.action === "deploy")).toBe(true);
  });

  it("detects netlify.toml", () => {
    const dir = tempDir();
    write(dir, "netlify.toml", "[build]\n  command = \"npm run build\"\n  publish = \"dist\"\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source === "netlify.toml" && f.action === "deploy")).toBe(true);
  });
});

// ── Prisma / Drizzle ──────────────────────────────────────────────────────

describe("scanProject — Prisma and Drizzle schema files", () => {
  it("detects prisma/schema.prisma", () => {
    const dir = tempDir();
    write(dir, "prisma/schema.prisma", "datasource db { provider = \"postgresql\" url = env(\"DATABASE_URL\") }");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source.includes("schema.prisma"))).toBe(true);
    expect(findings.find(f => f.source.includes("schema.prisma"))?.action).toBe("db:migrate");
  });

  it("detects prisma/migrations directory", () => {
    const dir = tempDir();
    write(dir, "prisma/schema.prisma", "");
    write(dir, "prisma/migrations/0001_init/migration.sql", "CREATE TABLE users (id SERIAL PRIMARY KEY);");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source.includes("migrations"))).toBe(true);
  });

  it("detects drizzle.config.ts", () => {
    const dir = tempDir();
    write(dir, "drizzle.config.ts", "export default { schema: './db/schema.ts', out: './migrations' };");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source === "drizzle.config.ts")).toBe(true);
  });
});

// ── Docker Compose ────────────────────────────────────────────────────────

describe("scanProject — Docker Compose", () => {
  it("detects docker-compose.yml", () => {
    const dir = tempDir();
    write(dir, "docker-compose.yml", "version: '3'\nservices:\n  app:\n    image: node:20\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.source === "docker-compose.yml")).toBe(true);
  });

  it("flags docker-compose.prod.yml as high risk", () => {
    const dir = tempDir();
    write(dir, "docker-compose.prod.yml", "version: '3'\nservices:\n  app:\n    image: node:20\n");
    const { findings } = scanProject(dir);
    const f = findings.find(f => f.source === "docker-compose.prod.yml");
    expect(f?.risk).toBe("high");
  });
});

// ── GitHub Actions ────────────────────────────────────────────────────────

describe("scanProject — GitHub Actions workflows", () => {
  it("detects vercel deploy action", () => {
    const dir = tempDir();
    write(dir, ".github/workflows/deploy.yml", `
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vercel/action@v1
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
`);
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "deploy" && f.source.includes("deploy.yml"))).toBe(true);
  });

  it("detects destructive operations in workflow", () => {
    const dir = tempDir();
    write(dir, ".github/workflows/nightly.yml", `
name: Nightly Reset
on:
  schedule:
    - cron: '0 2 * * *'
jobs:
  reset:
    runs-on: ubuntu-latest
    steps:
      - run: prisma migrate reset --force
`);
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:destroy")).toBe(true);
  });

  it("detects Stripe usage in workflow", () => {
    const dir = tempDir();
    write(dir, ".github/workflows/fixtures.yml", `
name: Stripe Fixtures
jobs:
  seed:
    runs-on: ubuntu-latest
    steps:
      - run: stripe fixtures --fixture test/fixtures.json
`);
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "payment" && f.resource === "stripe.com")).toBe(true);
  });

  it("ignores non-yml files in workflows directory", () => {
    const dir = tempDir();
    write(dir, ".github/workflows/README.md", "# Workflows");
    const count = scanProject(dir).findings.filter(f => f.source.includes(".github")).length;
    expect(count).toBe(0);
  });

  it("handles missing .github/workflows directory gracefully", () => {
    const dir = tempDir();
    expect(() => scanProject(dir)).not.toThrow();
  });
});

// ── .env.example ─────────────────────────────────────────────────────────

describe("scanProject — .env.example", () => {
  it("detects Stripe env var and does not expose values", () => {
    const dir = tempDir();
    write(dir, ".env.example", [
      "# Stripe",
      "STRIPE_SECRET_KEY=sk_test_placeholder",
      "STRIPE_WEBHOOK_SECRET=whsec_placeholder",
    ].join("\n"));
    const { findings } = scanProject(dir);
    const f = findings.find(f => f.action === "payment");
    expect(f).toBeDefined();
    expect(f?.resource).toBe("stripe.com");
    // Must NOT expose actual or placeholder values
    expect(f?.suggestion).not.toMatch(/sk_test_placeholder/);
    expect(f?.suggestion).not.toMatch(/whsec_placeholder/);
  });

  it("detects database env var", () => {
    const dir = tempDir();
    write(dir, ".env.example", "DATABASE_URL=postgresql://localhost:5432/mydb\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:access")).toBe(true);
  });

  it("detects OpenAI env var", () => {
    const dir = tempDir();
    write(dir, ".env.example", "OPENAI_API_KEY=sk-placeholder\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.resource === "api.openai.com")).toBe(true);
  });

  it("skips comment lines and blank lines", () => {
    const dir = tempDir();
    write(dir, ".env.example", [
      "# This is a comment",
      "",
      "# Another comment",
      "NEXT_PUBLIC_APP_NAME=MyApp",
    ].join("\n"));
    const { findings } = scanProject(dir);
    // No sensitive env var matches — no findings from .env.example
    expect(findings.filter(f => f.source === ".env.example")).toHaveLength(0);
  });

  it("does not scan .env (only .env.example)", () => {
    const dir = tempDir();
    write(dir, ".env", "STRIPE_SECRET_KEY=sk_live_actualSecret\n");
    const { findings } = scanProject(dir);
    // .env should never be opened — findings source must not be .env
    expect(findings.some(f => f.source === ".env")).toBe(false);
  });

  it("handles missing .env.example gracefully", () => {
    const dir = tempDir();
    expect(() => scanProject(dir)).not.toThrow();
  });
});

// ── Shell scripts ─────────────────────────────────────────────────────────

describe("scanProject — shell scripts", () => {
  it("detects rm -rf in a shell script", () => {
    const dir = tempDir();
    write(dir, "scripts/clean.sh", "#!/bin/bash\nrm -rf ./dist ./build\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "file:delete" && f.source.includes("clean.sh"))).toBe(true);
  });

  it("detects dropdb in scripts/", () => {
    const dir = tempDir();
    write(dir, "scripts/reset.sh", "#!/bin/bash\ndropdb myapp_production\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "db:destroy")).toBe(true);
  });

  it("detects terraform destroy in scripts/", () => {
    const dir = tempDir();
    write(dir, "scripts/teardown.sh", "#!/bin/bash\nterraform destroy -auto-approve\n");
    const { findings } = scanProject(dir);
    expect(findings.some(f => f.action === "infra:delete")).toBe(true);
  });

  it("ignores non-shell files in scripts/", () => {
    const dir = tempDir();
    write(dir, "scripts/config.json", '{ "key": "value" }');
    const count = scanProject(dir).findings.filter(f => f.source.includes("config.json")).length;
    expect(count).toBe(0);
  });
});

// ── ScanResult structure ──────────────────────────────────────────────────

describe("scanProject — result structure", () => {
  it("includes the scanned directory in the result", () => {
    const dir = tempDir();
    const result = scanProject(dir);
    expect(result.dir).toBe(dir);
  });

  it("all findings have required fields", () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: {
        "deploy:prod": "vercel --prod",
        "db:migrate": "prisma migrate deploy",
        "db:seed": "tsx scripts/seed.ts",
      },
    }));
    const { findings } = scanProject(dir);
    for (const f of findings) {
      expect(f.name).toBeTruthy();
      expect(f.source).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(f.risk);
      expect(f.action).toBeTruthy();
      expect(f.reason).toBeTruthy();
      expect(f.suggestion).toMatch(/behalf permissions create/);
    }
  });

  it("returns empty findings for an empty directory", () => {
    const dir = tempDir();
    const { findings } = scanProject(dir);
    expect(findings).toHaveLength(0);
  });
});

// ── CLI command integration (light) ──────────────────────────────────────

describe("scanCommand — CLI output", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints JSON when json mode is active", async () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "deploy:prod": "vercel --prod" },
    }));

    const output = await import("../packages/cli/src/lib/output");
    output.setJsonMode(true);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const { scanCommand } = await import("../packages/cli/src/commands/scan");
    const cmd = scanCommand();
    await cmd.parseAsync(["", "", dir]);

    output.setJsonMode(false);

    const combined = logs.join("\n");
    const parsed = JSON.parse(combined);
    expect(parsed).toHaveProperty("findings");
    expect(parsed).toHaveProperty("summary");
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("prints human-readable output when json mode is off", async () => {
    const dir = tempDir();
    write(dir, "package.json", JSON.stringify({
      scripts: { "deploy:prod": "vercel --prod" },
    }));

    const output = await import("../packages/cli/src/lib/output");
    output.setJsonMode(false);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const { scanCommand } = await import("../packages/cli/src/commands/scan");
    const cmd = scanCommand();
    await cmd.parseAsync(["", "", dir]);

    const combined = logs.join("\n");
    expect(combined).toMatch(/deploy|permissions create/i);
  });

  it("prints 'No risky operations detected' for empty project", async () => {
    const dir = tempDir();

    const output = await import("../packages/cli/src/lib/output");
    output.setJsonMode(false);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const { scanCommand } = await import("../packages/cli/src/commands/scan");
    const cmd = scanCommand();
    await cmd.parseAsync(["", "", dir]);

    expect(logs.join("\n")).toMatch(/No risky operations detected/);
  });
});
