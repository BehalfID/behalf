import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {
  PUBLIC_BRAND_ASSET_CACHE,
  PUBLIC_BRAND_ASSET_PATHS,
  PUBLIC_INSTALLER_CACHE,
  PUBLIC_METADATA_CACHE,
  PRIVATE_NO_STORE
} from "./lib/cachePolicy";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Static headers that never vary by environment.
// Content-Security-Policy is set in middleware.ts so it can branch on NODE_ENV
// at true request time (next.config headers() is evaluated during build/config
// parsing where NODE_ENV is not reliably "development").
const staticHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  }
];

function cacheControl(value: string) {
  return [{ key: "Cache-Control", value }];
}

const publicCacheHeaders = [
  {
    source: "/robots.txt",
    headers: cacheControl(PUBLIC_METADATA_CACHE)
  },
  {
    source: "/sitemap.xml",
    headers: cacheControl(PUBLIC_METADATA_CACHE)
  },
  {
    source: "/llms.txt",
    headers: cacheControl(PUBLIC_METADATA_CACHE)
  },
  {
    source: "/.well-known/atproto-did",
    headers: cacheControl(PUBLIC_METADATA_CACHE)
  },
  {
    source: "/install.sh",
    headers: cacheControl(PUBLIC_INSTALLER_CACHE)
  },
  ...PUBLIC_BRAND_ASSET_PATHS.map((source) => ({
    source,
    headers: cacheControl(PUBLIC_BRAND_ASSET_CACHE)
  }))
];

const privatePageCacheHeaders = [
  "/dashboard",
  "/dashboard/:path*",
  "/console",
  "/console/:path*",
  "/workspace/:workspaceSlug/dashboard",
  "/workspace/:workspaceSlug/dashboard/:path*",
  "/:workspaceSlug/dashboard",
  "/:workspaceSlug/dashboard/:path*"
].map((source) => ({
  source,
  headers: cacheControl(PRIVATE_NO_STORE)
}));

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticHeaders
      },
      ...privatePageCacheHeaders,
      ...publicCacheHeaders
    ];
  }
};

export default withNextIntl(nextConfig);
