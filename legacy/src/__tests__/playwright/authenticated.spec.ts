import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login, goToRoom, TEST_EMAIL, TEST_ROOM_ID } from "./helpers/auth";

// ─── Tests du flow auth (nécessitent un login frais chacun) ───────────────────

test.describe("Connexion", () => {
  test("connexion avec email/password valides", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("connexion échoue avec mauvais mot de passe", async ({ page }) => {
    await page.goto("/auth");
    await page.getByPlaceholder("votre@email.com").fill(TEST_EMAIL);
    await page.getByPlaceholder("Mot de passe").fill("mauvais-mdp");
    await page.getByRole("button", { name: /se connecter|connexion/i }).click();
    await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/auth/);
  });
});

// ─── Salle de test — 1 login pour tout le describe ───────────────────────────

test.describe("Salle de test (338753)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("accès direct à la map de la salle", async () => {
    await goToRoom(page);
    await expect(page).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
  });

  test("la map s'affiche sans redirection vers /home", async () => {
    await expect(page).not.toHaveURL(/\/home/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("le canvas de la carte est présent", async () => {
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Navigation — 1 login pour tout le describe ───────────────────────────────

test.describe("Navigation (connecté)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("navbar n'affiche pas 'S'identifier' quand connecté", async () => {
    await page.goto("/home");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("button", { name: /s'identifier/i })
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("/home affiche du contenu connecté", async () => {
    await expect(page.locator("body")).toBeVisible();
  });

  test("/mes-campagnes est accessible", async () => {
    await page.goto("/mes-campagnes");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/mes-campagnes/);
  });

  test("/personnages est accessible", async () => {
    await page.goto("/personnages");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── Rejoindre une salle — 1 login pour tout le describe ─────────────────────

test.describe("Rejoindre une salle (connecté)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("code valide affiche les détails de la salle", async () => {
    await page.goto("/rejoindre");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("textbox").first().fill(TEST_ROOM_ID);
    await page.getByRole("button", { name: /rejoindre/i }).first().click();
    await expect(page.getByRole("button", { name: /rejoindre la partie/i })).toBeVisible({
      timeout: 8000,
    });
  });

  test("code invalide affiche une erreur", async () => {
    await page.goto("/rejoindre");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("textbox").first().fill("000000");
    await page.getByRole("button", { name: /rejoindre/i }).first().click();
    await expect(page).toHaveURL(/\/rejoindre/, { timeout: 3000 });
  });
});
