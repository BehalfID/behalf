/**
 * Repository-layer errors. Mongo duplicate-key (11000) and other driver details
 * stay inside Mongo implementations; callers catch these domain errors.
 */

export class DuplicateKeyError extends Error {
  readonly code = "DUPLICATE_KEY" as const;
  readonly cause?: unknown;

  constructor(message = "Duplicate key", cause?: unknown) {
    super(message);
    this.name = "DuplicateKeyError";
    this.cause = cause;
  }
}

export type RepositoryConstraintErrorCode =
  | "FOREIGN_KEY"
  | "CHECK_CONSTRAINT"
  | "NOT_NULL";

export class RepositoryConstraintError extends Error {
  readonly code: RepositoryConstraintErrorCode;
  readonly cause?: unknown;

  constructor(code: RepositoryConstraintErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RepositoryConstraintError";
    this.code = code;
    this.cause = cause;
  }
}

export class RepositoryRetryableError extends Error {
  readonly code = "RETRYABLE_TRANSACTION" as const;
  readonly cause?: unknown;

  constructor(message = "The repository operation could not be completed", cause?: unknown) {
    super(message);
    this.name = "RepositoryRetryableError";
    this.cause = cause;
  }
}

/** True when an unknown error is a Mongo duplicate-key (E11000 / code 11000). */
export function isMongoDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: number | string; message?: string };
  if (maybe.code === 11000 || maybe.code === "11000") return true;
  return typeof maybe.message === "string" && /E11000/i.test(maybe.message);
}

/** Translate Mongo 11000 into DuplicateKeyError; rethrow other errors. */
export function translateDuplicateKey(error: unknown, message?: string): never {
  if (isMongoDuplicateKeyError(error)) {
    throw new DuplicateKeyError(message ?? "Duplicate key", error);
  }
  throw error;
}

export function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

export function isRetryablePostgresError(error: unknown): boolean {
  const code = postgresErrorCode(error);
  return code === "40001" || code === "40P01";
}

/** Translate PostgreSQL driver details into stable repository-layer errors. */
export function translatePostgresError(error: unknown): never {
  switch (postgresErrorCode(error)) {
    case "23505":
      throw new DuplicateKeyError("A repository record with this identity already exists", error);
    case "23503":
      throw new RepositoryConstraintError(
        "FOREIGN_KEY",
        "A referenced repository record does not exist",
        error
      );
    case "23514":
      throw new RepositoryConstraintError(
        "CHECK_CONSTRAINT",
        "A repository value violates a data constraint",
        error
      );
    case "23502":
      throw new RepositoryConstraintError(
        "NOT_NULL",
        "A required repository value is missing",
        error
      );
    case "40001":
    case "40P01":
      throw new RepositoryRetryableError(undefined, error);
    default:
      throw error;
  }
}
