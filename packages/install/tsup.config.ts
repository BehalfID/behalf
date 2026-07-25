import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    outDir: "dist",
    treeshake: true,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node18",
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
