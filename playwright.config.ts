import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config(); // charge .env

export default defineConfig({
  testDir: "./src/__tests__/playwright",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 5,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // fiche.spec.ts exclut ce project — géré par "fiche" ci-dessous
      testIgnore: ["**/fiche.spec.ts"],
    },
    {
      // Project dédié à la fiche — 1 seul worker pour éviter les logins Firebase concurrents
      name: "fiche",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/fiche.spec.ts"],
    },
  ],

  // Démarre automatiquement le serveur Next.js avant les tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
