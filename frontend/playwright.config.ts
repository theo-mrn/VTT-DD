/**
 * Tests de bout en bout (Playwright), contre la stack de développement déjà lancée (`pnpm dev`
 * pour les services, `next dev` pour le front) : rien n'est démarré ici. Chaque test crée ses
 * propres comptes, campagnes et personnages (noms uniques) et supprime campagnes et personnages
 * à la fin. Lancement : `pnpm --filter @vtt/web e2e` (`E2E_BASE_URL` pour une autre adresse).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Large : une inscription peut attendre la fin de la fenêtre de limite de débit
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/rapport' }]],
  outputDir: 'e2e/resultats',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // La carte est en WebGL : rendu logiciel en mode sans interface
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
});
