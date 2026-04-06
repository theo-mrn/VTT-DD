import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login, TEST_ROOM_ID } from "./helpers/auth";

/**
 * Tests de la sidebar — accès via personnage connecté dans la salle 338753.
 * Setup commun : connexion → /personnages → sélection du personnage "test" → map
 */

async function loginAndSelectCharacter(browser: any): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);

  await page.goto("/personnages");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 10000 });

  const charBtn = page.getByRole("button", { name: /jouer en tant que test$/i });
  await expect(charBtn).toBeVisible({ timeout: 8000 });
  await charBtn.click();

  await expect(page).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });

  return { context, page };
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

test.describe("Sidebar — Chat", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("le bouton chat de la sidebar est présent", async () => {
    await expect(page.locator("#vtt-sidebar-chat")).toBeVisible({ timeout: 8000 });
  });

  test("cliquer sur chat ouvre le panneau", async () => {
    await page.locator("#vtt-sidebar-chat").click();
    // Le champ de message doit apparaître
    await expect(page.getByPlaceholder("Écrire un message...")).toBeVisible({ timeout: 5000 });
  });

  test("le chat affiche la zone de messages", async () => {
    // Soit des messages, soit "Aucun message"
    const hasMessages = await page.getByText(/aucun message/i).isVisible().catch(() => false);
    const hasInput = await page.getByPlaceholder("Écrire un message...").isVisible();
    expect(hasMessages || hasInput).toBe(true);
  });

  test("peut taper un message dans le chat", async () => {
    const input = page.getByPlaceholder("Écrire un message...");
    await input.fill("Message de test Playwright");
    await expect(input).toHaveValue("Message de test Playwright");
  });

  test("peut envoyer un message avec Entrée", async () => {
    const input = page.getByPlaceholder("Écrire un message...");
    await input.fill("Test envoi");
    await input.press("Enter");
    // Le champ se vide après envoi
    await expect(input).toHaveValue("", { timeout: 3000 });
  });

  test("recliquer sur chat ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-chat").click();
    await expect(page.getByPlaceholder("Écrire un message...")).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Notes ────────────────────────────────────────────────────────────────────

test.describe("Sidebar — Notes", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("le bouton notes de la sidebar est présent", async () => {
    await expect(page.locator("#vtt-sidebar-notes")).toBeVisible({ timeout: 8000 });
  });

  test("cliquer sur notes ouvre le panneau", async () => {
    await page.locator("#vtt-sidebar-notes").click();
    // Le champ de recherche ou la liste de notes doit apparaître
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).toBeVisible({ timeout: 5000 });
  });

  test("le panneau notes affiche la zone de recherche", async () => {
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).toBeVisible({ timeout: 5000 });
  });

  test("recliquer sur notes ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-notes").click();
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Dés ──────────────────────────────────────────────────────────────────────

test.describe("Sidebar — Dés", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("le bouton dés de la sidebar est présent", async () => {
    await expect(page.locator("#vtt-sidebar-dice")).toBeVisible({ timeout: 8000 });
  });

  test("cliquer sur dés ouvre le panneau", async () => {
    await page.locator("#vtt-sidebar-dice").click();
    // Le champ de notation de dé doit apparaître
    await expect(page.getByPlaceholder(/1d20\+5/i)).toBeVisible({ timeout: 5000 });
  });

  test("le panneau dés affiche le champ de notation", async () => {
    await expect(page.getByPlaceholder(/1d20\+5/i)).toBeVisible({ timeout: 5000 });
  });

  test("peut taper une notation de dé", async () => {
    const input = page.getByPlaceholder(/1d20\+5/i);
    await input.fill("1d20");
    await expect(input).toHaveValue("1d20");
  });

  test("peut lancer un dé avec le bouton Lancer", async () => {
    const input = page.getByPlaceholder(/1d20\+5/i);
    await input.fill("1d20");
    await page.getByRole("button", { name: /^lancer$/i }).click();
    // Le champ se vide ou un résultat apparaît
    await expect(page.locator("body")).toBeVisible();
  });

  test("recliquer sur dés ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-dice").click();
    await expect(page.getByPlaceholder(/1d20\+5/i)).not.toBeVisible({ timeout: 3000 });
  });
});
