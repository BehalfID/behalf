import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".claude/**",
    "out/**",
    "next-env.d.ts",
    "scripts/**",
    "packages/*/dist/**",
    "examples/**/dist/**",
    "examples/**/node_modules/**"
  ])
]);

export default eslintConfig;
