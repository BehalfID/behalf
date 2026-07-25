/**
 * Staging dual-read helper (PR D): compare Mongo vs Postgres repository results.
 * Never fail closed — diffs are logged; the primary backend result is returned.
 */

export type DualReadDiff = {
  aggregate: string;
  method: string;
  equal: boolean;
  primary: unknown;
  secondary: unknown;
  error?: string;
};

export type DualReadLogger = (diff: DualReadDiff) => void;

function stableSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (v instanceof Date) return v.toISOString();
      if (v && typeof v === "object" && "toISOString" in v && typeof (v as Date).toISOString === "function") {
        try {
          return (v as Date).toISOString();
        } catch {
          return v;
        }
      }
      return v;
    });
  } catch {
    return String(value);
  }
}

export function resultsEqual(a: unknown, b: unknown): boolean {
  return stableSerialize(a) === stableSerialize(b);
}

/**
 * Runs primary, optionally compares against secondary when dual-read is enabled.
 * Returns the primary result always.
 */
export async function withDualRead<T>(options: {
  enabled: boolean;
  aggregate: string;
  method: string;
  primary: () => Promise<T>;
  secondary: () => Promise<T>;
  log?: DualReadLogger;
}): Promise<T> {
  const primaryResult = await options.primary();
  if (!options.enabled) {
    return primaryResult;
  }

  try {
    const secondaryResult = await options.secondary();
    const equal = resultsEqual(primaryResult, secondaryResult);
    options.log?.({
      aggregate: options.aggregate,
      method: options.method,
      equal,
      primary: primaryResult,
      secondary: secondaryResult
    });
  } catch (error) {
    options.log?.({
      aggregate: options.aggregate,
      method: options.method,
      equal: false,
      primary: primaryResult,
      secondary: null,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return primaryResult;
}

/** True when BEHALFID_REPO_DUAL_READ=true (staging only). */
export function isDualReadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.BEHALFID_REPO_DUAL_READ?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
