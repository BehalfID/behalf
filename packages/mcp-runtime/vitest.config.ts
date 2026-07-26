import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Child-process crash tests spawn real Node MCP servers.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
