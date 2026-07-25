import { readSession } from "./config.js";

/**
 * Require an interactive login session (cookie stored by `behalf login`).
 * Throws a plain Error so existing runAction / printCaughtError paths stay unchanged.
 */
export function requireSession(): string {
  const session = readSession();
  if (!session) {
    throw new Error("This command requires you to be logged in. Run `behalf login`.");
  }
  return session;
}
