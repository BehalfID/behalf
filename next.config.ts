import type { NextConfig } from "next";

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
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  }
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticHeaders
      }
    ];
  }
};

export default nextConfig;
