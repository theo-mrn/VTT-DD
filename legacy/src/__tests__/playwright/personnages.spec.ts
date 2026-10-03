import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { login, TEST_ROOM_ID } from "./helpers/auth";

const TEST_CHARACTER = "test";
const TAKEN_CHARACTER = "test1212";

// Regex exact pour éviter que "test" matche "test1212"
const charRegex = (name: string) => new RegExp(`jouer en tant que ${name}$`, "i");

// ─── Sélection de personnage ──────────────────────────────────────────────────
// 1 seul login pour tout le describe via beforeAll + context partagé

test.describe("Sélection de personnage", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
    await page.goto("/personnages");
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("affiche la page 'Qui joue ?'", async () => {
    await expect(page.getByText("Qui joue ?")).toBeVisible({ timeout: 8000 });
  });

  test("affiche la liste des personnages", async () => {
    await expect(page.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /entrer comme maître du jeu/i })).toBeVisible({ timeout: 8000 });
  });

  test("affiche le personnage 'test'", async () => {
    await expect(page.getByRole("button", { name: charRegex(TEST_CHARACTER) })).toBeVisible({ timeout: 8000 });
  });

  test("affiche la race et la classe du personnage", async () => {
    await expect(page.getByText(/nain/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/chevalier/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("le personnage 'test' est sélectionnable ou déjà assigné", async () => {
    const charBtn = page.getByRole("button", { name: charRegex(TEST_CHARACTER) });
    await expect(charBtn).toBeVisible({ timeout: 8000 });
    const isDisabled = await charBtn.isDisabled();
    if (isDisabled) {
      await expect(page.getByText(/votre héros/i)).toBeVisible({ timeout: 5000 });
    } else {
      // Ne pas cliquer ici — ça naviguerait et casserait les tests suivants
      expect(isDisabled).toBe(false); // juste vérifier qu'il est actif
    }
  });

  test("le bouton MJ est présent", async () => {
    await expect(
      page.getByRole("button", { name: /entrer comme maître du jeu/i })
    ).toBeVisible({ timeout: 8000 });
  });

  test("le personnage 'test1212' est visible (désactivé si pris par un autre)", async () => {
    const charBtn = page.getByRole("button", { name: charRegex(TAKEN_CHARACTER) });
    await expect(charBtn).toBeVisible({ timeout: 8000 });
    const isDisabled = await charBtn.isDisabled();
    if (isDisabled) {
      await expect(page.getByText(/occupé par/i).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("le bouton 'Actualiser la liste' fonctionne", async () => {
    const refreshBtn = page.getByRole("button", { name: /actualiser/i });
    await expect(refreshBtn).toBeVisible({ timeout: 8000 });
    await refreshBtn.click();
    await expect(page.getByText(/mise à jour/i)).toBeVisible({ timeout: 3000 });
  });
});

// ─── Flow complet bout en bout (1 login séparé) ───────────────────────────────

test.describe("Flow complet : connexion → personnage → map", () => {
  test("flow complet depuis /rejoindre jusqu'à la map", async ({ page }) => {
    await login(page);

    await page.goto("/rejoindre");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("textbox").first().fill(TEST_ROOM_ID);
    await page.getByRole("button", { name: /rejoindre/i }).first().click();

    await expect(
      page.getByRole("button", { name: /rejoindre la partie/i })
    ).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /rejoindre la partie/i }).click();

    await expect(page).toHaveURL(/\/personnages/, { timeout: 8000 });
    await expect(page.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 8000 });

    const charBtn = page.getByRole("button", { name: charRegex(TEST_CHARACTER) });
    await expect(charBtn).toBeVisible({ timeout: 8000 });
    await charBtn.click();

    await expect(page).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });
  });
});
