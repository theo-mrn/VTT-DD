import { chromium } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./auth";
import path from "path";

export const SESSION_FILE = path.resolve(
  process.cwd(),
  "src/__tests__/playwright/helpers/.session.json"
);

/**
 * Se connecte une seule fois et sauvegarde le storageState.
 * Tous les tests peuvent ensuite réutiliser la session sans appel Firebase Auth.
 */
export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:3000/auth");
  await page.waitForLoadState("domcontentloaded");
  await page.getByPlaceholder("votre@email.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /se connecter|connexion/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth"), {
    timeout: 15000,
  });

  await page.context().storageState({ path: SESSION_FILE });
  await browser.close();
}
