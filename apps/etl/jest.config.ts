import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // BAML's native binding leaves an open handle that stops Node exiting on its
  // own. forceExit lets Jest exit after the run WITH the real status code —
  // unlike the old globalTeardown process.exit(0), which hard-coded success and
  // masked every failing suite (CI stayed green even when nothing compiled).
  forceExit: true,
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^@metahunt/database$": "<rootDir>/../../libs/database/src/index.ts",
  },
};

export default config;
