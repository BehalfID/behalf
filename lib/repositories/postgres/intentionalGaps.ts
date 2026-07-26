/**
 * Mongo function exports that intentionally remain unbound on the Postgres runtime
 * aggregate. These are `lazyModelMethod` mongoose Model passthroughs that return
 * Query-chaining APIs incompatible with Drizzle adapters.
 *
 * Named domain helpers (`findUsers`, `createUserDocument`, etc.) cover the
 * delegated application surface. Selecting postgres still throws clearly for
 * these keys — never silently falls back to Mongo.
 */

export const INTENTIONAL_POSTGRES_GAPS = [
  "accounts.create",
  "accounts.deleteOne",
  "accounts.find",
  "accounts.findOne",
  "accounts.updateOne",
  "agents.countDocuments",
  "agents.create",
  "agents.find",
  "agents.findOne",
  "agents.updateMany",
  "agents.updateOne",
  "apiTokens.create",
  "apiTokens.deleteMany",
  "apiTokens.findOne",
  "apiTokens.updateOne",
  "permissions.countDocuments",
  "permissions.create",
  "permissions.deleteMany",
  "permissions.find",
  "permissions.updateMany",
  "permissions.updateOne",
  "sessions.create",
  "sessions.deleteMany",
  "sessions.deleteOne",
  "sessions.findOne",
  "sessions.updateMany",
  "sessions.updateOne",
  "users.create",
  "users.deleteOne",
  "users.find",
  "users.findOne",
  "users.updateMany",
  "users.updateOne",
  "verificationLogs.countDocuments",
  "verificationLogs.create",
  "verificationLogs.deleteMany",
  "verificationLogs.find",
  "verificationLogs.updateMany"
] as const;

export type IntentionalPostgresGap = (typeof INTENTIONAL_POSTGRES_GAPS)[number];

const intentionalSet = new Set<string>(INTENTIONAL_POSTGRES_GAPS);

export function isIntentionalPostgresGap(aggregate: string, method: string): boolean {
  return intentionalSet.has(`${aggregate}.${method}`);
}
