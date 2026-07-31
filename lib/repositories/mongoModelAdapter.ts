/**
 * Applies optional query options by reassignment so both real Mongoose queries
 * (mutable, builders return this) and nested unit-test mocks
 * (`findOne().select().lean()`) work.
 *
 * Parameter/return shapes use `any` intentionally: Mongoose Query generics are
 * incompatible with a narrow structural type, and callers rely on inferred
 * document types from `.lean()` / repository wrappers.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ChainableQuery = {
  select?: (...args: any[]) => any;
  sort?: (...args: any[]) => any;
  skip?: (...args: any[]) => any;
  limit?: (...args: any[]) => any;
  maxTimeMS?: (...args: any[]) => any;
  lean?: (...args: any[]) => any;
};

export function applyQueryOptions<T extends ChainableQuery>(
  query: T,
  options: {
    select?: string | Record<string, unknown>;
    sort?: unknown;
    skip?: number;
    limit?: number;
    maxTimeMS?: number;
  } = {}
): T {
  let q: ChainableQuery = query;
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
  return q as T;
}

/** Resolve lean() even when unit mocks only expose lean under select(). */
export async function asLean<T = any>(query: ChainableQuery): Promise<T> {
  if (typeof query.lean === "function") {
    return (await query.lean()) as T;
  }
  // Legacy mocks that resolve findOne/find directly to a document (Promise-like).
  if (query && typeof (query as { then?: unknown }).then === "function") {
    return query as T;
  }
  if (typeof query.select === "function") {
    const nested = query.select("_id") as ChainableQuery;
    if (nested && typeof nested.lean === "function") {
      return (await nested.lean()) as T;
    }
    if (nested && typeof (nested as { then?: unknown }).then === "function") {
      return nested as T;
    }
  }
  throw new TypeError("query.lean is not a function");
}

/**
 * Query-like object that supports both `.lean()` / `.lean<T>()` chaining and
 * `await query` (Mongoose Query thenable semantics) for cutover compatibility.
 */
export type ThenableQuery<T = any> = {
  select?: (...args: any[]) => any;
  sort?: (...args: any[]) => any;
  skip?: (...args: any[]) => any;
  limit?: (...args: any[]) => any;
  maxTimeMS?: (...args: any[]) => any;
  lean: {
    (): Promise<T>;
    <R>(): Promise<R>;
  };
  then: Promise<T>["then"];
  catch: Promise<T>["catch"];
  finally: Promise<T>["finally"];
  [Symbol.toStringTag]: string;
};

export function thenableQuery<T = any>(query: ChainableQuery): ThenableQuery<T> {
  const resolve = () => asLean<T>(query);
  const promise = resolve();
  const lean = (<R = T>() => asLean<R>(query)) as ThenableQuery<T>["lean"];
  return Object.assign(promise, {
    select: query.select?.bind(query),
    sort: query.sort?.bind(query),
    skip: query.skip?.bind(query),
    limit: query.limit?.bind(query),
    maxTimeMS: query.maxTimeMS?.bind(query),
    lean
  }) as ThenableQuery<T>;
}

/**
 * Applies an optional projection then lean().
 * Also accepts legacy unit mocks where `.select()` resolves directly to a document.
 */
export function selectLean<T = any>(query: ChainableQuery, select?: string): Promise<T> {
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
