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

async function openMessageMenu(page: Page, messageText: string) {
  const msgCard = page.locator("div.group").filter({ hasText: messageText }).last();
  await msgCard.scrollIntoViewIfNeeded();
  await msgCard.hover({ force: true });
  const menuBtn = msgCard.locator("button").last();
  await menuBtn.click({ force: true });
}

test.describe("Sidebar — Chat", () => {
  let context: BrowserContext;
  let page: Page;
  const state = { sentText: "" };

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
    await expect(page.locator("#vtt-sidebar-chat")).toBeVisible({ timeout: 8000 });
    await page.locator("#vtt-sidebar-chat").click();
    await expect(page.getByPlaceholder("Écrire un message...")).toBeVisible({ timeout: 8000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── Envoi ─────────────────────────────────────────────────────────────────

  test("peut envoyer un message via le bouton Send", async () => {
    state.sentText = `PW-chat-${Date.now()}`;
    const input = page.getByPlaceholder("Écrire un message...");
    await input.fill(state.sentText);
    await page.locator('button[type="submit"]').click();
    await expect(input).toHaveValue("", { timeout: 5000 });
  });

  test("le message envoyé apparaît dans la liste", async () => {
    await expect(page.locator("div.whitespace-pre-wrap, div.p-3").filter({ hasText:state.sentText })).toBeVisible({ timeout: 8000 });
  });

  test("peut envoyer un message avec la touche Entrée", async () => {
    const msg = `PW-enter-${Date.now()}`;
    const input = page.getByPlaceholder("Écrire un message...");
    await input.fill(msg);
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 5000 });
    await expect(page.locator("div.whitespace-pre-wrap, div.p-3").filter({ hasText:msg }).first()).toBeVisible({ timeout: 8000 });
  });

  test("le bouton Send est désactivé si le champ est vide", async () => {
    const input = page.getByPlaceholder("Écrire un message...");
    await input.fill("");
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  // ── Modifier ──────────────────────────────────────────────────────────────

  test("peut ouvrir le menu d'actions sur son propre message", async () => {
    await openMessageMenu(page, state.sentText);
    await expect(page.getByText("Modifier message")).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
  });

  test("peut modifier le texte d'un message", async () => {
    await openMessageMenu(page, state.sentText);
    await page.getByText("Modifier message").click();
    await expect(page.getByText("Modifier le message")).toBeVisible({ timeout: 3000 });
    const editInput = page.locator('[role="dialog"] input').last();
    await editInput.clear();
    const edited = state.sentText + "-edit";
    await editInput.fill(edited);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("div.whitespace-pre-wrap, div.p-3").filter({ hasText:edited }).first()).toBeVisible({ timeout: 5000 });
    state.sentText = edited;
  });

  // ── Visibilité ────────────────────────────────────────────────────────────

  test("peut modifier la visibilité d'un message", async () => {
    await openMessageMenu(page, state.sentText);
    await page.waitForTimeout(300);
    const visBtn = page.getByText("Visibilité").first();
    await expect(visBtn).toBeVisible({ timeout: 5000 });
    await visBtn.click({ force: true });
    await expect(page.getByText("Modifier la visibilité")).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "MJ" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("span").filter({ hasText: "Privé" }).first()).toBeVisible({ timeout: 5000 });
  });

  // ── Supprimer ─────────────────────────────────────────────────────────────

  test("peut supprimer un message avec confirmation", async () => {
    const toDelete = `PW-del-${Date.now()}`;
    const input = page.getByPlaceholder("Écrire un message...");
    await input.click();
    await input.pressSequentially(toDelete, { delay: 30 });
    await expect(input).toHaveValue(toDelete, { timeout: 3000 });
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 5000 });
    await expect(page.getByText(toDelete).first()).toBeVisible({ timeout: 12000 });
    await page.getByText(toDelete).first().scrollIntoViewIfNeeded();

    await openMessageMenu(page, toDelete);
    await page.getByText("Supprimer").click();
    await expect(page.getByText("Supprimer le message")).toBeVisible({ timeout: 3000 });
    await page.locator('button.bg-red-900\\/50').click();
    await expect(page.getByText(toDelete).first()).not.toBeVisible({ timeout: 5000 });
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────

  test("recliquer sur chat ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-chat").click();
    await expect(page.getByPlaceholder("Écrire un message...")).not.toBeVisible({ timeout: 3000 });
  });
});
