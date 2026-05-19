import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./test/setup.ts"],
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
