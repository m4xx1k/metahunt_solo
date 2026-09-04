import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/lib/**/*.spec.ts",
    "<rootDir>/features/**/*.spec.ts",
    "<rootDir>/entities/**/*.spec.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
