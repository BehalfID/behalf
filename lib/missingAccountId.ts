/**
 * Filter clause for records left unscoped by the pre-workspace schema.
 *
 * This used to be written as:
 *
 *   { $or: [{ accountId: { $exists: false } }, { accountId: null }] }
 *
 * which throws `Unsupported agent filter operator: $exists` on the Postgres
 * repository adapters — they implement `$in/$nin/$ne/$gt/$gte/$lt/$lte` and map
 * a literal `null` to `IS NULL`, but have no `$exists`. That crashed the
 * dashboard agents read in production once traffic moved to Postgres.
 *
 * `{ accountId: null }` is the correct form on **both** backends, not a
 * workaround:
 *   - MongoDB: a `null` equality match also matches documents where the field
 *     is absent, so the `$or`/`$exists` pair was always redundant.
 *   - Postgres: a missing value *is* NULL, and adapters translate `null` to
 *     `IS NULL`.
 *
 * Semantics are therefore unchanged for Mongo and fixed for Postgres.
 */
export const MISSING_ACCOUNT_ID_CLAUSE = { accountId: null } as const;
