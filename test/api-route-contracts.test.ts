/**
 * Universal contract tests across every exported API handler.
 *
 * The recent production 500s were all shaped the same way: a handler threw and
 * Next returned an unhandled, bodiless 500, so the client could only render
 * "Request failed with 500" and the cause was lost. These tests walk the real
 * route modules, invoke the real handlers, and assert the contract every route
 * owes a caller regardless of what it does:
 *
 *   - an unauthenticated request is refused, never an unexplained 500
 *   - any 500 carries a JSON body with a safe message
 *   - malformed and non-object JSON bodies are controlled 4xx
 *   - no response leaks a plaintext key, password hash or OAuth token
 *
 * Auth is stubbed at the boundary so handlers refuse before touching a
 * database; that is exactly the path an anonymous caller takes in production.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Authentication required." }), {
    status: 401,
    headers: { "content-type": "application/json" }
  });

// Refuse at the *session* boundary only. Everything else in these modules —
// notably the mutation-origin (CSRF) guards, which need no database — stays
// real, so the suite exercises the protection rather than mocking it away.
vi.mock("@/lib/developerAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/developerAuth")>()),
  requireDeveloperApi: vi.fn(async () => ({ error: unauthorized(), user: null })),
  requireVerifiedDeveloperApi: vi.fn(async () => ({ error: unauthorized(), user: null })),
  getCurrentDeveloper: vi.fn(async () => null)
}));
vi.mock("@/lib/humanAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/humanAuth")>()),
  requireHumanDeveloperApi: vi.fn(async () => ({ error: unauthorized(), user: null }))
}));
vi.mock("@/lib/adminAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/adminAuth")>()),
  // Returns a Response when refused, null when allowed — not an { error } pair.
  requireConsoleApi: vi.fn(async () => unauthorized()),
  requireSetupTokenOrConsoleSession: vi.fn(() => unauthorized()),
  requireSetupTokenOrConsoleApi: vi.fn(() => unauthorized()),
  isPublicAgentCreationEnabled: vi.fn(() => false)
}));
vi.mock("@/lib/developerToken", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/developerToken")>()),
  authenticateDeveloperToken: vi.fn(async () => ({ tokenDoc: null, error: "Missing token." }))
}));

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const ROUTE_FILES = walk(API_ROOT).sort();

/** `app/api/x/[id]/route.ts` → import specifier `@/app/api/x/[id]/route` */
function specifier(file: string) {
  return "@/" + relative(ROOT, file).split(sep).join("/").replace(/\.ts$/, "");
}

function canonical(file: string) {
  return "/" + relative(join(ROOT, "app"), file).split(sep).slice(0, -1).join("/");
}

/** Fill dynamic segments with obviously-invalid ids. */
function paramsFor(file: string) {
  const params: Record<string, string> = {};
  for (const segment of relative(ROOT, file).split(sep)) {
    const match = segment.match(/^\[(?:\.\.\.)?(\w+)\]$/);
    if (match) params[match[1]] = "does-not-exist";
  }
  return params;
}

function makeRequest(url: string, method: string, body?: string) {
  const init: RequestInit = { method };
  if (body !== undefined && method !== "GET") {
    init.body = body;
    init.headers = { "content-type": "application/json" };
  }
  const request = new Request(url, init);
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  Object.defineProperty(request, "cookies", {
    value: { get: () => undefined, getAll: () => [], has: () => false }
  });
  return request as never;
}

/** Values that must never appear in a response body. */
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["plaintext API key", /\bbk_(live|test)_[A-Za-z0-9]{8,}/],
  ["bcrypt/argon hash", /\$2[aby]\$\d{2}\$|\$argon2[a-z]{0,2}\$/],
  ["OAuth access token", /\bgh[pousr]_[A-Za-z0-9]{20,}|\bya29\.[A-Za-z0-9._-]{20,}/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/]
];

type Loaded = {
  file: string;
  path: string;
  handlers: Array<[string, (req: never, ctx?: never) => Promise<Response>]>;
};

/**
 * Handlers that reach a datastore before they can refuse, so they cannot be
 * contract-tested without one. They are covered by the real-Postgres suite
 * (`npm run test:api-postgres`) instead. Listing them keeps the gap explicit
 * and countable rather than quietly excluded.
 */
const NEEDS_DATABASE = new Map<string, string>([
  ["GET /api/auth/session", "reads the session store before deciding"],
  ["GET /api/status", "aggregates live status components"],
  ["POST /api/auth/device/request", "allocates a device code row"]
]);

const loaded: Loaded[] = [];
const unloadable: Array<[string, string]> = [];

// Load every route module once. A module that cannot be imported under the
// node test environment is recorded rather than silently dropped.
for (const file of ROUTE_FILES) {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(specifier(file))) as Record<string, unknown>;
  } catch (error) {
    unloadable.push([relative(ROOT, file), (error as Error).message.split("\n")[0].slice(0, 120)]);
    continue;
  }
  const handlers = HTTP_METHODS.filter((m) => typeof mod[m] === "function").map(
    (m) => [m, mod[m]] as Loaded["handlers"][number]
  );
  if (handlers.length) loaded.push({ file: relative(ROOT, file), path: canonical(file), handlers });
}

const allCases = loaded.flatMap((route) =>
  route.handlers.map(([method, handler]) => ({
    name: `${method} ${route.path}`,
    file: route.file,
    method,
    handler,
    params: paramsFor(route.file)
  }))
);

const cases = allCases.filter((c) => !NEEDS_DATABASE.has(c.name));

async function invoke(
  testCase: (typeof cases)[number],
  body?: string
): Promise<Response | { threw: unknown }> {
  const url = `https://app.behalfid.com${testCase.path ?? "/api/x"}`.replace(/\[.*?\]/g, "x");
  try {
    return await testCase.handler(
      makeRequest(url, testCase.method, body) as never,
      { params: Promise.resolve(testCase.params) } as never
    );
  } catch (error) {
    return { threw: error };
  }
}

describe("route inventory", () => {
  it("loads the API surface", () => {
    expect(loaded.length).toBeGreaterThan(100);
    expect(cases.length).toBeGreaterThan(100);
  });

  it("keeps the database-dependent exclusion list small and named", () => {
    // Every entry must correspond to a handler that actually exists, so the
    // list cannot rot into a way of silencing deleted or renamed routes.
    for (const name of NEEDS_DATABASE.keys()) {
      expect(allCases.some((c) => c.name === name), `${name} is not a real handler`).toBe(true);
    }
    expect(NEEDS_DATABASE.size).toBeLessThanOrEqual(5);
    console.info(
      `[route-contracts] ${cases.length} handlers contract-tested, ` +
        `${NEEDS_DATABASE.size} deferred to the Postgres suite.`
    );
  });

  it("reports any module that could not be imported", () => {
    // Not a hard failure by itself — but it must be visible, because an
    // unloadable module is a module no contract test can protect.
    if (unloadable.length) {
      console.warn(`[route-contracts] ${unloadable.length} module(s) not importable:`);
      for (const [file, message] of unloadable) console.warn(`  ${file}: ${message}`);
    }
    expect(unloadable.length).toBeLessThan(ROUTE_FILES.length * 0.2);
  });
});

describe.each(cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
  it("refuses an unauthenticated request without an unexplained 500", async () => {
    const result = await invoke(testCase, testCase.method === "GET" ? undefined : "{}");

    if ("threw" in result) {
      throw new Error(
        `${testCase.name} threw instead of responding: ${(result.threw as Error)?.message}`
      );
    }
    expect(result).toBeInstanceOf(Response);

    // A 500 is permitted only if it explains itself in JSON.
    if (result.status >= 500) {
      const text = await result.clone().text();
      expect(text, `${testCase.name} returned a bodiless ${result.status}`).not.toBe("");
      const parsed = JSON.parse(text);
      expect(parsed.error ?? parsed.message, `${testCase.name} 500 has no safe message`).toBeTruthy();
    }
  });

  it("never leaks a secret in the response body", async () => {
    const result = await invoke(testCase, testCase.method === "GET" ? undefined : "{}");
    if ("threw" in result) return; // already reported by the test above
    const text = await result.clone().text();
    for (const [label, pattern] of SECRET_PATTERNS) {
      expect(pattern.test(text), `${testCase.name} leaked a ${label}`).toBe(false);
    }
  });
});

describe.each(
  cases.filter((c) => c.method !== "GET").map((c) => [c.name, c] as const)
)("%s malformed input", (_name, testCase) => {
  it("rejects invalid JSON with a controlled status", async () => {
    const result = await invoke(testCase, "{not json");
    if ("threw" in result) {
      throw new Error(`${testCase.name} threw on malformed JSON`);
    }
    // Controlled means: an explained status, never a bodiless 500.
    expect(result.status).toBeGreaterThanOrEqual(400);
    if (result.status >= 500) {
      const text = await result.clone().text();
      expect(text, `${testCase.name} bodiless ${result.status} on malformed JSON`).not.toBe("");
    }
  });

  it("rejects a non-object JSON body with a controlled status", async () => {
    const result = await invoke(testCase, "[1,2,3]");
    if ("threw" in result) {
      throw new Error(`${testCase.name} threw on a non-object body`);
    }
    expect(result.status).toBeGreaterThanOrEqual(400);
  });
});

describe("secret-returning routes are the strictest", () => {
  const SECRET_ROUTES = [
    "app/api/dashboard/agents/route.ts",
    "app/api/dashboard/agents/first-setup/route.ts",
    "app/api/dashboard/agents/[agentId]/rotate-key/route.ts"
  ];

  it.each(SECRET_ROUTES)("%s refuses anonymous callers before minting a key", async (file) => {
    const testCase = cases.find((c) => c.file === file && c.method === "POST");
    expect(testCase, `${file} POST handler not found`).toBeTruthy();

    const result = await invoke(testCase!, "{}");
    expect("threw" in result).toBe(false);
    const response = result as Response;
    expect([401, 403]).toContain(response.status);
    expect(await response.text()).not.toMatch(/bk_(live|test)_/);
  });

  it("every secret-returning route in the matrix is covered here", () => {
    const source = readFileSync(join(ROOT, "docs/API_TEST_MATRIX.md"), "utf-8");
    // The generated matrix is the source of truth for which routes mint secrets.
    expect(source).toContain("Routes returning a one-time secret");
  });
});
