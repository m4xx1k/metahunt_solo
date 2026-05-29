import type { Config } from "jest";

// Integration tests — run against a real pgvector Postgres (Testcontainers).
// Kept separate from the unit config so `pnpm test` stays fast and Docker-free;
// `pnpm test:int` opts in. Specs live under test/int/ so the unit testMatch
// (src/**/*.spec.ts) never picks them up.
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  globalSetup: "<rootDir>/test/int/global-setup.ts",
  globalTeardown: "<rootDir>/test/int/global-teardown.ts",
  testMatch: ["<rootDir>/test/int/**/*.int.spec.ts"],
  moduleNameMapper: {
    "^@metahunt/database$": "<rootDir>/../../libs/database/src/index.ts",
  },
  // Exit with the real status code even if the pg pool keeps a handle open;
  // global-teardown still runs first to stop the container.
  forceExit: true,
  testTimeout: 60_000,
};

export default config;
