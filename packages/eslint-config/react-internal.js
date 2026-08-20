import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import { config as baseConfig } from "./base.js";

/**
 * ESLint config for React libraries consumed by apps in the repo.
 */
export const reactInternalConfig = defineConfig([
  ...baseConfig,
  reactHooks.configs.flat["recommended-latest"],
]);

export default reactInternalConfig;
