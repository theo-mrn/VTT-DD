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

test.describe("Sidebar — Notes", () => {
  let context: BrowserContext;
  let page: Page;
  const ts = Date.now();
  const state = {
    noteTitle: "",
    noteTitleEdited: "",
    queteTitle: `PW-quete-${ts}`,
    persoTitle: `PW-perso-${ts}`,
  };

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndSelectCharacter(browser));
    await expect(page.locator("#vtt-sidebar-notes")).toBeVisible({ timeout: 8000 });
    await page.locator("#vtt-sidebar-notes").click();
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).toBeVisible({ timeout: 8000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  const editor = () => page.locator(".fixed.inset-0.z-50").last();

  async function openEditor() {
    await page.getByText("Nouvelle entrée").click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
  }

  async function saveNote() {
    await editor().getByRole("button", { name: /enregistrer/i }).click();
    await expect(page.getByPlaceholder("Titre du document...")).not.toBeVisible({ timeout: 5000 });
  }

  async function selectNoteType(typeName: string) {
    await editor().locator("button").filter({ hasText: new RegExp(typeName, "i") }).first().click();
  }

  test("le bouton 'Nouvelle entrée' est présent", async () => {
    await expect(page.getByText("Nouvelle entrée")).toBeVisible({ timeout: 5000 });
  });

  test("peut créer une nouvelle note de type 'Autre'", async () => {
    state.noteTitle = `PW-note-${Date.now()}`;
    await openEditor();
    await page.getByPlaceholder("Titre du document...").fill(state.noteTitle);
    await page.getByPlaceholder("Commencez à rédiger...").fill("Contenu de test Playwright.");
    await saveNote();
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("la note créée apparaît dans la liste", async () => {
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut créer une note de type 'Quête'", async () => {
    await openEditor();
    await page.getByPlaceholder("Titre du document...").fill(state.queteTitle);
    await selectNoteType("Quête");
    await saveNote();
    await expect(page.getByRole("heading", { name: state.queteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut créer une note de type 'Personnage'", async () => {
    await openEditor();
    await page.getByPlaceholder("Titre du document...").fill(state.persoTitle);
    await selectNoteType("Personnage");
    await saveNote();
    await expect(page.getByRole("heading", { name: state.persoTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("le filtre 'Mes notes' affiche les notes privées", async () => {
    await page.getByText("Mes notes").click();
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("le filtre 'Partagées avec moi' n'affiche pas les notes privées", async () => {
    await page.getByText("Partagées avec moi").click();
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).not.toBeVisible({ timeout: 3000 });
  });

  test("le filtre 'Toutes' réaffiche toutes les notes", async () => {
    await page.getByText("Toutes").click();
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("filtrer par catégorie 'Quête' n'affiche que les quêtes", async () => {
    const filterBar = page.locator("div").filter({ hasText: /tout|personnage|lieu|quête/i }).first();
    await filterBar.getByRole("button", { name: /quête/i }).click();
    await expect(page.getByRole("heading", { name: state.queteTitle }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).not.toBeVisible({ timeout: 3000 });
  });

  test("le filtre 'Tout' réinitialise la catégorie", async () => {
    const filterBar = page.locator("div").filter({ hasText: /tout|personnage|lieu|quête/i }).first();
    await filterBar.getByRole("button", { name: /^tout$/i }).click();
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 5000 });
  });

  test("la recherche filtre les notes par titre", async () => {
    const search = page.getByPlaceholder("Rechercher dans les archives...");
    await search.fill(state.noteTitle);
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("heading", { name: state.queteTitle }).first()).not.toBeVisible({ timeout: 3000 });
  });

  test("une recherche sans résultat vide la liste", async () => {
    const search = page.getByPlaceholder("Rechercher dans les archives...");
    await search.fill("zzz-inexistant-zzz");
    await expect(page.getByRole("heading", { name: state.noteTitle }).first()).not.toBeVisible({ timeout: 3000 });
    await search.clear();
  });

  test("peut ouvrir une note et modifier son titre", async () => {
    state.noteTitleEdited = `PW-edited-${Date.now()}`;
    await page.getByRole("heading", { name: state.noteTitle }).first().click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
    const titleInput = page.getByPlaceholder("Titre du document...");
    await titleInput.clear();
    await titleInput.fill(state.noteTitleEdited);
    await saveNote();
    await expect(page.getByRole("heading", { name: state.noteTitleEdited }).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut changer le type d'une note (Autre → Lieu)", async () => {
    await page.getByRole("heading", { name: state.noteTitleEdited }).first().click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
    await selectNoteType("Lieu");
    await saveNote();
    await expect(page.getByRole("heading", { name: state.noteTitleEdited }).first()).toBeVisible({ timeout: 5000 });
  });

  test("peut supprimer une note via l'éditeur", async () => {
    await page.getByRole("heading", { name: state.noteTitleEdited }).first().click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
    await editor().getByRole("button", { name: /supprimer/i }).click();
    await expect(page.getByText("Supprimer définitivement ?")).toBeVisible({ timeout: 3000 });
    await page.locator("button.bg-red-900\\/50").click();
    await expect(page.getByRole("heading", { name: state.noteTitleEdited }).first()).not.toBeVisible({ timeout: 5000 });
  });

  test("recliquer sur notes ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-notes").click();
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).not.toBeVisible({ timeout: 3000 });
  });
});
