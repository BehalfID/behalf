const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the example as its own Next root. Otherwise Next 16 picks the monorepo
  // package-lock.json as the workspace root and loads the app next.config.ts.
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
