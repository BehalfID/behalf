import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_PACKAGE_NAME = "@behalfid/cli";
export const NPM_LATEST_URL = `https://registry.npmjs.org/${CLI_PACKAGE_NAME}/latest`;

declare const __BEHALF_CLI_VERSION__: string | undefined;

/** Resolve the running CLI version (build define, else package.json). */
export function getCliVersion(packageJsonPath?: string): string {
  if (typeof __BEHALF_CLI_VERSION__ === "string" && __BEHALF_CLI_VERSION__) {
    return __BEHALF_CLI_VERSION__;
  }
  const pkgPath =
    packageJsonPath ??
    join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  try {
    return (JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

/** Compare dotted semver-ish versions. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((p) => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type LatestVersionFetch = {
  latest: string | null;
  error?: string;
};

/**
 * Best-effort latest version from npm. Never throws; callers treat failures as skip.
 */
export async function fetchLatestCliVersion(opts: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  url?: string;
} = {}): Promise<LatestVersionFetch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const url = opts.url ?? NPM_LATEST_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { latest: null, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== "string" || !body.version.trim()) {
      return { latest: null, error: "missing version" };
    }
    return { latest: body.version.trim() };
  } catch (err) {
    return {
      latest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type VersionCheckResult = {
  name: "CLI version";
  status: "ok" | "warn";
  detail: string;
  fix?: string;
};

/** Non-blocking update advisory for `behalf doctor`. */
export async function checkCliVersionUpdate(opts: {
  currentVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  url?: string;
} = {}): Promise<VersionCheckResult> {
  const current = opts.currentVersion ?? getCliVersion();
  const { latest, error } = await fetchLatestCliVersion(opts);
  if (!latest) {
    return {
      name: "CLI version",
      status: "ok",
      detail: `${current} (update check skipped${error ? `: ${error}` : ""})`,
    };
  }
  if (compareSemver(latest, current) > 0) {
    return {
      name: "CLI version",
      status: "warn",
      detail: `${current} (latest ${latest})`,
      fix: `Update with \`npm install -g ${CLI_PACKAGE_NAME}@latest\`.`,
    };
  }

  return {
    name: "CLI version",
    status: "ok",
    detail: latest === current ? current : `${current} (npm latest ${latest})`,
  };
}
