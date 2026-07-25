import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "test/integration/**",
      "test/e2e/**",
      "test/runtime/**",
      // Package-owned suites run via `npm run test:packages` / workspace scripts.
      "packages/*/test/**",
      "packages/*/vitest.config.ts"
    ],
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.test.ts", "test/**"]
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
