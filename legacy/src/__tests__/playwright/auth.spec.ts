import { test, expect } from "@playwright/test";

/**
 * Tests Playwright — Authentification (/auth)
 * Couvre : affichage, navigation connexion/inscription, validation, reset password
 */

test.describe("Page d'authentification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
  });

  // ── Affichage ──────────────────────────────────────────────────────────────

  test("affiche le formulaire de connexion par défaut", async ({ page }) => {
    await expect(page.getByText("Bienvenue !")).toBeVisible();
    await expect(page.getByPlaceholder("votre@email.com")).toBeVisible();
    await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();
  });

  test("affiche le bouton de connexion Google", async ({ page }) => {
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("affiche le lien vers l'inscription", async ({ page }) => {
    await expect(page.getByText("S'inscrire gratuitement")).toBeVisible();
  });

  // ── Navigation connexion ↔ inscription ────────────────────────────────────

  test("bascule vers le formulaire d'inscription", async ({ page }) => {
    await page.getByText("S'inscrire gratuitement").click();
    await expect(page.getByText("Créer un compte")).toBeVisible();
    await expect(page.getByPlaceholder("Nom d'utilisateur")).toBeVisible();
  });

  test("bascule retour vers la connexion depuis l'inscription", async ({ page }) => {
    await page.getByText("S'inscrire gratuitement").click();
    await page.getByText("Se connecter").click();
    await expect(page.getByText("Bienvenue !")).toBeVisible();
    await expect(page.getByPlaceholder("Nom d'utilisateur")).not.toBeVisible();
  });

  // ── Formulaire d'inscription ───────────────────────────────────────────────

  test("affiche les 3 champs en mode inscription", async ({ page }) => {
    await page.getByText("S'inscrire gratuitement").click();
    await expect(page.getByPlaceholder("Nom d'utilisateur")).toBeVisible();
    await expect(page.getByPlaceholder("votre@email.com")).toBeVisible();
    await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();
  });

  // ── Reset password ─────────────────────────────────────────────────────────

  test("affiche le lien 'Mot de passe oublié'", async ({ page }) => {
    await expect(page.getByText(/oublié/i)).toBeVisible();
  });

  test("bascule vers le formulaire de reset password", async ({ page }) => {
    await page.getByText(/oublié/i).click();
    await expect(page.getByText("Réinitialiser")).toBeVisible();
    await expect(page.getByText(/lien de récupération/i)).toBeVisible();
  });

  test("affiche un bouton retour depuis le reset password", async ({ page }) => {
    await page.getByText(/oublié/i).click();
    await expect(page.getByText("Retour à la connexion")).toBeVisible();
  });

  test("retour à la connexion depuis le reset password", async ({ page }) => {
    await page.getByText(/oublié/i).click();
    await page.getByText("Retour à la connexion").click();
    await expect(page.getByText("Bienvenue !")).toBeVisible();
  });

  // ── Validation erreurs ────────────────────────────────────────────────────

  test("affiche une erreur avec des identifiants invalides", async ({ page }) => {
    await page.getByPlaceholder("votre@email.com").fill("invalide@test.com");
    await page.getByPlaceholder("Mot de passe").fill("mauvais-mdp");
    await page.getByRole("button", { name: /se connecter|connexion/i }).click();
    await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 5000 });
  });

  test("affiche une erreur si email vide pour reset password", async ({ page }) => {
    await page.getByText(/oublié/i).click();
    await page.getByRole("button", { name: /réinitialiser|envoyer/i }).click();
    await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 5000 });
  });
});
