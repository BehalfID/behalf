/**
 * Applies optional query options by reassignment so both real Mongoose queries
 * (mutable, builders return this) and nested unit-test mocks
 * (`findOne().select().lean()`) work.
 */
export type ChainableQuery = {
  select?: (projection: string | Record<string, unknown>) => unknown;
  sort?: (spec: unknown) => unknown;
  skip?: (n: number) => unknown;
  limit?: (n: number) => unknown;
  maxTimeMS?: (n: number) => unknown;
  lean: (...args: never[]) => unknown;
};

export function applyQueryOptions(
  query: ChainableQuery,
  options: {
    select?: string | Record<string, unknown>;
    sort?: unknown;
    skip?: number;
    limit?: number;
    maxTimeMS?: number;
  } = {}
): ChainableQuery {
  let q = query;
  if (options.select != null && typeof q.select === "function") {
    q = q.select(options.select) as ChainableQuery;
  }
  if (options.sort != null && typeof q.sort === "function") {
    q = q.sort(options.sort) as ChainableQuery;
  }
  if (options.skip != null && typeof q.skip === "function") {
    q = q.skip(options.skip) as ChainableQuery;
  }
  if (options.limit != null && typeof q.limit === "function") {
    q = q.limit(options.limit) as ChainableQuery;
  }
  if (options.maxTimeMS != null && typeof q.maxTimeMS === "function") {
    q = q.maxTimeMS(options.maxTimeMS) as ChainableQuery;
  }
  return q;
}

/** Resolve lean() even when unit mocks only expose lean under select(). */
export function asLean<T = unknown>(query: ChainableQuery): Promise<T> {
  if (typeof query.lean === "function") {
    return Promise.resolve(query.lean() as T);
  }
  // Legacy mocks that resolve findOne/find directly to a document (Promise-like).
  if (query && typeof (query as { then?: unknown }).then === "function") {
    return Promise.resolve(query as T);
  }
  if (typeof query.select === "function") {
    const nested = query.select("_id") as ChainableQuery;
    if (nested && typeof nested.lean === "function") {
      return Promise.resolve(nested.lean() as T);
    }
    if (nested && typeof (nested as { then?: unknown }).then === "function") {
      return Promise.resolve(nested as T);
    }
  }
  throw new TypeError("query.lean is not a function");
}

/**
 * Query-like object that supports both `.lean()` chaining and `await query`
 * (Mongoose Query thenable semantics) for cutover compatibility.
 */
export type ThenableQuery = ChainableQuery & PromiseLike<unknown>;

export function thenableQuery(query: ChainableQuery): ThenableQuery {
  const target = query as ThenableQuery;
  if (typeof target.then === "function") return target;
  return Object.assign(query, {
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return asLean(query).then(onFulfilled, onRejected);
    }
  }) as ThenableQuery;
}

/**
 * Applies an optional projection then lean().
 * Also accepts legacy unit mocks where `.select()` resolves directly to a document.
 */
export function selectLean<T = unknown>(query: ChainableQuery, select?: string): Promise<T> {
  const projected =
    select != null && typeof query.select === "function" ? query.select(select) : query;

  if (
    projected &&
    typeof (projected as { then?: unknown }).then === "function" &&
    typeof (projected as ChainableQuery).lean !== "function"
  ) {
    return Promise.resolve(projected as T);
  }

  return asLean<T>(projected as ChainableQuery);
}

/**
 * Defers Mongoose model method binding until call time so unit tests can mock
 * `@/models/*` with partial shapes without breaking module initialization.
 */
export function lazyModelAdapter<T extends object>(getModel: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (typeof prop !== "string") {
        return undefined;
      }
      const model = getModel();
      const value = (model as Record<string, unknown>)[prop];
      if (typeof value === "function") {
        return value.bind(model);
      }
      return value;
    }
  });
}

/**
 * Lazy-bind a single model method. Prefer this for `export const findOne = …`
 * adapters that need to type-check under Mongoose overload signatures.
 */
export function lazyModelMethod<TModel extends object, TKey extends keyof TModel>(
  getModel: () => TModel,
  method: TKey
): TModel[TKey] {
  return ((...args: never[]) => {
    const model = getModel();
    const fn = model[method];
    if (typeof fn !== "function") {
      throw new Error(`Expected model method ${String(method)} to be a function`);
    }
    return (fn as (...inner: never[]) => unknown).apply(model, args);
  }) as TModel[TKey];
}
