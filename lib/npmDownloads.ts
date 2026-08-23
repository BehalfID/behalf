/**
 * Last-30-day download count for the published SDK.
 *
 * The homepage's product panels are all stamped "Illustrative", which leaves a
 * product that logs decisions with zero verifiable quantity signal. This is the
 * one real number available today: npm's public downloads API, attributable and
 * checkable by anyone against the package page.
 *
 * Fetched server-side rather than embedded as a shields.io <img> — the site's
 * CSP is `img-src 'self' data:`, so a third-party badge image would be blocked.
 * Any failure returns null and every consumer renders nothing; an absent number
 * is correct, a stale or invented one is not.
 */

export const SDK_PACKAGE = "@behalfid/sdk";
export const SDK_NPM_URL = "https://www.npmjs.com/package/@behalfid/sdk";

const DOWNLOADS_ENDPOINT = `https://api.npmjs.org/downloads/point/last-month/${SDK_PACKAGE}`;

/**
 * This fetch sits in the homepage's server render, so a slow npm is a slow
 * homepage for every visitor and crawler that lands on a cold cache. The figure
 * is decorative — a bounded wait that yields null beats an unbounded one that
 * holds the whole page. Budget is generous enough that a healthy npm always
 * answers inside it.
 */
const DOWNLOADS_TIMEOUT_MS = 2_500;

export type SdkDownloads = {
  /** Downloads in the trailing 30 days. */
  count: number;
  /** End of the window npm reported, ISO yyyy-mm-dd. */
  end: string;
};

export async function getSdkDownloads(): Promise<SdkDownloads | null> {
  try {
    const response = await fetch(DOWNLOADS_ENDPOINT, {
      // One refresh a day is plenty for a trailing-30-day figure, and keeps the
      // marketing pages statically cacheable.
      next: { revalidate: 86_400 },
      // An abort rejects the fetch, which the catch below turns into null —
      // the same outcome as any other failure.
      signal: AbortSignal.timeout(DOWNLOADS_TIMEOUT_MS)
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) return null;

    const { downloads, end } = payload as { downloads?: unknown; end?: unknown };
    if (typeof downloads !== "number" || !Number.isFinite(downloads) || downloads < 0) return null;

    return { count: Math.trunc(downloads), end: typeof end === "string" ? end : "" };
  } catch {
    return null;
  }
}

/** "1,284" — plain grouped digits, no rounding games. */
export function formatDownloads(count: number): string {
  return count.toLocaleString("en-US");
}
