import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/integration/**/*.integration.test.ts"],
    setupFiles: ["./test/setup.ts", "./test/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
