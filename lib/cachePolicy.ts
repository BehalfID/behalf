/**
 * Shared cache policy values. Keep tenant, session, authorization, and
 * operational health data on PRIVATE_NO_STORE.
 */
export const PRIVATE_NO_STORE = "no-store, private";

/** Public operational status is tenant-neutral but must remain near-real-time. */
export const PUBLIC_STATUS_CACHE = "public, max-age=0, s-maxage=15";

/** Stable public metadata and machine-readable documentation. */
export const PUBLIC_METADATA_CACHE =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

/** Executable installer updates should propagate quickly. */
export const PUBLIC_INSTALLER_CACHE = "public, max-age=0, s-maxage=300";

/** Stable-named brand assets may be replaced, so they are intentionally not immutable. */
export const PUBLIC_BRAND_ASSET_CACHE =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export const PUBLIC_BRAND_ASSET_PATHS = [
  "/57BCACD9-4C98-4081-9C3F-F599EF02B5DD.PNG",
  "/9EE9F110-FBC1-469E-845C-D8A99E800B63.PNG",
  "/B6EF1396-4BA1-4FB8-8655-431C160D0C00.PNG",
  "/F612C444-60A4-4B0A-997D-48DDDC773BA5.PNG",
  "/behalf_favicon.png",
  "/behalf_full.png",
  "/behalf_symbols.png",
  "/icon-dark.png",
  "/icon-light.png",
  "/icon-transparent.png",
  "/logo-dark.png",
  "/logo-light.png"
] as const;
