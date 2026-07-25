/**
 * Per-call repository backend dispatch for public facade modules.
 *
 * App code imports `@/lib/repositories/<aggregate>`; each method routes to
 * Mongo (default) or the cached Postgres runtime bundle based on
 * resolveRepositoryBackendFor(aggregate).
 */

import { getPostgresDb } from "@/lib/db/postgres";
import {
  resolveRepositoryBackendFor,
  repositoryBackendOverrideEnvKey,
  type RepositoryAggregate
} from "@/lib/repositories/backend";
import {
  createPostgresRuntimeRepositories,
  isPostgresAdapterReady
} from "@/lib/repositories/postgres/runtime";

type AnyFn = (...args: any[]) => any;

type PostgresBundle = ReturnType<typeof createPostgresRuntimeRepositories>;

let cachedBundle: PostgresBundle | null = null;
let cachedBundleKey: string | null = null;

function postgresBundleCacheKey(env: NodeJS.ProcessEnv): string {
  return [
    env.DATABASE_URL ?? "",
    env.POSTGRES_URL ?? "",
    env.BEHALFID_ALLOW_POSTGRES_RUNTIME ?? ""
  ].join("::");
}

function assertPostgresUrlConfigured(env: NodeJS.ProcessEnv): void {
  if (env.DATABASE_URL || env.POSTGRES_URL) return;
  throw new Error(
    "Postgres repository backend selected but DATABASE_URL / POSTGRES_URL is not set. " +
      "Configure a Postgres URL before enabling BEHALFID_REPOSITORY_BACKEND=postgres " +
      "or BEHALFID_REPO_BACKEND_* overrides."
  );
}

function getPostgresBundle(env: NodeJS.ProcessEnv = process.env): PostgresBundle {
  const key = postgresBundleCacheKey(env);
  if (!cachedBundle || cachedBundleKey !== key) {
    assertPostgresUrlConfigured(env);
    cachedBundle = createPostgresRuntimeRepositories(getPostgresDb());
    cachedBundleKey = key;
  }
  return cachedBundle;
}

/** Test helper: drop cached Postgres bindings between examples. */
export function resetDelegateCacheForTests() {
  cachedBundle = null;
  cachedBundleKey = null;
}

/**
 * Returns a wrapper that calls `mongoFn` when the aggregate resolves to mongo,
 * otherwise the matching Postgres runtime method.
 */
export function delegate<A extends RepositoryAggregate, M extends string, F extends AnyFn>(
  aggregate: A,
  method: M,
  mongoFn: F
): F {
  const wrapped = ((...args: any[]) => {
    const env = process.env;
    const backend = resolveRepositoryBackendFor(aggregate, env);
    if (backend === "mongo") {
      return mongoFn(...args);
    }

    if (!isPostgresAdapterReady(aggregate)) {
      throw new Error(
        `Postgres adapter not ready for aggregate "${aggregate}". ` +
          `Unset ${repositoryBackendOverrideEnvKey(aggregate)} or keep it on mongo ` +
          "until a lib/repositories/postgres adapter exists."
      );
    }

    const bundle = getPostgresBundle(env);
    const aggregateImpl = bundle[aggregate as keyof PostgresBundle] as
      | Record<string, AnyFn>
      | undefined;
    const impl = aggregateImpl?.[method];
    if (typeof impl !== "function") {
      throw new Error(
        `${method} is not implemented on postgres ${aggregate} adapter`
      );
    }
    return impl(...args);
  }) as F;
  return wrapped;
}
