/**
 * Redact credential-like values from a deep object before hashing or logging.
 * Never returns secret material.
 */
export declare function redactDeep(value: unknown): unknown;
/** Stable SHA-256 of redacted arguments for audit trails. */
export declare function hashArguments(args: Record<string, unknown> | undefined): string;
/** Generate a unique id for requests / approvals / audit rows. */
export declare function createId(prefix: string): string;
