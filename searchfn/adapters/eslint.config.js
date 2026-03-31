import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { fileURLToPath } from "url";

const recommendedRules = tsPlugin.configs.recommended.rules;
const typeCheckedRules = tsPlugin.configs["recommended-requiring-type-checking"].rules;

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...recommendedRules,
      ...typeCheckedRules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off"
    }
  }
];
