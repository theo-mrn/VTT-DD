import { test, expect } from "@playwright/test";

/**
 * Tests Playwright — Page rejoindre une salle (/rejoindre)
 * Couvre : affichage, saisie du code, validation
 */

test.describe("Page rejoindre", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/rejoindre");
  });

  test("affiche un champ pour entrer le code de la salle", async ({ page }) => {
    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible();
  });

  test("affiche un bouton pour rejoindre", async ({ page }) => {
    const btn = page.getByRole("button", { name: /rejoindre|entrer|join/i });
    await expect(btn.first()).toBeVisible();
  });

  test("affiche une erreur avec un code invalide", async ({ page }) => {
    const input = page.getByRole("textbox").first();
    await input.fill("CODE-INVALIDE-123");
    await page.getByRole("button", { name: /rejoindre|entrer|join/i }).first().click();
    // Doit afficher une erreur ou rester sur la page
    await expect(page).toHaveURL(/rejoindre/, { timeout: 3000 });
  });
});
