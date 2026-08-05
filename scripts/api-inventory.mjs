/**
 * Derive the API surface from the route files themselves.
 *
 * docs/API.md is hand-maintained and drifts; this walks `app/api/**` and reads
 * every exported HTTP method plus the signals that matter for review: what
 * authenticates the route, whether it mutates, whether it hands back a
 * one-time secret, which repositories it touches, and what already covers it.
 *
 *   node scripts/api-inventory.mjs            # write docs/API_TEST_MATRIX.md
 *   node scripts/api-inventory.mjs --json     # machine-readable, for tests
 *   node scripts/api-inventory.mjs --check    # fail if the doc is stale
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");
const DOC_PATH = join(ROOT, "docs", "API_TEST_MATRIX.md");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

/** `app/api/dashboard/agents/[agentId]/route.ts` → `/api/dashboard/agents/:agentId` */
function canonicalPath(file) {
  const rel = relative(join(ROOT, "app"), file).split(sep).slice(0, -1).join("/");
  return "/" + rel.replace(/\[\.\.\.(\w+)\]/g, "*$1").replace(/\[(\w+)\]/g, ":$1");
}

function exportedMethods(source) {
  const found = new Set();
  for (const method of HTTP_METHODS) {
    const patterns = [
      new RegExp(`export\\s+async\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s+const\\s+${method}\\s*[:=]`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`)
    ];
    if (patterns.some((p) => p.test(source))) found.add(method);
  }
  return [...found];
}

const AUTH_SIGNALS = [
  ["requireVerifiedDeveloperApi", "session (verified developer)"],
  ["requireDeveloperApi", "session (developer)"],
  ["getCurrentDeveloper", "session (developer)"],
  ["requireConsoleApi", "console admin"],
  ["requireConsoleAdmin", "console admin"],
  ["requireConsoleSession", "console admin"],
  ["requireHumanDeveloperApi", "session (human developer)"],
  ["requireSlackSignature", "slack signature"],
  ["verifySlackRequest", "slack signature"],
  ["requireSetupTokenOrConsoleSession", "setup token / console session"],
  ["authenticateDeveloperToken", "developer API token"],
  ["resolveApiToken", "developer API token"],
  ["requireAgentApiKey", "agent API key"],
  ["authenticateAgent", "agent API key"],
  ["authenticateApiKey", "agent API key"],
  ["requirePassportToken", "passport token"],
  ["verifyWebhookSignature", "signed webhook"],
  ["stripeWebhookSignature", "stripe signature"],
  ["constructStripeEvent", "stripe signature"],
  ["checkRateLimit", "rate-limited"]
];

const ROLE_SIGNALS = [
  ["requireWorkspaceMutationActor", "workspace mutation authority"],
  ["getWorkspaceActor", "workspace member"],
  ["canRevokePermission", "permission-grant authority"],
  ["requireOwner", "owner"]
];

function detect(source, signals) {
  const hits = signals.filter(([needle]) => source.includes(needle)).map(([, label]) => label);
  return [...new Set(hits)];
}

function repositoriesUsed(source) {
  return [
    ...new Set(
      [...source.matchAll(/@\/lib\/repositories\/([A-Za-z0-9]+)/g)].map((m) => m[1])
    )
  ].sort();
}

/** Owning host, mirroring lib/subdomainRouting ownership prefixes. */
function owningHost(path) {
  if (path.startsWith("/api/console")) return "console";
  if (path.startsWith("/api/dashboard") || path.startsWith("/api/billing")) return "app";
  if (path === "/api/consent-ping") return "any (host-neutral)";
  if (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/passport") ||
    path.startsWith("/api/onboarding") ||
    path.startsWith("/api/invites")
  ) {
    return "auth";
  }
  return "www";
}

const SECRET_SIGNALS = ["createApiKey", "apiKey", "createWebhookSecret", "plaintext", "token:"];

function returnsOneTimeSecret(source, methods) {
  if (!methods.some((m) => m !== "GET")) return false;
  return (
    (source.includes("createApiKey") && source.includes("apiKey")) ||
    // Agent creation mints the key inside this helper and hands it straight back.
    source.includes("createDeveloperAgent") ||
    (source.includes("createWebhookSecret") && source.includes("secret"))
  );
}

function collectCoverage() {
  const testDir = join(ROOT, "test");
  const map = new Map();
  const files = [];
  const walkTests = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkTests(full);
      else if (/\.test\.tsx?$/.test(entry)) files.push(full);
    }
  };
  walkTests(testDir);
  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    for (const m of source.matchAll(/@\/app\/(api\/[A-Za-z0-9._\-\[\]\/]+)\/route/g)) {
      const key = "/" + m[1];
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(relative(ROOT, file));
    }
  }
  return map;
}

function criticality(path, mutates, secret) {
  if (secret) return "P0";
  if (path.startsWith("/api/verify") || path.startsWith("/api/gateway")) return "P0";
  if (path.includes("/auth/") || path.includes("/approvals")) return "P0";
  if (mutates) return "P1";
  if (path.startsWith("/api/dashboard")) return "P1";
  return "P2";
}

const coverage = collectCoverage();
const routes = [];

for (const file of walk(API_ROOT).sort()) {
  const source = readFileSync(file, "utf-8");
  const path = canonicalPath(file);
  const methods = exportedMethods(source);
  const mutates = methods.some((m) => m !== "GET" && m !== "HEAD" && m !== "OPTIONS");
  const secret = returnsOneTimeSecret(source, methods);
  const rel = relative(ROOT, file);
  // Coverage is keyed by the import specifier, which uses the bracket form.
  const importKey = "/" + relative(join(ROOT, "app"), file).split(sep).slice(0, -1).join("/");
  const tests = [...(coverage.get(importKey) ?? [])];

  routes.push({
    file: rel,
    path,
    methods,
    host: owningHost(path),
    auth: detect(source, AUTH_SIGNALS),
    role: detect(source, ROLE_SIGNALS),
    validates: source.includes("rejectUnknownFields") || source.includes("readJsonObject"),
    structuredErrors: source.includes("serverErrorResponse"),
    mutates,
    returnsOneTimeSecret: secret,
    sideEffects: [
      source.includes("emitWebhookEvent") ? "webhook event" : null,
      source.includes("sendEmail") ? "email" : null,
      source.includes("stripe") ? "stripe" : null
    ].filter(Boolean),
    repositories: repositoriesUsed(source),
    tests,
    criticality: criticality(path, mutates, secret)
  });
}

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(routes, null, 2));
  process.exit(0);
}

const totalMethods = routes.reduce((n, r) => n + r.methods.length, 0);
const uncovered = routes.filter((r) => r.tests.length === 0);
const mutating = routes.filter((r) => r.mutates);
const secretRoutes = routes.filter((r) => r.returnsOneTimeSecret);

const lines = [];
lines.push("# API test matrix");
lines.push("");
lines.push("<!-- GENERATED by scripts/api-inventory.mjs — do not edit by hand.");
lines.push("     Regenerate: npm run api:inventory -->");
lines.push("");
lines.push(
  "Derived from the route files under `app/api/**`, not from `docs/API.md`. " +
    "Each row is one route module; a module may export several HTTP methods."
);
lines.push("");
lines.push("## Totals");
lines.push("");
lines.push(`- Route modules: **${routes.length}**`);
lines.push(`- Exported HTTP handlers: **${totalMethods}**`);
lines.push(`- Mutating modules: **${mutating.length}**`);
lines.push(`- Modules returning a one-time secret: **${secretRoutes.length}**`);
lines.push(`- Modules with no direct handler test: **${uncovered.length}**`);
lines.push("");
lines.push("`Direct test` means a test imports the route module and invokes its handler.");
lines.push("Route-contract coverage (`test/api-route-contracts.test.ts`) additionally");
lines.push("exercises every handler generically and is not listed per row.");
lines.push("");
lines.push("## Routes returning a one-time secret");
lines.push("");
lines.push("These are the highest-risk handlers: a failure after the commit destroys a");
lines.push("credential the caller can never retrieve again.");
lines.push("");
lines.push("| Method(s) | Path | Structured errors | Side effects | Direct tests |");
lines.push("| --- | --- | --- | --- | --- |");
for (const r of secretRoutes) {
  lines.push(
    `| ${r.methods.join(", ")} | \`${r.path}\` | ${r.structuredErrors ? "yes" : "**no**"} | ${
      r.sideEffects.join(", ") || "—"
    } | ${r.tests.length ? r.tests.length : "**none**"} |`
  );
}
lines.push("");
lines.push("## Full inventory");
lines.push("");
lines.push(
  "| Method(s) | Path | Host | Auth | Role | Mutates | Secret | Side effects | Repositories | Structured 500 | Direct tests | Criticality |"
);
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of routes) {
  lines.push(
    "| " +
    [
      r.methods.join(", "),
      `\`${r.path}\``,
      r.host,
      r.auth.join("; ") || "public/none detected",
      r.role.join("; ") || "—",
      r.mutates ? "yes" : "no",
      r.returnsOneTimeSecret ? "**yes**" : "no",
      r.sideEffects.join(", ") || "—",
      r.repositories.join(", ") || "—",
      r.structuredErrors ? "yes" : "no",
      r.tests.length || "—",
      r.criticality
    ].join(" | ") +
    " |"
  );
}
lines.push("");
lines.push("## Known gaps");
lines.push("");
lines.push(
  "- `findOneVerificationLog` **is** implemented and bound in the Postgres adapter " +
    "(`lib/repositories/postgres/verificationLogs.ts`, aliased from `findOneLog`) and no " +
    "live route reaches it. The earlier parity concern is closed; the adapter-parity " +
    "test keeps it that way."
);
lines.push(
  "- Modules with no direct handler test are still covered generically by the " +
    "route-contract suite. Rows marked P0/P1 without a direct test are the backlog."
);
lines.push("");

const doc = lines.join("\n");

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(DOC_PATH, "utf-8");
  } catch {
    /* missing counts as stale */
  }
  if (current.trim() !== doc.trim()) {
    console.error("docs/API_TEST_MATRIX.md is stale. Run: npm run api:inventory");
    process.exit(1);
  }
  console.log("docs/API_TEST_MATRIX.md is up to date.");
  process.exit(0);
}

writeFileSync(DOC_PATH, doc);
console.log(
  `Wrote ${relative(ROOT, DOC_PATH)} — ${routes.length} route modules, ${totalMethods} handlers, ` +
    `${secretRoutes.length} returning a one-time secret, ${uncovered.length} without a direct test.`
);
