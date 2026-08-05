/**
 * Enforceable guards against Mongo-specific assumptions leaking above the
 * repository layer.
 *
 * Three production incidents in a row came from exactly that:
 *   - `$exists` in a shared account filter, which the Postgres adapters reject
 *   - `findLogs(...).lean()`, a Mongoose query method the Postgres adapter's
 *     plain Promise does not have
 *   - `createWebhookEvent(null, …)` substituting a user id for an account id,
 *     which Mongo stored happily and Postgres rejected with a foreign-key
 *     violation (SQLSTATE 23503)
 *
 * Each was invisible until production traffic hit it. These guards make the
 * pattern fail in CI instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Adapters are where backend-specific code is *supposed* to live. */
const ADAPTER_PREFIXES = [
  join("lib", "repositories", "mongo"),
  join("lib", "repositories", "postgres"),
  join("lib", "repositories", "mongoModelAdapter.ts"),
  join("lib", "repositories", "dualRead.ts"),
  join("lib", "db")
];

function collect(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if ([".ts", ".tsx"].includes(extname(entry))) out.push(full);
  }
  return out;
}

/** Application + route code that must stay backend-neutral. */
const SHARED_FILES = [...collect(join(ROOT, "app")), ...collect(join(ROOT, "lib"))]
  .map((f) => relative(ROOT, f))
  .filter((f) => !ADAPTER_PREFIXES.some((prefix) => f.startsWith(prefix)))
  .filter((f) => !f.endsWith(".d.ts"));

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Deliberately Mongo-specific modules, each with a reason.
 *
 * These are not "TODO" entries — they are paths that intentionally talk to
 * Mongo directly and are not reachable through a Postgres-backed facade. Any
 * file added here needs a justification; the point of the list is that adding
 * to it is a visible decision rather than a silent regression.
 */
const MONGO_ONLY_ALLOWLIST: Record<string, string> = {
  // Operates on the Mongoose model directly and must also match legacy empty
  // strings, which the backend-neutral null clause does not express.
  "lib/workspaceSlugServer.ts": "direct Mongoose model access for slug backfill",
  // Console-admin bootstrap, Mongo-only by design.
  "lib/consoleAdmins.ts": "console admin bootstrap reads the Mongo model directly",
  // Reports Mongo connection health; being Mongo-specific is the point.
  "app/api/health/db/route.ts": "Mongo connection health probe",
  "app/api/console/settings/route.ts": "console settings read the Mongo connection state"
};

function offenders(pattern: RegExp, extraFilter?: (file: string) => boolean) {
  const hits: string[] = [];
  for (const file of SHARED_FILES) {
    if (file in MONGO_ONLY_ALLOWLIST) continue;
    if (extraFilter && !extraFilter(file)) continue;
    const source = withoutComments(readFileSync(join(ROOT, file), "utf-8"));
    if (pattern.test(source)) hits.push(file);
  }
  return hits;
}

describe("no Mongo query methods above the repository layer", () => {
  it("nothing calls .lean() outside the Mongo adapters", () => {
    // The decision-history 500 was `findLogs(...).lean is not a function`.
    expect(offenders(/\.lean\s*[<(]/)).toEqual([]);
  });

  it("nothing chains Mongoose query builders onto repository results", () => {
    // `repo(...).sort(...)` / `.limit(...)` only exists on a Mongoose Query.
    // Backend-neutral callers pass sort/limit/skip/select inside `options`.
    const chained = /\b(find|list|get)[A-Za-z]*\([^)]*\)\s*\.\s*(select|sort|limit|skip)\s*\(/;
    expect(offenders(chained)).toEqual([]);
  });

  it("no shared code imports a Mongoose model directly", () => {
    expect(offenders(/from\s+["']mongoose["']/)).toEqual([]);
  });
});

describe("no unsupported Mongo operators in shared filters", () => {
  it("nothing passes $exists into a repository facade", () => {
    // The agents list 500 was "Unsupported agent filter operator: $exists".
    expect(offenders(/\$exists/)).toEqual([]);
  });

  it.each(["$where", "$regex", "$text", "$expr"])(
    "nothing passes %s into a repository facade",
    (operator) => {
      const pattern = new RegExp(`\\${operator}\\b`);
      // Route/lib code must not hand these to a backend-neutral facade.
      expect(offenders(pattern, (f) => f.startsWith("app/api"))).toEqual([]);
    }
  );
});

describe("webhook events stay referentially valid", () => {
  it("no route builds an account-scoped event with a null account id", () => {
    // `webhook_events.account_id` is NOT NULL and a foreign key to accounts.
    // `createWebhookEvent(null, …)` used to fall back to the developer's user
    // id, which violated that constraint and 500'd *after* the agent commit.
    const hits = offenders(/createWebhookEvent\(\s*null\s*,/, (f) => f.startsWith("app/"));
    expect(hits).toEqual([]);
  });

  it("createWebhookEvent refuses to invent an account id", async () => {
    const { createWebhookEvent } = await import("@/lib/webhooks");
    expect(createWebhookEvent(null, "agent.created", {}, "user_1")).toBeNull();
    expect(createWebhookEvent(undefined, "agent.created", {}, "user_1")).toBeNull();
    expect(createWebhookEvent("acct_1", "agent.created", {}, "user_1")?.accountId).toBe("acct_1");
  });

  it("emitWebhookEvent cannot fail a request that already committed", async () => {
    const { emitWebhookEvent } = await import("@/lib/webhooks");
    // Signature-level guarantee: it resolves to a boolean, never rejects.
    const source = withoutComments(readFileSync(join(ROOT, "lib/webhooks.ts"), "utf-8"));
    expect(source).toMatch(/export async function emitWebhookEvent[\s\S]{0,600}try\s*\{/);
    expect(source).toMatch(/catch\s*\([\s\S]{0,400}webhook_event_enqueue_failed/);
    await expect(emitWebhookEvent(null)).resolves.toBe(false);
  });
});

describe("routes that hand back a one-time secret", () => {
  const SECRET_ROUTES = [
    "app/api/dashboard/agents/route.ts",
    "app/api/dashboard/agents/first-setup/route.ts",
    "app/api/dashboard/agents/[agentId]/rotate-key/route.ts"
  ];

  it.each(SECRET_ROUTES)("%s returns a structured 500 rather than throwing", (path) => {
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    expect(source).toContain("serverErrorResponse");
    expect(source).toMatch(/try\s*\{/);
  });

  it.each(SECRET_ROUTES)("%s emits its event only after the commit", (path) => {
    // Compare positions in the handler body, not the import block.
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    const body = source.slice(source.indexOf("export async function POST"));
    const commit = Math.max(body.indexOf("createDeveloperAgent"), body.indexOf("updateAgent("));
    const emit = body.indexOf("emitWebhookEvent");
    expect(commit).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(commit);
  });

  it.each(SECRET_ROUTES)("%s never logs the plaintext key", (path) => {
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    // No logger/console call may reference the key variable.
    expect(source).not.toMatch(/(console\.\w+|logger\.\w+)\([^)]*\bapiKey\b/);
  });
});

describe("the resolved workspace actor is the source of truth", () => {
  // Behavioural coverage lives in agent-creation-workspace-resolution.test.ts;
  // this guard stops the pattern being reintroduced in a new mutation route.
  const CREATION_ROUTES = [
    "app/api/dashboard/agents/route.ts",
    "app/api/dashboard/agents/first-setup/route.ts"
  ];

  it.each(CREATION_ROUTES)("%s reads activeAccountId only to resolve the actor", (path) => {
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    for (const match of source.matchAll(/auth\.activeAccountId/g)) {
      const line = source.slice(0, match.index).split("\n").pop() ?? "";
      const context = source.slice(match.index ?? 0, (match.index ?? 0) + 200);
      const isResolverInput =
        line.includes("requireWorkspaceMutationActor") ||
        line.includes("getWorkspaceActor") ||
        context.startsWith("auth.activeAccountId)");
      expect(
        isResolverInput,
        `${path} uses auth.activeAccountId outside actor resolution: "${line.trim()}"`
      ).toBe(true);
    }
  });

  it.each(CREATION_ROUTES)("%s binds one authoritative accountId after authorization", (path) => {
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    expect(source).toMatch(/const accountId = workspace\.actor\.accountId;/);
    // Optional chaining after a successful authorization means the code still
    // treats the actor as possibly absent.
    expect(source).not.toContain("workspace.actor?.");
  });

  it.each(CREATION_ROUTES)("%s narrows the actor before using it", (path) => {
    const source = withoutComments(readFileSync(join(ROOT, path), "utf-8"));
    expect(source).toContain("if (workspace.error || !workspace.actor) return workspace.error;");
  });
});

describe("repository facades stay backend-neutral", () => {
  it("every facade export goes through delegate()", () => {
    const facades = readdirSync(join(ROOT, "lib", "repositories"))
      .filter((f) => f.endsWith(".ts"))
      .filter(
        (f) =>
          ![
            "backend.ts",
            "delegate.ts",
            "composition.ts",
            "dualRead.ts",
            "errors.ts",
            "index.ts",
            "mongoModelAdapter.ts"
          ].includes(f)
      );

    const leaks: string[] = [];
    for (const facade of facades) {
      const source = withoutComments(
        readFileSync(join(ROOT, "lib", "repositories", facade), "utf-8")
      );
      for (const match of source.matchAll(/export const (\w+)\s*=\s*([^;]+);/g)) {
        if (!match[2].includes("delegate(")) leaks.push(`${facade}:${match[1]}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
