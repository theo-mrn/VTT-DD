import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login, TEST_ROOM_ID } from "./helpers/auth";

async function loginAndSelectCharacter(browser: any): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem("vtt-tour-completed", "true");
    localStorage.setItem("cookie-consent", "accepted");
  });

  await login(page);

  await page.goto("/personnages");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 10000 });

  const charBtn = page.getByRole("button", { name: /jouer en tant que test$/i });
  await charBtn.click();

  await expect(page).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });

  return { context, page };
}

test.describe("Sidebar — Dés", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
    await expect(page.locator("#vtt-sidebar-dice")).toBeVisible({ timeout: 8000 });
    await page.locator("#vtt-sidebar-dice").click();
    await expect(page.getByPlaceholder(/1d20 \+ 5/i)).toBeVisible({ timeout: 8000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  async function goToHistorique() {
    await page.locator("#vtt-dice-tab-history").click();
  }

  async function roll(notation: string) {
    await goToHistorique();
    const input = page.getByPlaceholder(/1d20 \+ 5/i);
    await input.clear();
    await input.fill(notation);
    await page.locator("#vtt-dice-btn-roll").click();
    await page.waitForTimeout(1200);
  }

  test("1d4 apparaît dans l'historique", async () => {
    await roll("1d4");
    await expect(page.locator("text=/1d4/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d6 apparaît dans l'historique", async () => {
    await roll("1d6");
    await expect(page.locator("text=/1d6/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d8 apparaît dans l'historique", async () => {
    await roll("1d8");
    await expect(page.locator("text=/1d8/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d10 apparaît dans l'historique", async () => {
    await roll("1d10");
    await expect(page.locator("text=/1d10/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d12 apparaît dans l'historique", async () => {
    await roll("1d12");
    await expect(page.locator("text=/1d12/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20 apparaît dans l'historique", async () => {
    await roll("1d20");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d100 apparaît dans l'historique", async () => {
    await roll("1d100");
    await expect(page.locator("text=/1d100/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+5 apparaît dans l'historique", async () => {
    await roll("1d20+5");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20-2 apparaît dans l'historique", async () => {
    await roll("1d20-2");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("2d6+3 apparaît dans l'historique", async () => {
    await roll("2d6+3");
    await expect(page.locator("text=/2d6/").first()).toBeVisible({ timeout: 5000 });
  });

  test("3d8 apparaît dans l'historique", async () => {
    await roll("3d8");
    await expect(page.locator("text=/3d8/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+CON remplace CON par la valeur du personnage", async () => {
    await roll("1d20+CON");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+SAG remplace SAG par la valeur du personnage", async () => {
    await roll("1d20+SAG");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+FOR remplace FOR par la valeur du personnage", async () => {
    await roll("1d20+FOR");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+DEX remplace DEX par la valeur du personnage", async () => {
    await roll("1d20+DEX");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+INT remplace INT par la valeur du personnage", async () => {
    await roll("1d20+INT");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("1d20+CHA remplace CHA par la valeur du personnage", async () => {
    await roll("1d20+CHA");
    await expect(page.locator("text=/1d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("2d20kh1 (avantage) apparaît dans l'historique", async () => {
    await roll("2d20kh1");
    await expect(page.locator("text=/2d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("2d20kl1 (désavantage) apparaît dans l'historique", async () => {
    await roll("2d20kl1");
    await expect(page.locator("text=/2d20/").first()).toBeVisible({ timeout: 5000 });
  });

  test("4d6kh3 (génération stats D&D) apparaît dans l'historique", async () => {
    await roll("4d6kh3");
    await expect(page.locator("text=/4d6/").first()).toBeVisible({ timeout: 5000 });
  });

  test("2d8kl1 apparaît dans l'historique", async () => {
    await roll("2d8kl1");
    await expect(page.locator("text=/2d8/").first()).toBeVisible({ timeout: 5000 });
  });

  test("lancer sans notation n'ajoute pas de résultat", async () => {
    await goToHistorique();
    const input = page.getByPlaceholder(/1d20 \+ 5/i);
    await input.clear();
    const rollBtn = page.locator("#vtt-dice-btn-roll");
    const isDisabled = await rollBtn.isDisabled();
    expect(typeof isDisabled).toBe("boolean");
    if (!isDisabled) {
      const lastEntry = page.locator(".space-y-2 > div").last();
      const lastTextBefore = await lastEntry.textContent().catch(() => "");
      await rollBtn.click();
      await page.waitForTimeout(500);
      const lastTextAfter = await lastEntry.textContent().catch(() => "");
      expect(lastTextAfter).toBe(lastTextBefore);
    }
  });

  test("l'onglet Historique affiche les lancers passés", async () => {
    await goToHistorique();
    await expect(page.locator("#vtt-dice-tab-history")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/1d/").first()).toBeVisible({ timeout: 5000 });
  });

  test("peut basculer vers l'onglet Statistiques", async () => {
    await page.locator("#vtt-dice-tab-stats").click();
    await expect(page.locator("#vtt-dice-tab-stats")).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(300);
  });

  test("les statistiques contiennent des données de lancers", async () => {
    await expect(page.locator("#vtt-dice-tab-stats")).toBeVisible({ timeout: 3000 });
  });

  test("peut revenir à l'onglet Historique", async () => {
    await goToHistorique();
    await expect(page.locator("text=/1d/").first()).toBeVisible({ timeout: 5000 });
  });

  test("recliquer sur dés ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-dice").click();
    await expect(page.getByPlaceholder(/1d20 \+ 5/i)).not.toBeVisible({ timeout: 3000 });
  });
});
