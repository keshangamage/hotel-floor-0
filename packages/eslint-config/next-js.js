import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { config as baseConfig } from "./base.js";

/**
 * ESLint config for Next.js apps.
 */
export const nextJsConfig = defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
]);

export default nextJsConfig;
