import { test, expect } from "@playwright/test";

/**
 * Tests Playwright — Page d'accueil (/)
 * Couvre : landing page, hero, CTA
 */

test.describe("Page d'accueil", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche la page sans erreur", async ({ page }) => {
    await expect(page).toHaveURL("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("affiche du contenu visible", async ({ page }) => {
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("affiche le bouton principal d'appel à l'action", async ({ page }) => {
    const cta = page.getByRole("button", { name: /commencer|aventure|chargement/i });
    await expect(cta.first()).toBeVisible({ timeout: 8000 });
  });

  test("affiche le lien mentions légales", async ({ page }) => {
    await expect(page.getByRole("link", { name: /mentions légales/i })).toBeVisible();
  });
});

test.describe("Navigation publique", () => {
  test("la page /auth est accessible sans être connecté", async ({ page }) => {
    await page.goto("/auth");
    await expect(page).toHaveURL("/auth");
    await expect(page.getByText("Bienvenue !")).toBeVisible();
  });

  test("la page /rejoindre est accessible", async ({ page }) => {
    await page.goto("/rejoindre");
    await expect(page.locator("body")).toBeVisible();
  });

  test("la page /ressources est accessible", async ({ page }) => {
    await page.goto("/ressources");
    await expect(page.locator("body")).toBeVisible();
  });
});
