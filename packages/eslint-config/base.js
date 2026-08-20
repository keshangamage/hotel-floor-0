import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import turbo from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint config for every package in the repo.
 */
export const config = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  turbo.configs["flat/recommended"],
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
]);

export default config;
