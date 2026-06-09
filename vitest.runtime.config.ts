import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/runtime/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Runtime tests make real API calls — generous timeout.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Don't run test files in parallel so API rate limits are less likely to trigger.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
