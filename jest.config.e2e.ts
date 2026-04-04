import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const e2eConfig: Config = {
  displayName: "e2e",
  testEnvironment: "node",
  testMatch: ["**/__tests__/e2e/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/setup\\.ts$"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  setupFiles: ["<rootDir>/src/__tests__/e2e/jest.setup.e2e.ts"],
};

export default createJestConfig(e2eConfig);
