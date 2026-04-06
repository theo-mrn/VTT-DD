import { Page } from "@playwright/test";

export const TEST_EMAIL = "test123@gmail.com";
export const TEST_PASSWORD = "test123";
export const TEST_ROOM_ID = "338753";

/**
 * Connexion manuelle — à utiliser UNIQUEMENT dans les tests qui testent
 * explicitement le flow d'authentification (auth.spec.ts, authenticated.spec.ts).
 *
 * Pour tous les autres tests, la session est déjà chargée via storageState
 * (global-setup.ts) — pas besoin d'appeler login().
 */
export async function login(page: Page) {
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");
  await page.getByPlaceholder("votre@email.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /se connecter|connexion/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth"), {
    timeout: 10000,
  });
}

/**
 * Navigue directement vers la map de la salle de test.
 * La session est déjà active via storageState.
 */
export async function goToRoom(page: Page) {
  await page.goto(`/${TEST_ROOM_ID}/map`);
  await page.waitForLoadState("domcontentloaded");
}
