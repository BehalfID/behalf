import { createServer as createNetServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export type EgressMode = "off" | "advise" | "enforce";

export type EgressLaunchOptions = {
  mode: EgressMode;
  baseUrl: string;
  apiKey: string;
  agentId: string;
  /** Extra hosts that should bypass the proxy (comma-joined into NO_PROXY). */
  allowHosts?: string[];
  preferredPort?: number;
  env?: NodeJS.ProcessEnv;
  /** Override proxy spawn for tests. */
  startProxy?: (env: NodeJS.ProcessEnv) => Promise<StartedEgressProxy>;
};

export type StartedEgressProxy = {
  port: number;
  host: string;
  stop: () => Promise<void>;
};

/**
 * Build child process env for HTTP(S)_PROXY injection.
 * Pure function — unit-tested without spawning.
 */
export function buildEgressChildEnv(input: {
  mode: EgressMode;
  proxyHost: string;
  proxyPort: number;
  baseUrl: string;
  parentEnv?: NodeJS.ProcessEnv;
  allowHosts?: string[];
}): NodeJS.ProcessEnv {
  const parent = { ...(input.parentEnv ?? process.env) };
  if (input.mode === "off") return parent;

  const proxyUrl = `http://${input.proxyHost}:${input.proxyPort}`;
  const noProxyParts = new Set<string>([
    "127.0.0.1",
    "localhost",
    "::1",
    ...parseNoProxy(parent.NO_PROXY ?? parent.no_proxy),
    ...parsePlatformHosts(input.baseUrl),
    ...(input.allowHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean)
  ]);

  return {
    ...parent,
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: [...noProxyParts].join(","),
    no_proxy: [...noProxyParts].join(","),
    BEHALFID_EGRESS_MODE: input.mode,
    BEHALFID_EGRESS_PROXY_URL: proxyUrl
  };
}

function parseNoProxy(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePlatformHosts(baseUrl: string): string[] {
  try {
    return [new URL(baseUrl).hostname];
  } catch {
    return ["behalfid.com"];
  }
}

/**
 * Resolve the egress-proxy entrypoint without requiring a monorepo layout.
 * Order: explicit env override → sibling/package paths (dev) → cwd monorepo fallback.
 */
export function resolveEgressProxyCliPath(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const fromEnv = env.BEHALFID_EGRESS_PROXY_CLI?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Published / linked package layouts (CLI next to egress-proxy under node_modules)
    join(here, "..", "..", "..", "@behalfid", "egress-proxy", "dist", "cli.js"),
    join(here, "..", "..", "node_modules", "@behalfid", "egress-proxy", "dist", "cli.js"),
    join(process.cwd(), "node_modules", "@behalfid", "egress-proxy", "dist", "cli.js"),
    // Sibling package in a monorepo checkout (dev)
    join(here, "..", "..", "..", "egress-proxy", "dist", "cli.js"),
    join(here, "..", "..", "..", "..", "packages", "egress-proxy", "dist", "cli.js"),
    join(process.cwd(), "packages", "egress-proxy", "dist", "cli.js"),
    join(process.cwd(), "packages", "egress-proxy", "src", "cli.ts")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function findFreeLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Failed to allocate loopback port."));
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

async function startProxyProcess(env: NodeJS.ProcessEnv): Promise<StartedEgressProxy> {
  const cliPath = resolveEgressProxyCliPath(env);
  if (!cliPath) {
    throw new Error(
      "Egress proxy not found. Set BEHALFID_EGRESS_PROXY_CLI to the @behalfid/egress-proxy CLI path, install the package, build packages/egress-proxy, or set mode=off."
    );
  }

  const isTs = cliPath.endsWith(".ts");
  const isJs = /\.[cm]?js$/i.test(cliPath);
  const child: ChildProcess = isJs || isTs
    ? spawn(
        process.execPath,
        isTs ? ["--import", "tsx", cliPath] : [cliPath],
        {
          env,
          stdio: ["ignore", "pipe", "pipe"]
        }
      )
    : spawn(cliPath, [], {
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });

  if (!child.stdout) {
    throw new Error("Egress proxy stdout pipe missing.");
  }

  const ready = await new Promise<{ host: string; port: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Egress proxy failed to become ready.")), 8_000);
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      try {
        const parsed = JSON.parse(line) as { ready?: boolean; host?: string; port?: number };
        if (parsed.ready && parsed.host && typeof parsed.port === "number") {
          clearTimeout(timer);
          rl.close();
          resolve({ host: parsed.host, port: parsed.port });
        }
      } catch {
        // ignore non-JSON stdout
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Egress proxy exited early (code ${code ?? "?"}).`));
    });
  });

  return {
    host: ready.host,
    port: ready.port,
    stop: async () => {
      if (child.killed) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 2_000);
        child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  };
}

/**
 * Start the local egress proxy (unless mode=off) and return child env + stopper.
 */
export async function prepareEgressLaunch(
  options: EgressLaunchOptions
): Promise<{ env: NodeJS.ProcessEnv; stop: () => Promise<void> }> {
  if (options.mode === "off") {
    return { env: { ...(options.env ?? process.env) }, stop: async () => undefined };
  }

  const preferredPort = options.preferredPort ?? (await findFreeLoopbackPort());
  const proxyEnv: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    BEHALFID_BASE_URL: options.baseUrl,
    BEHALFID_API_KEY: options.apiKey,
    BEHALFID_AGENT_ID: options.agentId,
    BEHALFID_EGRESS_MODE: options.mode,
    BEHALFID_EGRESS_PROXY_PORT: String(preferredPort)
  };

  const started = await (options.startProxy ?? startProxyProcess)(proxyEnv);
  const env = buildEgressChildEnv({
    mode: options.mode,
    proxyHost: started.host,
    proxyPort: started.port,
    baseUrl: options.baseUrl,
    parentEnv: options.env ?? process.env,
    allowHosts: options.allowHosts
  });

  return { env, stop: started.stop };
}

export function parseEgressMode(value: unknown): EgressMode {
  if (value === "off" || value === "advise" || value === "enforce") return value;
  if (value === true || value === "true") return "enforce";
  return "off";
}
