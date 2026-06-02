import type { Config } from "jest";

// Web tests cover the pure lib/ layer only (formatters, query/string
// helpers, adapters) — no jsdom, no component rendering. Mirrors the etl
// ts-jest setup. The `@/` path alias is mapped so specs import the same
// way app code does.
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/lib/**/*.spec.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
