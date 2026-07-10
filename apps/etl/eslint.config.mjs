// @ts-check
import eslint from "@eslint/js";
import * as importPlugin from "eslint-plugin-import";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "eslint.config.mjs",
      "dist",
      "baml_client",
      ".scratch",
      "jest.config.ts",
      "jest.int.config.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      // Side-effect imports (reflect-metadata, dotenv/config) must keep their
      // hand-placed position; async interface methods/handlers need no await.
      "@typescript-eslint/require-await": "off",

      "import/order": [
        "error",
        {
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          pathGroups: [
            {
              pattern: "@nestjs/**",
              group: "external",
              position: "before",
            },
            {
              pattern: "@metahunt/**",
              group: "internal",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["@nestjs/**"],
          warnOnUnassignedImports: false,
        },
      ],
    },
  },
  {
    // Tests and one-off scripts lean on mocks and untyped fixtures; the
    // type-safety-noise rules are counterproductive there.
    files: ["**/*.spec.ts", "test/**/*.ts", "scripts/**/*.ts", "jest.setup.ts"],
    rules: {
      // jest.mock() must precede the mocked module's import — conflicts with import/order.
      "import/order": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
