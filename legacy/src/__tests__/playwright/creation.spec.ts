import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login } from "./helpers/auth";

// ─── Création de personnage ───────────────────────────────────────────────────

test.describe("Création de personnage (/creation)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
    await page.goto("/creation");
    await page.waitForLoadState("domcontentloaded");
    // Remplir le nom pour débloquer la navigation dès le début
    await page.getByPlaceholder("Ex: Alagarth de Viveflamme").fill("Gandalf Test");
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("affiche la barre de navigation avec les onglets", async () => {
    await expect(page.getByRole("button", { name: "INFORMATIONS" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "ESPÈCE" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "PROFIL" })).toBeVisible({ timeout: 8000 });
  });

  test("l'onglet INFORMATIONS est actif par défaut", async () => {
    await expect(page.getByPlaceholder("Ex: Alagarth de Viveflamme")).toBeVisible({ timeout: 8000 });
  });

  test("peut remplir le nom du personnage", async () => {
    await expect(page.getByPlaceholder("Ex: Alagarth de Viveflamme")).toHaveValue("Gandalf Test");
  });

  test("peut naviguer vers l'onglet ESPÈCE", async () => {
    await page.getByRole("button", { name: "ESPÈCE" }).click();
    await expect(page.getByText(/choisissez|espèce|race/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut naviguer vers l'onglet PROFIL", async () => {
    await page.getByRole("button", { name: "PROFIL" }).click();
    await expect(page.getByText(/choisissez|profil|classe/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut naviguer vers l'onglet CARACTÉRISTIQUES", async () => {
    await page.getByRole("button", { name: "CARACTÉRISTIQUES" }).click();
    await expect(page.getByText(/FOR|DEX|CON|INT|SAG|CHA/).first()).toBeVisible({ timeout: 5000 });
  });

  test("le bouton 'Lancer les dés' génère des stats", async () => {
    const rollBtn = page.getByRole("button", { name: /lancer|dés|roll/i }).first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
    await rollBtn.click();
    await expect(page.getByText(/FOR|DEX|CON/).first()).toBeVisible();
  });

  test("le bouton 'Créer le personnage' est présent sur l'onglet PORTRAIT", async () => {
    await page.getByRole("button", { name: "PORTRAIT" }).click();
    await expect(page.getByRole("button", { name: /créer le personnage/i })).toBeVisible({ timeout: 5000 });
  });
});

// ─── Créer une salle (/creer) ─────────────────────────────────────────────────

test.describe("Création de salle (/creer)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
    await page.goto("/creer");
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("affiche le formulaire de création", async () => {
    await expect(page.getByLabel(/titre/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel(/joueurs max/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel(/description/i)).toBeVisible({ timeout: 8000 });
  });

  test("peut remplir le titre", async () => {
    await page.getByLabel(/titre/i).fill("Salle de test Playwright");
    await expect(page.getByLabel(/titre/i)).toHaveValue("Salle de test Playwright");
  });

  test("peut modifier le nombre de joueurs max", async () => {
    const input = page.getByLabel(/joueurs max/i);
    await input.fill("4");
    await expect(input).toHaveValue("4");
  });

  test("peut remplir la description", async () => {
    await page.getByLabel(/description/i).fill("Une aventure de test.");
    await expect(page.getByLabel(/description/i)).toHaveValue("Une aventure de test.");
  });

  test("le toggle 'Campagne publique' est présent", async () => {
    await expect(page.getByText(/campagne publique/i)).toBeVisible({ timeout: 5000 });
  });

  test("le toggle 'Création libre' est présent", async () => {
    await expect(page.getByText(/création libre/i)).toBeVisible({ timeout: 5000 });
  });

  test("le bouton de soumission est présent", async () => {
    const submitBtn = page.getByRole("button", { name: /créer|lancer|salle/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
  });
});

// ─── Entrer en tant que MJ ────────────────────────────────────────────────────

test.describe("Entrer en tant que MJ", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
    await page.goto("/personnages");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("le bouton MJ est présent", async () => {
    await expect(
      page.getByRole("button", { name: /entrer comme maître du jeu/i })
    ).toBeVisible({ timeout: 8000 });
  });

  test("cliquer sur MJ redirige vers la map", async () => {
    await page.getByRole("button", { name: /entrer comme maître du jeu/i }).click();
    await expect(page).toHaveURL(/\/map/, { timeout: 10000 });
  });

  test("la map MJ est accessible avec canvas", async () => {
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });
  });
});
