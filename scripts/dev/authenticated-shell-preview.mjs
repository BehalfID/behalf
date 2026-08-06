/**
 * Authenticated dashboard preview for visual verification.
 *
 * The dashboard shell cannot be seen without a session, and a session cannot
 * exist without a database — which is why the first attempt at this port shipped
 * with no authenticated screenshot at all. This boots a disposable Postgres,
 * applies the real migration chain, seeds one verified user with a workspace and
 * a live session, starts the built app against it, and drives Playwright with
 * the session cookie. The screenshots are therefore of the genuine authenticated
 * shell rendering real data.
 *
 * Nothing here touches a real database. The instance is created in a temporary
 * directory and destroyed on exit.
 *
 * Requires a local Postgres binary provider that is deliberately NOT a
 * dependency of this repo:
 *
 *   npm i --no-save embedded-postgres
 *   npm run build
 *   node scripts/dev/authenticated-shell-preview.mjs --out /tmp/shots
 *
 * Options:
 *   --out <dir>    screenshot directory      (default /tmp/behalf-shell-shots)
 *   --plan <plan>  billing plan              (default business)
 *   --comp <plan>  complimentary grant plan  (omit for none)
 *   --role <role>  membership role           (default OWNER)
 *   --keep         leave the server up for manual inspection
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);

let EmbeddedPostgres;
try {
  const mod = require("embedded-postgres");
  EmbeddedPostgres = mod.default ?? mod;
} catch {
  console.error("embedded-postgres is not installed. Run: npm i --no-save embedded-postgres");
  process.exit(1);
}
const { Client } = require("pg");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
};
const OUT = opt("out", "/tmp/behalf-shell-shots");
const PLAN = opt("plan", "business");
const COMP = opt("comp", null);
const ROLE = opt("role", "OWNER");
const KEEP = args.includes("--keep");
const PORT = Number(opt("port", "3222"));
const PG_PORT = Number(opt("pg-port", "55433"));
const BASE = `http://localhost:${PORT}`;
const DB_URL = `postgres://behalf:behalf@localhost:${PG_PORT}/behalf_preview`;

mkdirSync(OUT, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), "behalf-preview-pg-"));

const publicId = (prefix) => `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** The canonical migration chain, in journal order. */
function migrationSql() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  return [...(journal.entries ?? [])]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(`drizzle/${entry.tag}.sql`, "utf8"))
    .join("\n");
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "behalf",
  password: "behalf",
  port: PG_PORT,
  persistent: false
});

let server;
const cleanup = async () => {
  if (server) server.kill("SIGTERM");
  await pg.stop().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
};
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});

console.log("starting disposable postgres…");
await pg.initialise();
await pg.start();
await pg.createDatabase("behalf_preview");

const sessionToken = crypto.randomBytes(32).toString("base64url");
const userId = publicId("user");
const accountId = publicId("acct");

const client = new Client({ connectionString: DB_URL });
await client.connect();
await client.query(migrationSql());
console.log("migrations applied");

await client.query(
  `INSERT INTO accounts
     (account_id, name, slug, account_type, plan, complimentary_plan, complimentary_plan_reason,
      complimentary_plan_granted_by, complimentary_plan_granted_at, verification_count, verification_period_start)
   VALUES ($1, $2, $3, 'business', $4, $5, $6, $7, $8, $9, date_trunc('month', now()))`,
  [
    accountId,
    "BehalfID",
    "behalfid",
    PLAN,
    COMP,
    COMP ? "Preview harness grant" : null,
    COMP ? "preview" : null,
    COMP ? new Date() : null,
    30_300
  ]
);
await client.query(
  `INSERT INTO developer_users (user_id, email, first_name, last_name, email_verified, primary_account_id)
   VALUES ($1, $2, $3, $4, true, $5)`,
  [userId, "jasper@behalfid.dev", "Jasper", "Dragoo", accountId]
);
await client.query(
  `INSERT INTO account_memberships (membership_id, account_id, user_id, role)
   VALUES ($1, $2, $3, $4)`,
  [publicId("mbr"), accountId, userId, ROLE]
);
await client.query(
  `INSERT INTO developer_sessions
     (session_id, user_id, token_hash, active_account_id, expires_at, last_activity_at)
   VALUES ($1, $2, $3, $4, now() + interval '1 day', now())`,
  [publicId("sess"), userId, sha256(sessionToken), accountId]
);
console.log(`seeded "BehalfID" (plan=${PLAN}${COMP ? `, comp=${COMP}` : ""}, role=${ROLE})`);

server = spawn("npm", ["start"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: DB_URL,
    BEHALFID_ALLOW_POSTGRES_RUNTIME: "true",
    BEHALFID_REPOSITORY_BACKEND: "postgres",
    BEHALFID_SUBDOMAIN_ROUTING: "false",
    NEXT_PUBLIC_APP_URL: BASE
  },
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", (chunk) => {
  if (/Error|error/.test(String(chunk))) process.stdout.write(`  [next] ${chunk}`);
});
server.stderr.on("data", (chunk) => process.stderr.write(`  [next!] ${chunk}`));

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/login`, { redirect: "manual" })).status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error("server did not become ready");
  await cleanup();
  process.exit(1);
}
console.log(`server ready at ${BASE}`);

const cookie = {
  name: "behalfid_developer",
  value: sessionToken,
  domain: "localhost",
  path: "/",
  httpOnly: true,
  sameSite: "Lax"
};

const browser = await chromium.launch();
const shots = [];
const consoleErrors = [];
let authenticatedShots = 0;

async function capture(label, { width, height, theme = "dark", prepare } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    deviceScaleFactor: 2
  });
  await context.addCookies([cookie]);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${label}: ${error}`));

  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  const path = new URL(page.url()).pathname;
  const authenticated = path.startsWith("/dashboard") || path.includes("/dashboard");
  if (!authenticated) {
    console.error(`  ${label}: NOT AUTHENTICATED — landed on ${path}`);
    await context.close();
    return;
  }
  authenticatedShots += 1;

  if (prepare) await prepare(page);
  await page.waitForTimeout(500);

  const file = `${OUT}/${label}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`  captured ${label} (${path})`);
  await context.close();
}

const click = (selector) => async (page) => {
  await page.locator(selector).first().click({ timeout: 3000 }).catch(() => {});
};

await capture("desktop-dark", { width: 1536, height: 960, theme: "dark" });
await capture("desktop-light", { width: 1536, height: 960, theme: "light" });
await capture("mobile", { width: 390, height: 844, theme: "dark" });
await capture("switcher-open", {
  width: 1536,
  height: 960,
  prepare: click(".shell-workspace summary, .workspace-switcher summary")
});
await capture("user-menu-open", {
  width: 1536,
  height: 960,
  prepare: click(".shell-user summary, .dashboard-user-menu summary")
});
await capture("mobile-drawer-open", {
  width: 390,
  height: 844,
  prepare: click(".app-mobile-hamburger")
});

console.log(`\n${authenticatedShots}/6 captures were authenticated`);
console.log(`${shots.length} screenshots in ${OUT}`);

const meaningful = [...new Set(consoleErrors)].filter(
  (error) => !/_vercel\/insights|favicon/.test(error)
);
if (meaningful.length) {
  console.log("\nconsole errors:");
  for (const error of meaningful.slice(0, 12)) console.log(`  ${error}`);
} else {
  console.log("no console errors");
}

await browser.close();
await client.end().catch(() => {});

if (KEEP) {
  console.log(`\nserver up at ${BASE}; cookie behalfid_developer=${sessionToken}`);
  await new Promise(() => {});
}

await cleanup();
process.exit(authenticatedShots === 6 ? 0 : 1);
