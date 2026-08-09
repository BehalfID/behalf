/**
 * Server-side analytics — business events only.
 *
 * Per the HeyCatch install guide: the browser reports who the user is, the
 * server reports what the business knows. Plan changes, payments and
 * subscriptions are only trustworthy from our own backend, and a server event
 * cannot be eaten by an adblocker. There is no server-side autocapture: server
 * events are only what we send here.
 *
 * The server SDK sends immediately and resolves once ingest answered, so every
 * call is awaited — a serverless handler must not freeze mid-send. The SDK
 * never throws; a failure logs and resolves, so analytics cannot fail a
 * webhook. Calls are additionally wrapped here so an unexpected throw in the
 * transport can never take down billing.
 *
 * `userId` must be the SAME stable internal id the browser passes to
 * setIdentity — that is what joins the two sides.
 *
 * Note on consent: these are server-to-server events about a completed business
 * transaction. They carry no browser storage and no `request`, so they do not
 * read or write anything on the visitor's device.
 */
import { analytics } from "@heycatch/sdk";

/** Scalar shape the SDK accepts for event and person properties. */
type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

let initialized = false;

/** Module-scope init, once per server bundle. Idempotent. */
function ensureInitialized(): void {
  if (initialized) return;
  analytics.init({ projectKey: "hck_pk_CmZFEYVf4npR4hbJspc5lFFbG6VE59N4" });
  initialized = true;
}

export async function trackServerEvent(
  event: string,
  properties: AnalyticsProperties,
  options: { userId: string; set?: AnalyticsProperties }
): Promise<void> {
  if (!options.userId) return;
  try {
    ensureInitialized();
    await analytics.trackEvent(event, properties, options);
  } catch {
    // Analytics must never fail the caller (billing webhooks especially).
  }
}

export async function identifyServerUser(
  userId: string,
  properties: AnalyticsProperties
): Promise<void> {
  if (!userId) return;
  try {
    ensureInitialized();
    await analytics.setIdentity(userId, properties);
  } catch {
    // Same contract as trackServerEvent.
  }
}
