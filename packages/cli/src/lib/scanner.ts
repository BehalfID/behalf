import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

export type RiskLevel = "high" | "medium" | "low";

export interface Finding {
  name: string;
  source: string;
  command?: string;
  action: string;
  resource?: string;
  risk: RiskLevel;
  reason: string;
  suggestion: string;
}

export interface ScanResult {
  dir: string;
  findings: Finding[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function relPath(dir: string, abs: string): string {
  return relative(dir, abs) || abs;
}

function suggestion(action: string, flags: string): string {
  return `behalf permissions create <agentId> --action ${action} ${flags}`;
}

// ── package.json script rules ─────────────────────────────────────────────

interface ScriptRule {
  namePattern?: RegExp;
  cmdPattern?: RegExp;
  action: string;
  resource?: string;
  risk: RiskLevel;
  reason: string;
  flags: string;
}

const SCRIPT_RULES: ScriptRule[] = [
  // Deploy — name-based
  {
    namePattern: /\bdeploy(?::?prod(?:uction)?)?\b/i,
    action: "deploy",
    resource: "vercel.com",
    risk: "high",
    reason: "Deploys code to a remote environment — may target production",
    flags: "--action deploy --resource vercel.com --requires-approval",
  },
  // Deploy — vercel CLI in command
  {
    cmdPattern: /vercel\s+(?:--prod|deploy)/,
    action: "deploy",
    resource: "vercel.com",
    risk: "high",
    reason: "Vercel production deploy detected",
    flags: "--action deploy --resource vercel.com --requires-approval",
  },
  // Deploy — netlify CLI
  {
    cmdPattern: /netlify\s+deploy/,
    action: "deploy",
    resource: "netlify.com",
    risk: "high",
    reason: "Netlify deploy detected",
    flags: "--action deploy --resource netlify.com --requires-approval",
  },
  // Deploy — heroku
  {
    cmdPattern: /heroku\s+(?:push|deploy|releases:promote)/,
    action: "deploy",
    resource: "heroku.com",
    risk: "high",
    reason: "Heroku deploy detected",
    flags: "--action deploy --resource heroku.com --requires-approval",
  },
  // Deploy — fly.io
  {
    cmdPattern: /fly\s+deploy/,
    action: "deploy",
    resource: "fly.io",
    risk: "high",
    reason: "Fly.io deploy detected",
    flags: "--action deploy --resource fly.io --requires-approval",
  },
  // Deploy — docker push
  {
    cmdPattern: /docker\s+(?:push|buildx\s+build\b.*--push)/,
    action: "deploy",
    resource: "docker.io",
    risk: "medium",
    reason: "Docker image push to registry",
    flags: "--action deploy --resource docker.io --requires-approval",
  },
  // DB migration (name-based)
  {
    namePattern: /\bdb:(?:migrate|push|schema[:-]push)\b/i,
    action: "db:migrate",
    risk: "high",
    reason: "Database schema migration — can be irreversible",
    flags: "--action db:migrate --requires-approval",
  },
  // DB migration — prisma migrate deploy or db push
  {
    cmdPattern: /prisma\s+(?:migrate\s+deploy|db\s+push)/,
    action: "db:migrate",
    risk: "high",
    reason: "Prisma schema migration detected",
    flags: "--action db:migrate --requires-approval",
  },
  // DB migration — drizzle-kit push or migrate
  {
    cmdPattern: /drizzle-kit\s+(?:push|migrate|generate)/,
    action: "db:migrate",
    risk: "high",
    reason: "Drizzle schema push/migration detected",
    flags: "--action db:migrate --requires-approval",
  },
  // DB destroy
  {
    namePattern: /\bdb:(?:reset|drop|destroy|wipe|purge|flush)\b/i,
    action: "db:destroy",
    risk: "high",
    reason: "Destructive database operation — will erase data",
    flags: "--action db:destroy --blocked 'db:reset,db:drop,db:wipe'",
  },
  // Prisma migrate reset
  {
    cmdPattern: /prisma\s+migrate\s+reset/,
    action: "db:destroy",
    risk: "high",
    reason: "Prisma migrate reset will drop and recreate the database",
    flags: "--action db:destroy --blocked 'db:reset'",
  },
  // Stripe (name-based)
  {
    namePattern: /\bstripe\b/i,
    action: "payment",
    resource: "stripe.com",
    risk: "medium",
    reason: "Stripe payment integration — governs financial operations",
    flags: "--action payment --resource stripe.com --requires-approval",
  },
  // Stripe CLI (cmd-based)
  {
    cmdPattern: /stripe\s+(?:trigger|listen|fixtures|charges|customers)/,
    action: "payment",
    resource: "stripe.com",
    risk: "medium",
    reason: "Stripe CLI usage detected",
    flags: "--action payment --resource stripe.com --requires-approval",
  },
  // Seed
  {
    namePattern: /\b(?:db:)?seed(?:s|:run|:fresh)?\b/i,
    action: "db:seed",
    risk: "medium",
    reason: "Database seeding — writes data to the database",
    flags: "--action db:seed --requires-approval",
  },
  // Release / publish
  {
    namePattern: /\b(?:release|publish)\b/i,
    action: "publish",
    risk: "medium",
    reason: "Package or artifact publishing — affects public artifacts",
    flags: "--action publish --requires-approval",
  },
  {
    cmdPattern: /\bnpm\s+publish\b/,
    action: "publish",
    risk: "medium",
    reason: "npm publish detected in script",
    flags: "--action publish --requires-approval",
  },
  // Destructive rm -rf
  {
    cmdPattern: /\brm\s+-[a-z]*r[a-z]*f\b|\brm\s+-[a-z]*f[a-z]*r\b/,
    action: "file:delete",
    risk: "high",
    reason: "Recursive file deletion (rm -rf) detected",
    flags: "--action file:delete --blocked 'file:delete'",
  },
  // Remote shell / ssh
  {
    cmdPattern: /\b(?:ssh|rsync|scp)\b/,
    action: "remote:execute",
    risk: "medium",
    reason: "Remote execution or file transfer via SSH/rsync",
    flags: "--action remote:execute --requires-approval",
  },
];

function matchScriptRule(name: string, cmd: string, rule: ScriptRule): boolean {
  if (rule.namePattern && rule.namePattern.test(name)) return true;
  if (rule.cmdPattern && rule.cmdPattern.test(cmd)) return true;
  return false;
}

function scanPackageJson(dir: string, findings: Finding[]): void {
  const pkgPath = join(dir, "package.json");
  const text = readText(pkgPath);
  if (!text) return;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return;
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts || typeof scripts !== "object") return;

  const seen = new Set<string>();

  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== "string") continue;

    for (const rule of SCRIPT_RULES) {
      if (!matchScriptRule(name, cmd, rule)) continue;

      const key = `${name}::${rule.action}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        name,
        source: relPath(dir, pkgPath),
        command: `npm run ${name}`,
        action: rule.action,
        resource: rule.resource,
        risk: rule.risk,
        reason: rule.reason,
        suggestion: suggestion(rule.action, rule.flags.replace(/^--action\s+\S+\s+/, "")),
      });
      break;
    }
  }
}

// ── Vercel config ─────────────────────────────────────────────────────────

function scanVercelConfig(dir: string, findings: Finding[]): void {
  const candidates = ["vercel.json", "vercel.ts"];
  for (const name of candidates) {
    const path = join(dir, name);
    const text = readText(path);
    if (!text) continue;

    findings.push({
      name: "vercel config",
      source: relPath(dir, path),
      action: "deploy",
      resource: "vercel.com",
      risk: "high",
      reason: "Vercel project config present — deploys can target production",
      suggestion: suggestion("deploy", "--resource vercel.com --requires-approval"),
    });
    return;
  }
}

// ── Netlify config ────────────────────────────────────────────────────────

function scanNetlifyConfig(dir: string, findings: Finding[]): void {
  const path = join(dir, "netlify.toml");
  const text = readText(path);
  if (!text) return;

  findings.push({
    name: "netlify config",
    source: relPath(dir, path),
    action: "deploy",
    resource: "netlify.com",
    risk: "high",
    reason: "Netlify config present — deploys can target production",
    suggestion: suggestion("deploy", "--resource netlify.com --requires-approval"),
  });
}

// ── Prisma ────────────────────────────────────────────────────────────────

function scanPrismaConfig(dir: string, findings: Finding[]): void {
  const schemaPath = join(dir, "prisma", "schema.prisma");
  if (!existsSync(schemaPath)) return;

  findings.push({
    name: "prisma schema",
    source: relPath(dir, schemaPath),
    action: "db:migrate",
    risk: "high",
    reason: "Prisma schema detected — migrations can alter production database",
    suggestion: suggestion("db:migrate", "--requires-approval"),
  });

  const migrationsDir = join(dir, "prisma", "migrations");
  if (existsSync(migrationsDir)) {
    findings.push({
      name: "prisma migrations",
      source: relPath(dir, migrationsDir),
      action: "db:migrate",
      risk: "high",
      reason: "Prisma migrations directory present — schema changes tracked",
      suggestion: suggestion("db:migrate", "--requires-approval"),
    });
  }
}

// ── Drizzle ───────────────────────────────────────────────────────────────

function scanDrizzleConfig(dir: string, findings: Finding[]): void {
  const candidates = [
    "drizzle.config.ts",
    "drizzle.config.js",
    "drizzle.config.mjs",
  ];
  for (const name of candidates) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;

    findings.push({
      name: "drizzle config",
      source: relPath(dir, path),
      action: "db:migrate",
      risk: "high",
      reason: "Drizzle ORM config detected — migrations can alter production database",
      suggestion: suggestion("db:migrate", "--requires-approval"),
    });
    return;
  }
}

// ── Docker Compose ────────────────────────────────────────────────────────

function scanDockerCompose(dir: string, findings: Finding[]): void {
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "docker-compose.prod.yml",
    "docker-compose.production.yml",
  ];
  for (const name of candidates) {
    const path = join(dir, name);
    const text = readText(path);
    if (!text) continue;

    const isProd = /prod(?:uction)?/i.test(name);
    findings.push({
      name: name,
      source: relPath(dir, path),
      action: "deploy",
      resource: "docker.io",
      risk: isProd ? "high" : "medium",
      reason: isProd
        ? "Production Docker Compose config — container deployments"
        : "Docker Compose config — container orchestration",
      suggestion: suggestion("deploy", "--resource docker.io --requires-approval"),
    });
  }
}

// ── GitHub Actions ────────────────────────────────────────────────────────

const GH_DEPLOY_PATTERNS = [
  /uses:\s*(?:actions\/deploy-pages|vercel\/action|nwtgck\/actions-netlify|akhileshns\/heroku-deploy|superfly\/flyctl-actions|appleboy\/ssh-action)/i,
  /\b(?:fly\s+deploy|vercel\s+--prod|netlify\s+deploy\s+--prod|heroku\s+releases:promote)\b/,
  /\bkubectl\s+(?:apply|rollout|set\s+image)\b/,
  /\baws\s+(?:s3\s+sync|cloudformation\s+deploy|ecs\s+update-service)\b/,
  /\bgcloud\s+(?:app\s+deploy|run\s+deploy|compute\s+instances)\b/,
];

const GH_DESTRUCTIVE_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f\b/,
  /\bdropdb\b|\bdrop\s+database\b|\btruncate\b/i,
  /\bprisma\s+migrate\s+reset\b/,
];

const GH_STRIPE_PATTERNS = [/\bstripe\b/i];

function scanGithubWorkflows(dir: string, findings: Finding[]): void {
  const wfDir = join(dir, ".github", "workflows");
  if (!existsSync(wfDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(wfDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (![".yml", ".yaml"].includes(extname(entry))) continue;
    const path = join(wfDir, entry);
    const text = readText(path);
    if (!text) continue;

    const src = relPath(dir, path);

    if (GH_DEPLOY_PATTERNS.some(p => p.test(text))) {
      findings.push({
        name: entry,
        source: src,
        action: "deploy",
        risk: "high",
        reason: "GitHub Actions workflow contains a deployment step",
        suggestion: suggestion("deploy", "--requires-approval"),
      });
    }

    if (GH_DESTRUCTIVE_PATTERNS.some(p => p.test(text))) {
      findings.push({
        name: entry,
        source: src,
        action: "db:destroy",
        risk: "high",
        reason: "GitHub Actions workflow contains a destructive database or file operation",
        suggestion: suggestion("db:destroy", "--blocked 'db:reset,db:drop,file:delete'"),
      });
    }

    if (GH_STRIPE_PATTERNS.some(p => p.test(text))) {
      findings.push({
        name: entry,
        source: src,
        action: "payment",
        resource: "stripe.com",
        risk: "medium",
        reason: "GitHub Actions workflow references Stripe",
        suggestion: suggestion("payment", "--resource stripe.com --requires-approval"),
      });
    }

    // Flag workflows triggered on push to main/master/production
    if (/on:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- (?:main|master|production|release)/m.test(text)) {
      findings.push({
        name: entry,
        source: src,
        action: "ci:auto-deploy",
        risk: "medium",
        reason: "Workflow auto-triggers on push to a production branch",
        suggestion: suggestion("ci:auto-deploy", "--requires-approval"),
      });
    }
  }
}

// ── .env.example ──────────────────────────────────────────────────────────

const ENV_RESOURCE_HINTS: Array<{ pattern: RegExp; resource: string; action: string }> = [
  { pattern: /STRIPE/i, resource: "stripe.com", action: "payment" },
  { pattern: /OPENAI/i, resource: "api.openai.com", action: "llm:call" },
  { pattern: /ANTHROPIC/i, resource: "api.anthropic.com", action: "llm:call" },
  { pattern: /VERCEL/i, resource: "vercel.com", action: "deploy" },
  { pattern: /NETLIFY/i, resource: "netlify.com", action: "deploy" },
  { pattern: /GITHUB_TOKEN/i, resource: "github.com", action: "repo:write" },
  { pattern: /AWS_(?:ACCESS_KEY|SECRET|SESSION_TOKEN)/i, resource: "aws.amazon.com", action: "cloud:access" },
  { pattern: /GCP|GOOGLE_APPLICATION_CREDENTIALS/i, resource: "gcp.google.com", action: "cloud:access" },
  { pattern: /TWILIO/i, resource: "twilio.com", action: "sms:send" },
  { pattern: /SENDGRID/i, resource: "sendgrid.com", action: "email:send" },
  { pattern: /RESEND/i, resource: "resend.com", action: "email:send" },
  { pattern: /POSTMARK/i, resource: "postmarkapp.com", action: "email:send" },
  { pattern: /PUSHER/i, resource: "pusher.com", action: "realtime:publish" },
  { pattern: /SLACK/i, resource: "slack.com", action: "chat:send" },
  { pattern: /DATABASE_URL|POSTGRES|MONGODB|MYSQL|REDIS/i, resource: "database", action: "db:access" },
];

function scanEnvExample(dir: string, findings: Finding[]): void {
  // Only scan .env.example — never .env (which may contain real secrets)
  const path = join(dir, ".env.example");
  const text = readText(path);
  if (!text) return;

  const lines = text.split("\n");
  const seenResources = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Extract key only — do NOT capture or print values
    const key = trimmed.split("=")[0].trim();
    if (!key) continue;

    for (const hint of ENV_RESOURCE_HINTS) {
      if (!hint.pattern.test(key)) continue;
      if (seenResources.has(hint.resource)) continue;
      seenResources.add(hint.resource);

      findings.push({
        name: key,
        source: relPath(dir, path),
        action: hint.action,
        resource: hint.resource,
        risk: "medium",
        reason: `Environment variable suggests ${hint.resource} integration`,
        suggestion: suggestion(hint.action, `--resource ${hint.resource} --requires-approval`),
      });
    }
  }
}

// ── Shell scripts ─────────────────────────────────────────────────────────

const SHELL_DESTRUCTIVE: Array<{ pattern: RegExp; action: string; risk: RiskLevel; reason: string; flags: string }> = [
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*f\b/,
    action: "file:delete",
    risk: "high",
    reason: "Recursive file deletion (rm -rf)",
    flags: "--action file:delete --blocked 'file:delete'",
  },
  {
    pattern: /\bdropdb\b|\bdrop\s+(?:database|table)\b/i,
    action: "db:destroy",
    risk: "high",
    reason: "Database drop command in shell script",
    flags: "--action db:destroy --blocked 'db:drop,db:destroy'",
  },
  {
    pattern: /\bprisma\s+migrate\s+reset\b/,
    action: "db:destroy",
    risk: "high",
    reason: "Prisma migrate reset will erase the database",
    flags: "--action db:destroy --blocked 'db:reset'",
  },
  {
    pattern: /\bkubectl\s+delete\b/,
    action: "infra:delete",
    risk: "high",
    reason: "kubectl delete in shell script — removes cluster resources",
    flags: "--action infra:delete --blocked 'infra:delete'",
  },
  {
    pattern: /\bterraform\s+destroy\b/,
    action: "infra:delete",
    risk: "high",
    reason: "Terraform destroy in shell script — removes all provisioned infrastructure",
    flags: "--action infra:delete --blocked 'infra:delete'",
  },
  {
    pattern: /\bfly\s+apps\s+destroy\b|\bheroku\s+apps:destroy\b/,
    action: "infra:delete",
    risk: "high",
    reason: "App destroy command in shell script",
    flags: "--action infra:delete --blocked 'infra:delete'",
  },
];

function scanShellScripts(dir: string, findings: Finding[]): void {
  const searchDirs = [dir, join(dir, "scripts"), join(dir, "bin")];

  for (const searchDir of searchDirs) {
    if (!existsSync(searchDir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(searchDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(searchDir, entry);
      try {
        if (!statSync(entryPath).isFile()) continue;
      } catch {
        continue;
      }

      const ext = extname(entry);
      const isShell = ext === ".sh" || ext === ".bash" || ext === "" && entry.startsWith("deploy");
      if (!isShell && ext !== ".sh") continue;

      const text = readText(entryPath);
      if (!text) continue;

      const src = relPath(dir, entryPath);
      const seen = new Set<string>();

      for (const rule of SHELL_DESTRUCTIVE) {
        if (!rule.pattern.test(text)) continue;
        if (seen.has(rule.action)) continue;
        seen.add(rule.action);

        findings.push({
          name: entry,
          source: src,
          action: rule.action,
          risk: rule.risk,
          reason: rule.reason,
          suggestion: suggestion(rule.action, rule.flags.replace(/^--action\s+\S+\s+/, "")),
        });
      }
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────

export function scanProject(dir: string): ScanResult {
  const findings: Finding[] = [];

  scanPackageJson(dir, findings);
  scanVercelConfig(dir, findings);
  scanNetlifyConfig(dir, findings);
  scanPrismaConfig(dir, findings);
  scanDrizzleConfig(dir, findings);
  scanDockerCompose(dir, findings);
  scanGithubWorkflows(dir, findings);
  scanEnvExample(dir, findings);
  scanShellScripts(dir, findings);

  return { dir, findings };
}
