import { Page } from "@playwright/test";


export const TEST_EMAIL = process.env.TEST_EMAIL || "";
export const TEST_PASSWORD = process.env.TEST_PASSWORD ||"";
export const TEST_ROOM_ID = process.env.TEST_ROOM_ID || "";

/**
 * Connexion manuelle — à utiliser UNIQUEMENT dans les tests qui testent
 * explicitement le flow d'authentification (auth.spec.ts, authenticated.spec.ts).
 *
 * Pour tous les autres tests, la session est déjà chargée via storageState
 * (global-setup.ts) — pas besoin d'appeler login().
 */
export async function login(page: Page) {
  // Stagger concurrent logins to avoid Firebase Auth rate-limiting (5 workers)
  await page.waitForTimeout(Math.random() * 2000);
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");
  await page.getByPlaceholder("votre@email.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /se connecter|connexion/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth"), {
    timeout: 20000,
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
