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
