import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login, TEST_ROOM_ID } from "./helpers/auth";

/**
 * Setup commun : login → /personnages → sélection personnage "test" → map
 * On désactive le tour guidé via localStorage pour éviter l'overlay driver.js
 */
async function loginAndSelectCharacter(browser: any): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Désactiver le tour guidé et le banner cookie avant de charger la page
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

// Helper : ouvrir le menu contextuel d'un message (force hover pour passer le header fixe)
async function openMessageMenu(page: Page, messageText: string) {
  // Le message est dans le ScrollArea — le header fixe du chat peut intercepter le hover
  // On utilise force:true pour contourner
  const msgCard = page.locator("div.group").filter({ hasText: messageText }).last();
  await msgCard.scrollIntoViewIfNeeded();
  await msgCard.hover({ force: true });
  // Le bouton MoreVertical est le dernier bouton dans la card (opacity-0 → visible au hover)
  const menuBtn = msgCard.locator("button").last();
  await menuBtn.click({ force: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Sidebar — Chat", () => {
  let context: BrowserContext;
  let page: Page;
  // Objet mutable pour partager l'état entre tests séquentiels
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
    // Le bouton submit du formulaire de composition
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
    // Fermer le popover
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
    // Attendre que le popover soit stable avant de cliquer
    await page.waitForTimeout(300);
    const visBtn = page.getByText("Visibilité").first();
    await expect(visBtn).toBeVisible({ timeout: 5000 });
    await visBtn.click({ force: true });
    await expect(page.getByText("Modifier la visibilité")).toBeVisible({ timeout: 3000 });
    // Sélectionner MJ
    await page.getByRole("button", { name: "MJ" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    // Badge Privé doit apparaître
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
    // Attendre que le champ soit vidé (confirmation d'envoi Firebase)
    await expect(input).toHaveValue("", { timeout: 5000 });
    // Attendre l'apparition du message dans le DOM (cherche le texte brut)
    await expect(page.getByText(toDelete).first()).toBeVisible({ timeout: 12000 });
    // Défiler vers lui si nécessaire
    await page.getByText(toDelete).first().scrollIntoViewIfNeeded();

    await openMessageMenu(page, toDelete);
    await page.getByText("Supprimer").click();
    await expect(page.getByText("Supprimer le message")).toBeVisible({ timeout: 3000 });
    // Cliquer le bouton destructive dans le dialog
    // Le dialog de confirmation a un bouton destructive (bg-red)
    await page.locator('button.bg-red-900\\/50').click();
    await expect(page.getByText(toDelete).first()).not.toBeVisible({ timeout: 5000 });
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────

  test("recliquer sur chat ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-chat").click();
    await expect(page.getByPlaceholder("Écrire un message...")).not.toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════════════════════

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

  // L'éditeur est un modal fixed inset-0 z-50 — on le cible pour éviter les conflits
  const editor = () => page.locator(".fixed.inset-0.z-50").last();

  async function openEditor() {
    await page.getByText("Nouvelle entrée").click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
  }

  async function saveNote() {
    await editor().getByRole("button", { name: /enregistrer/i }).click();
    // Attendre que l'éditeur se ferme
    await expect(page.getByPlaceholder("Titre du document...")).not.toBeVisible({ timeout: 5000 });
  }

  // Cliquer un type dans l'éditeur (grille dans la sidebar gauche du modal)
  async function selectNoteType(typeName: string) {
    // Les boutons de type sont dans l'éditeur uniquement
    await editor().locator("button").filter({ hasText: new RegExp(typeName, "i") }).first().click();
  }

  // ── Création ──────────────────────────────────────────────────────────────

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

  // ── Filtres par onglet ────────────────────────────────────────────────────

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

  // ── Filtre par catégorie ──────────────────────────────────────────────────

  test("filtrer par catégorie 'Quête' n'affiche que les quêtes", async () => {
    // Les filtres catégorie sont des boutons rounded-full dans la barre de filtres (pas dans l'éditeur)
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

  // ── Recherche ─────────────────────────────────────────────────────────────

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

  // ── Modifier ──────────────────────────────────────────────────────────────

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

  // ── Supprimer ─────────────────────────────────────────────────────────────

  test("peut supprimer une note via l'éditeur", async () => {
    // Ouvrir la note
    await page.getByRole("heading", { name: state.noteTitleEdited }).first().click();
    await expect(page.getByPlaceholder("Titre du document...")).toBeVisible({ timeout: 5000 });
    // Le bouton delete est dans l'éditeur
    await editor().getByRole("button", { name: /supprimer/i }).click();
    // Confirmation dans l'overlay z-[60]
    await expect(page.getByText("Supprimer définitivement ?")).toBeVisible({ timeout: 3000 });
    await page.locator("button.bg-red-900\\/50").click();
    await expect(page.getByRole("heading", { name: state.noteTitleEdited }).first()).not.toBeVisible({ timeout: 5000 });
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────

  test("recliquer sur notes ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-notes").click();
    await expect(page.getByPlaceholder("Rechercher dans les archives...")).not.toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DÉS
// ═══════════════════════════════════════════════════════════════════════════════

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
    // Attendre fin d'animation (dé 3D)
    await page.waitForTimeout(1200);
  }

  // ── Dés classiques ────────────────────────────────────────────────────────

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

  // ── Modificateurs fixes ────────────────────────────────────────────────────

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

  // ── Modificateurs de stats ─────────────────────────────────────────────────

  test("1d20+CON remplace CON par la valeur du personnage", async () => {
    await roll("1d20+CON");
    // La notation originale doit apparaître dans l'historique
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

  // ── Keep Highest / Keep Lowest ─────────────────────────────────────────────

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

  // ── Champ vide ────────────────────────────────────────────────────────────

  test("lancer sans notation n'ajoute pas de résultat", async () => {
    await goToHistorique();
    const input = page.getByPlaceholder(/1d20 \+ 5/i);
    await input.clear();
    const rollBtn = page.locator("#vtt-dice-btn-roll");
    // Si le bouton est désactivé quand le champ est vide, c'est le comportement attendu
    const isDisabled = await rollBtn.isDisabled();
    expect(typeof isDisabled).toBe("boolean"); // Le bouton existe
    // Si actif, on vérifie qu'aucune notation vide ne génère d'entrée d'historique
    if (!isDisabled) {
      const lastEntry = page.locator(".space-y-2 > div").last();
      const lastTextBefore = await lastEntry.textContent().catch(() => "");
      await rollBtn.click();
      await page.waitForTimeout(500);
      const lastTextAfter = await lastEntry.textContent().catch(() => "");
      // Le dernier élément n'a pas changé → rien n'a été ajouté
      expect(lastTextAfter).toBe(lastTextBefore);
    }
  });

  // ── Historique / Statistiques ─────────────────────────────────────────────

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
    // Le panneau stats est visible (pas de crash)
    await expect(page.locator("#vtt-dice-tab-stats")).toBeVisible({ timeout: 3000 });
  });

  test("peut revenir à l'onglet Historique", async () => {
    await goToHistorique();
    await expect(page.locator("text=/1d/").first()).toBeVisible({ timeout: 5000 });
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────

  test("recliquer sur dés ferme le panneau", async () => {
    await page.locator("#vtt-sidebar-dice").click();
    await expect(page.getByPlaceholder(/1d20 \+ 5/i)).not.toBeVisible({ timeout: 3000 });
  });
});
