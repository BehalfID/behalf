/**
 * Analytics consent gate.
 *
 * The HeyCatch SDK writes a persistent first-party cookie
 * (`ph_<token>_posthog`, ~12 month expiry) plus a `distinct_id` / `$device_id`
 * in localStorage and sessionStorage as soon as `init()` runs. That storage is
 * not strictly necessary for any feature the visitor requested, so under
 * ePrivacy Art. 5(3) it needs prior consent — and this site already presents an
 * "Essential only" / "Accept all" choice and publishes a GDPR posture.
 *
 * The install guide asks for an unconditional module-scope `init()`. We keep the
 * module-scope static-import placement it requires, but hold the call until
 * consent exists: `init()` is idempotent and a no-op before it runs, so granting
 * consent later starts capture immediately without a reload. The cost is that
 * pre-consent pageviews are not captured, which is the intended trade.
 */

/** Shared with CookieBanner — the existing site-wide consent decision. */
export const CONSENT_STORAGE_KEY = "behalf_cookie_consent";

/** Dispatched on the window when the visitor accepts in the same document. */
export const ANALYTICS_CONSENT_EVENT = "behalfid:analytics-consent";

export type ConsentValue = "accepted" | "declined";

export function readStoredConsent(): ConsentValue | null {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    // Storage can be unavailable in hardened browser contexts. Treat as "no
    // consent recorded" so analytics stays off.
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return readStoredConsent() === "accepted";
}

/**
 * Runs `callback` once analytics consent is granted — immediately if it was
 * already stored, otherwise on the in-page consent event or on a `storage`
 * event from another tab. Returns a cleanup function.
 */
export function whenAnalyticsConsentGranted(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  if (hasAnalyticsConsent()) {
    callback();
    return () => {};
  }

  let done = false;
  const fire = () => {
    if (done || !hasAnalyticsConsent()) return;
    done = true;
    cleanup();
    callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CONSENT_STORAGE_KEY) fire();
  };

  function cleanup() {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, fire);
    window.removeEventListener("storage", onStorage);
  }

  window.addEventListener(ANALYTICS_CONSENT_EVENT, fire);
  window.addEventListener("storage", onStorage);
  return cleanup;
}

/** Called by the consent banner so a grant takes effect without a reload. */
export function publishAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
}
