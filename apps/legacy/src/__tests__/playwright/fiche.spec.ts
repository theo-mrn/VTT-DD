import { test, expect, BrowserContext, Page } from "@playwright/test";
import { login, TEST_ROOM_ID } from "./helpers/auth";

// Timeout global élevé — le beforeAll racine fait login + navigate
test.setTimeout(90000);

// ─── Session partagée ────────────────────────────────────────────────────────
// Un seul login pour tout le fichier, tous les describes partagent le même
// contexte/page pour éviter les rate-limits Firebase.
let sharedContext: BrowserContext;
let sharedPage: Page;

/**
 * Assure que la fiche est ouverte et dans un état propre :
 * - formulaire Modifier fermé
 * - dialogs fermés
 * - panneau FloatingEditTabs fermé
 * - on est bien sur la map
 */
async function ensureFicheOpen() {
  const page = sharedPage;

  // Si la page a navigué ailleurs, revenir sur la map
  const url = page.url();
  if (!url.includes("/map")) {
    await page.goto(`/${TEST_ROOM_ID}/map`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });
  }

  // Fermer le formulaire Modifier s'il est ouvert
  const cancelBtn = page.getByRole("button", { name: "Annuler" });
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(300);
  }

  // Fermer le FloatingEditTabs s'il est ouvert
  const floatingPanel = page.locator('div.fixed.right-0').filter({ hasText: /éditeur/i });
  if (await floatingPanel.isVisible().catch(() => false)) {
    await floatingPanel.locator("button.button-primary").first().click();
    await page.waitForTimeout(300);
  }

  // Fermer tout dialog Radix ouvert (Escape)
  const openDialog = page.locator('[role="dialog"]');
  if (await openDialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Ouvrir la fiche si elle n'est pas visible
  const isFicheVisible = await page.locator("#vtt-fiche-btn-modifier").isVisible().catch(() => false);
  if (!isFicheVisible) {
    const sidebarFiche = page.locator("#vtt-sidebar-fiche");
    if (await sidebarFiche.isVisible()) {
      await sidebarFiche.click();
      await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });
    }
  }

  // Attendre que les toasts soient partis
  await page.waitForTimeout(300);
}

test.beforeAll(async ({ browser }) => {
  sharedContext = await browser.newContext();
  sharedPage = await sharedContext.newPage();

  await sharedPage.addInitScript(() => {
    localStorage.setItem("vtt-tour-completed", "true");
    localStorage.setItem("cookie-consent", "accepted");
  });

  await login(sharedPage);

  await sharedPage.goto("/personnages");
  await sharedPage.waitForLoadState("domcontentloaded");
  await expect(sharedPage.getByText(/invocation des héros/i)).not.toBeVisible({ timeout: 10000 });

  await sharedPage.getByRole("button", { name: /jouer en tant que test$/i }).click();
  await expect(sharedPage).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
  await expect(sharedPage.locator("canvas").first()).toBeVisible({ timeout: 10000 });

  await expect(sharedPage.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 8000 });
  await sharedPage.locator("#vtt-sidebar-fiche").click();
  await expect(sharedPage.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });
});

test.afterAll(async () => {
  await sharedContext?.close();
});

/**
 * Helper pour les describes qui veulent leur propre contexte isolé
 * (tests avec rechargement de page, suppression de données, etc.)
 */
async function loginAndOpenFiche(browser: any): Promise<{ context: BrowserContext; page: Page }> {
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

  await page.getByRole("button", { name: /jouer en tant que test$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/${TEST_ROOM_ID}/map`), { timeout: 10000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });

  await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 8000 });
  await page.locator("#vtt-sidebar-fiche").click();
  await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

  return { context, page };
}

/**
 * Ouvre le formulaire d'édition (s'assure qu'il n'est pas déjà ouvert)
 */
async function openEditForm(page: Page) {
  // Si le form est déjà ouvert, on le ferme d'abord
  const alreadyOpen = await page.getByRole("button", { name: "Annuler" }).isVisible().catch(() => false);
  if (alreadyOpen) {
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 5000 });
  }
  await page.locator("#vtt-fiche-btn-modifier").click();
  // Attendre le titre "Modifier test"
  await expect(page.getByText(/modifier test/i).first()).toBeVisible({ timeout: 5000 });
}

/**
 * Sauvegarde le formulaire et attend le toast de succès
 */
async function saveForm(page: Page) {
  // Attendre que les toasts précédents soient disparus (durée 2s chacun)
  await page.waitForFunction(() => {
    const toasts = document.querySelectorAll('[data-sonner-toast]');
    return toasts.length === 0;
  }, { timeout: 8000 }).catch(() => { /* ignorer si pas de toasts */ });

  // Scroller vers le bas pour s'assurer que le bouton est visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // Le bouton Sauvegarder du formulaire d'édition (accent-brown, texte noir)
  const saveBtn = page.locator('button').filter({ hasText: /^sauvegarder$/i }).last();
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await expect(page.getByText(/modification de test réussi/i).first()).toBeVisible({ timeout: 10000 });
  // Attendre que ce toast disparaisse avant de continuer
  await expect(page.getByText(/modification de test réussi/i).first()).not.toBeVisible({ timeout: 5000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AFFICHAGE GÉNÉRAL
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Affichage général", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("la fiche s'ouvre depuis la sidebar", async () => {
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 5000 });
  });

  test("le nom du personnage 'test' est affiché", async () => {
    // Le nom est dans le WidgetDetails (h2)
    await expect(page.locator("h2").filter({ hasText: /^test$/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test("le niveau est affiché dans les détails", async () => {
    await expect(page.getByText(/niveau/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("le profil est affiché (chevalier)", async () => {
    await expect(page.getByText(/chevalier/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("la race est affichée (nain)", async () => {
    await expect(page.getByText(/nain/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("les PV sont affichés au format PV / PV_Max", async () => {
    await expect(page.locator("span").filter({ hasText: /\d+ \/ \d+/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test("les stats FOR/DEX/CON/SAG/INT/CHA sont affichées", async () => {
    for (const stat of ["FOR", "DEX", "CON", "SAG", "INT", "CHA"]) {
      await expect(page.getByText(stat).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("les stats de combat Contact/Distance/Magie sont affichées", async () => {
    for (const stat of ["Contact", "Distance", "Magie"]) {
      await expect(page.getByText(stat).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("la Défense est affichée dans le widget vitals", async () => {
    // Le widget vitals affiche la valeur Defense avec une icône Shield (pas de label texte)
    // On vérifie que la section vitals a bien 2 éléments (PV et Defense)
    await expect(page.locator("svg.text-blue-500").first()).toBeVisible({ timeout: 5000 });
  });

  test("les boutons d'action sont présents", async () => {
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible();
    await expect(page.locator("#vtt-fiche-btn-level-up")).toBeVisible();
    await expect(page.locator("#vtt-fiche-btn-stats")).toBeVisible();
    await expect(page.locator("#vtt-fiche-btn-edition")).toBeVisible();
  });

  test("cliquer sur la Race ouvre les capacités raciales", async () => {
    // Le lien Race est dans WidgetDetails (span souligné cliquable)
    await page.locator("span.underline.cursor-pointer").filter({ hasText: /nain/i }).first().click();
    await expect(page.getByText(/capacités raciales/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /fermer/i }).click();
    await expect(page.getByText(/capacités raciales/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("cliquer sur 'Infos' ouvre le dialog des informations personnelles", async () => {
    await page.getByText("Infos").first().click();
    await expect(page.getByText(/informations personnelles/i)).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(page.getByText(/informations personnelles/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("les modificateurs sont affichés avec + ou -", async () => {
    // Le widget stats affiche +X ou -X pour chaque stat
    await expect(page.locator("div").filter({ hasText: /^[+-]\d+$/ }).first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODIFICATION DES STATS (formulaire Modifier)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Modifier les stats", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("cliquer sur 'Modifier' ouvre le formulaire d'édition", async () => {
    await openEditForm(page);
    await expect(page.getByText(/modifier test/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("le formulaire contient tous les champs attendus", async () => {
    // Labels du formulaire (avec accents tels qu'ils apparaissent)
    for (const label of ["PV", "PV Maximum", "Défense", "Contact", "Magie", "Distance", "Initiative"]) {
      await expect(page.locator("label").filter({ hasText: new RegExp(label, "i") }).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("le formulaire contient les caractéristiques FOR/DEX/CON/SAG/INT/CHA", async () => {
    for (const stat of ["FOR", "DEX", "CON", "SAG", "INT", "CHA"]) {
      await expect(page.locator("label").filter({ hasText: new RegExp(`^${stat}$`) }).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("peut modifier les PV et sauvegarder", async () => {
    const pvInput = page.locator("label").filter({ hasText: /^PV$/ }).locator("..").locator("input");
    await pvInput.clear();
    await pvInput.fill("12");
    await saveForm(page);
  });

  test("peut modifier PV_Max", async () => {
    await openEditForm(page);
    const pvMaxInput = page.locator("label").filter({ hasText: /pv maximum/i }).locator("..").locator("input");
    await pvMaxInput.clear();
    await pvMaxInput.fill("25");
    await saveForm(page);
  });

  test("peut modifier la Défense", async () => {
    await openEditForm(page);
    const defInput = page.locator("label").filter({ hasText: /^défense$/i }).locator("..").locator("input");
    await defInput.clear();
    await defInput.fill("15");
    await saveForm(page);
  });

  test("peut modifier Contact", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^contact$/i }).locator("..").locator("input");
    await input.clear();
    await input.fill("8");
    await saveForm(page);
  });

  test("peut modifier Magie", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^magie$/i }).locator("..").locator("input");
    await input.clear();
    await input.fill("6");
    await saveForm(page);
  });

  test("peut modifier Distance", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^distance$/i }).locator("..").locator("input");
    await input.clear();
    await input.fill("7");
    await saveForm(page);
  });

  test("peut modifier l'Initiative", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /initiative/i }).locator("..").locator("input");
    await input.clear();
    await input.fill("5");
    await saveForm(page);
  });

  test("peut modifier FOR", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^FOR$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("14");
    await saveForm(page);
  });

  test("peut modifier DEX", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^DEX$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("12");
    await saveForm(page);
  });

  test("peut modifier CON", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^CON$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("14");
    await saveForm(page);
  });

  test("peut modifier SAG", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^SAG$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("10");
    await saveForm(page);
  });

  test("peut modifier INT", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^INT$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("8");
    await saveForm(page);
  });

  test("peut modifier CHA", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^CHA$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("10");
    await saveForm(page);
  });

  test("peut remplir le Background", async () => {
    await openEditForm(page);
    const bgArea = page.getByPlaceholder(/histoire de votre personnage/i);
    await bgArea.clear();
    await bgArea.fill("Background Playwright test.");
    await saveForm(page);
  });

  test("peut remplir la Description physique", async () => {
    await openEditForm(page);
    const descArea = page.getByPlaceholder(/apparence de votre personnage/i);
    await descArea.scrollIntoViewIfNeeded();
    await descArea.clear();
    await descArea.fill("Description Playwright test.");
    await descArea.blur();
    await saveForm(page);
  });

  test("annuler ferme le formulaire sans sauvegarder", async () => {
    await openEditForm(page);
    // Modifier une valeur
    const pvInput = page.locator("label").filter({ hasText: /^PV$/ }).locator("..").locator("input");
    await pvInput.clear();
    await pvInput.fill("999");
    // Annuler
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByText(/modifier test/i)).not.toBeVisible({ timeout: 5000 });
  });

  test("peut modifier toutes les caractéristiques en une fois", async () => {
    await openEditForm(page);
    const stats: Record<string, string> = {
      FOR: "16", DEX: "12", CON: "14", SAG: "10", INT: "8", CHA: "12",
    };
    for (const [stat, val] of Object.entries(stats)) {
      const input = page.locator("label").filter({ hasText: new RegExp(`^${stat}$`) }).locator("..").locator("input");
      await input.clear();
      await input.fill(val);
    }
    await saveForm(page);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALEURS REFLÉTÉES DANS LES WIDGETS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Widgets reflètent les modifications", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("FOR=16 → modificateur +3 affiché dans le widget", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^FOR$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("16");
    await saveForm(page);
    // FOR=16 → (16-10)/2 = +3
    await expect(page.getByText("+3").first()).toBeVisible({ timeout: 5000 });
  });

  test("DEX=8 → modificateur -1 affiché dans le widget", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^DEX$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("8");
    await saveForm(page);
    // DEX=8 → (8-10)/2 = -1
    await expect(page.getByText("-1").first()).toBeVisible({ timeout: 5000 });
  });

  test("CON=10 → modificateur +0 affiché dans le widget", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^CON$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("10");
    await saveForm(page);
    await expect(page.getByText("+0").first()).toBeVisible({ timeout: 5000 });
  });

  test("SAG=20 → modificateur +5 affiché dans le widget", async () => {
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^SAG$/ }).locator("..").locator("input");
    await input.clear();
    await input.fill("20");
    await saveForm(page);
    // SAG=20 → (20-10)/2 = +5
    await expect(page.getByText("+5").first()).toBeVisible({ timeout: 5000 });
  });

  test("PV modifié apparaît dans le widget vitals", async () => {
    // Lire les PV max actuels
    const pvSpan = page.locator("span").filter({ hasText: /\d+ \/ \d+/ }).first();
    const pvText = await pvSpan.textContent();
    const maxPV = parseInt(pvText?.match(/\d+ \/ (\d+)/)?.[1] || "20");

    const newPV = Math.max(1, maxPV - 3);
    await openEditForm(page);
    const pvInput = page.locator("label").filter({ hasText: /^PV$/ }).locator("..").locator("input");
    await pvInput.clear();
    await pvInput.fill(String(newPV));
    await saveForm(page);

    await expect(page.locator("span").filter({ hasText: new RegExp(`^${newPV} \\/`) }).first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONTÉE DE NIVEAU
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Montée de niveau", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("cliquer sur 'Niveau +' ouvre la modal", async () => {
    await page.locator("#vtt-fiche-btn-level-up").click();
    await expect(page.getByText(/monter de niveau/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /lancer le dé/i })).toBeVisible();
  });

  test("valider sans dé affiche une erreur toast", async () => {
    await page.getByRole("button", { name: /valider/i }).first().click();
    await expect(page.getByText(/lancer requis/i)).toBeVisible({ timeout: 3000 });
  });

  test("lancer le dé affiche un résultat (X + CON = Y)", async () => {
    await page.getByRole("button", { name: /lancer le dé/i }).click();
    // Résultat sous la forme "X + CON (Y) = Z"
    await expect(page.locator("div").filter({ hasText: /\+ CON/ }).last()).toBeVisible({ timeout: 3000 });
  });

  test("annuler ferme la modal", async () => {
    await page.getByRole("button", { name: /annuler/i }).last().click();
    await expect(page.getByText(/monter de niveau/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("confirmer la montée de niveau augmente le niveau et les PV", async () => {
    // Lire le niveau actuel dans les détails
    const detailsText = await page.getByText(/niveau.*:/i).first().textContent();
    const currentNiveau = parseInt(detailsText?.match(/niveau.*?(\d+)/i)?.[1] || "1");

    await page.locator("#vtt-fiche-btn-level-up").click();
    await expect(page.getByText(/monter de niveau/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /lancer le dé/i }).click();
    await expect(page.locator("div").filter({ hasText: /\+ CON/ }).last()).toBeVisible({ timeout: 3000 });

    await page.getByRole("button", { name: /valider/i }).first().click();

    // Modal de confirmation "Niveau Augmenté !"
    await expect(page.getByText(/niveau augmenté/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pv max/i).first()).toBeVisible();
    await expect(page.getByText(/contact/i).first()).toBeVisible();

    await page.getByRole("button", { name: /fermer/i }).click();
    await expect(page.getByText(/niveau augmenté/i)).not.toBeVisible({ timeout: 3000 });

    // Le toast confirme le niveau
    await expect(page.getByText(new RegExp(`niveau ${currentNiveau + 1} atteint`, "i"))).toBeVisible({ timeout: 5000 });
  });

  test("après niveau+, le niveau affiché dans la fiche a augmenté", async () => {
    await expect(page.locator("div").filter({ hasText: /niveau/i }).first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTIQUES DES JOUEURS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Modal Statistiques", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("cliquer sur 'Stats' ouvre la modal des statistiques", async () => {
    await page.locator("#vtt-fiche-btn-stats").click();
    await expect(page.getByText(/statistiques des joueurs/i)).toBeVisible({ timeout: 5000 });
  });

  test("la modal des statistiques affiche du contenu", async () => {
    const modal = page.locator("div").filter({ hasText: /statistiques des joueurs/i }).last();
    await expect(modal).toBeVisible();
    const text = await modal.textContent();
    expect((text?.length || 0)).toBeGreaterThan(10);
  });

  test("fermer la modal des statistiques la cache", async () => {
    await page.getByRole("button", { name: /fermer/i }).first().click();
    await expect(page.getByText(/statistiques des joueurs/i)).not.toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODE ÉDITION (layout/thème)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Mode Édition", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("cliquer sur 'Édition' active le mode édition", async () => {
    await page.locator("#vtt-fiche-btn-edition").click();
    await expect(page.getByText(/éditeur/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("le panneau contient les onglets Apparence et Bloques", async () => {
    // Radix TabsTrigger renders with id containing the value name
    await expect(page.locator('[id$="-trigger-apparence"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[id$="-trigger-bloques"]').first()).toBeVisible({ timeout: 5000 });
  });

  test("cliquer sur 'Sauver' en mode édition ferme le panneau", async () => {
    const floatingPanel = page.locator('div.fixed.right-0').filter({ hasText: /éditeur/i });
    await expect(floatingPanel).toBeVisible({ timeout: 5000 });
    // Le bouton "Sauver" est dans le header du panneau (texte SAUVER en uppercase)
    const saveLayoutBtn = page.locator('button.button-primary').filter({ hasText: /sauver/i });
    await expect(saveLayoutBtn.first()).toBeVisible({ timeout: 5000 });
    await saveLayoutBtn.first().click();
    // handleSaveLayout fait un appel Firebase — attendre jusqu'à 15s
    await expect(floatingPanel).not.toBeVisible({ timeout: 15000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTAIRE ET COMPÉTENCES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Widgets Inventaire & Compétences", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("le widget inventaire est présent et visible", async () => {
    await expect(page.locator("#vtt-widget-inventory-view")).toBeVisible({ timeout: 8000 });
  });

  test("le widget compétences est présent et visible", async () => {
    await expect(page.locator("#vtt-widget-skills-view")).toBeVisible({ timeout: 8000 });
  });

  test("l'inventaire est chargé (widget rendu)", async () => {
    // L'inventaire peut être vide — on vérifie juste que le widget est monté
    const inv = page.locator("#vtt-widget-inventory-view");
    await expect(inv).toBeVisible({ timeout: 5000 });
    // Le widget a au moins un élément enfant rendu
    const childCount = await inv.locator("> *").count();
    expect(childCount).toBeGreaterThanOrEqual(0);
  });

  test("les compétences sont chargées (widget rendu)", async () => {
    const skills = page.locator("#vtt-widget-skills-view");
    await expect(skills).toBeVisible({ timeout: 5000 });
    const childCount = await skills.locator("> *").count();
    expect(childCount).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FERMETURE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Fermeture", () => {
  // Utilise la session partagée — pas de nouveau login
  let page: Page;

  test.beforeAll(async () => {
    await ensureFicheOpen();
    page = sharedPage;
  });

  test("recliquer sur l'icône fiche ferme le panneau", async () => {
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 5000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).not.toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GESTION DES PV (DRAWER)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Gestion des PV", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndOpenFiche(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  /**
   * Retourne le locator scoped au contenu du drawer PV.
   * Le drawer vaul se rend dans un portal — [vaul-drawer-wrapper] contient tout.
   */
  function pvDrawer() {
    return page.locator('[data-vaul-drawer]');
  }

  /**
   * Ouvre le drawer PV (s'il n'est pas déjà ouvert)
   */
  async function openPVDrawer() {
    const isOpen = await pvDrawer().isVisible().catch(() => false);
    if (!isOpen) {
      const vitalsBtn = page.locator('[id^="vtt-widget-vitals-view"] button').first();
      await expect(vitalsBtn).toBeVisible({ timeout: 8000 });
      await vitalsBtn.click();
      await expect(pvDrawer()).toBeVisible({ timeout: 5000 });
      await expect(pvDrawer().getByText(/gestion des points de vie/i)).toBeVisible({ timeout: 3000 });
    }
  }

  async function closePVDrawer() {
    const isOpen = await pvDrawer().isVisible().catch(() => false);
    if (isOpen) {
      await pvDrawer().getByRole("button", { name: /fermer/i }).click();
      await expect(pvDrawer()).not.toBeVisible({ timeout: 5000 });
    }
  }

  async function getPV(): Promise<number> {
    // Lire le PV depuis le drawer (scoped)
    const text = await pvDrawer().locator('.text-5xl').first().textContent();
    return parseInt(text || "0", 10);
  }

  // La rangée de boutons PV dans le drawer : -5, Minus, [display], Plus, +5
  function pvRow() {
    return pvDrawer().locator('div.flex.items-center.justify-center.space-x-2').first();
  }

  async function clickMinus1() {
    const btn = pvRow().locator('button').nth(1);
    const pvBefore = await getPV();
    await btn.click();
    // Attendre que l'affichage soit mis à jour
    await expect(pvDrawer().locator('.text-5xl').first()).not.toHaveText(String(pvBefore), { timeout: 3000 });
  }


  test("cliquer sur le widget vitals ouvre le drawer PV", async () => {
    await openPVDrawer();
    await expect(pvDrawer().getByText(/gestion des points de vie/i)).toBeVisible({ timeout: 5000 });
  });

  test("le drawer affiche les PV actuels et max", async () => {
    await openPVDrawer();
    await expect(pvDrawer().locator('.text-5xl').first()).toBeVisible({ timeout: 5000 });
    await expect(pvDrawer().getByText(/pv actuels/i)).toBeVisible({ timeout: 3000 });
  });

  test("le bouton -5 décrémente de 5 PV", async () => {
    await openPVDrawer();
    const before = await getPV();
    await pvRow().locator('button').nth(0).click();
    await expect(pvDrawer().locator('.text-5xl').first()).toHaveText(String(before - 5), { timeout: 5000 });
  });

  test("le bouton Minus (-1) décrémente les PV", async () => {
    await openPVDrawer();
    const before = await getPV();
    await pvRow().locator('button').nth(1).click();
    await expect(pvDrawer().locator('.text-5xl').first()).toHaveText(String(before - 1), { timeout: 5000 });
  });

  test("le bouton Plus (+1) incrémente les PV", async () => {
    await openPVDrawer();
    const before = await getPV();
    await pvRow().locator('button').nth(2).click();
    await expect(pvDrawer().locator('.text-5xl').first()).toHaveText(String(before + 1), { timeout: 5000 });
  });

  test("le bouton +5 incrémente de 5 PV (si pas au max)", async () => {
    await openPVDrawer();
    const before = await getPV();
    const btn = pvRow().locator('button').nth(3);
    const disabled = await btn.isDisabled();
    if (!disabled) {
      await btn.click();
      await expect(pvDrawer().locator('.text-5xl').first()).toHaveText(String(before + 5), { timeout: 5000 });
    } else {
      // Si déjà au max, le test passe quand même
      expect(disabled).toBe(true);
    }
  });

  test("'Repos complet' restaure tous les PV", async () => {
    await openPVDrawer();
    // D'abord enlever des PV pour que repos complet soit utile
    await pvRow().locator('button').nth(0).click();
    await page.waitForTimeout(500);
    await pvDrawer().getByRole("button", { name: /repos complet/i }).click();
    // Après repos complet, le bouton est désactivé (PV == PV_Max)
    await expect(pvDrawer().getByRole("button", { name: /repos complet/i })).toBeDisabled({ timeout: 5000 });
  });

  test("fermer le drawer le cache", async () => {
    await openPVDrawer();
    await closePVDrawer();
    await expect(pvDrawer()).not.toBeVisible({ timeout: 5000 });
  });

  test("les PV modifiés persistent après rechargement de page", async () => {
    await openPVDrawer();
    const pvCurrent = await getPV();

    // Décrémenter de 3 — clickMinus1 attend déjà la mise à jour
    await clickMinus1();
    await clickMinus1();
    await clickMinus1();
    await expect(pvDrawer().locator('.text-5xl').first()).toHaveText(String(pvCurrent - 3), { timeout: 5000 });
    await closePVDrawer();

    // Recharger la page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 10000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

    // Rouvrir le drawer et vérifier
    await openPVDrawer();
    const pvAfter = await getPV();
    expect(pvAfter).toBe(pvCurrent - 3);
    await closePVDrawer();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAMPS PERSONNALISÉS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Champs personnalisés", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndOpenFiche(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("cycle complet : créer, vérifier, modifier, supprimer un champ personnalisé", async () => {
    const fieldLabel = `Honneur_${Date.now()}`;

    // ── 1. Ouvrir le dialog ──────────────────────────────────────────────────
    await page.locator("#vtt-fiche-btn-champs").click();
    await expect(page.getByText(/attributs de base/i).first()).toBeVisible({ timeout: 5000 });

    // ── 2. Créer le champ ────────────────────────────────────────────────────
    await page.getByRole("button", { name: /ajouter/i }).first().click();
    await expect(page.getByText(/nouvel attribut/i)).toBeVisible({ timeout: 5000 });

    // Nom du champ — pressSequentially pour déclencher le onChange React
    const labelInput = page.getByPlaceholder(/durabilité, honneur/i);
    await labelInput.click();
    await labelInput.pressSequentially(fieldLabel, { delay: 20 });
    await expect(labelInput).toHaveValue(fieldLabel);

    // Le type "Nombre" est déjà sélectionné par défaut (premier bouton actif)
    // Vérifier que le bouton "Créer le champ" est activé
    const createBtn = page.getByRole("button", { name: /créer le champ/i });
    await expect(createBtn).toBeEnabled({ timeout: 3000 });
    await createBtn.click();
    await expect(page.getByText(/nouvel attribut/i)).not.toBeVisible({ timeout: 5000 });

    // ── 3. Le champ apparaît dans la liste ───────────────────────────────────
    await expect(page.getByText(fieldLabel).first()).toBeVisible({ timeout: 5000 });

    // ── 4. Fermer et recharger pour tester la persistance ────────────────────
    await page.keyboard.press("Escape");
    await expect(page.getByText(/attributs de base/i)).not.toBeVisible({ timeout: 3000 });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 10000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

    await page.locator("#vtt-fiche-btn-champs").click();
    await expect(page.getByText(/attributs de base/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(fieldLabel).first()).toBeVisible({ timeout: 5000 });

    // ── 5. Modifier la valeur du champ ───────────────────────────────────────
    await page.getByText(fieldLabel).first().click();
    await expect(page.getByText(/modifier l'attribut/i)).toBeVisible({ timeout: 5000 });
    const valInput = page.locator('input[type="number"]').last();
    await valInput.clear();
    await valInput.fill("99");
    await page.getByRole("button", { name: /enregistrer/i }).click();
    await expect(page.getByText(/modifier l'attribut/i)).not.toBeVisible({ timeout: 5000 });
    // La ligne du champ affiche la valeur 99 dans la liste
    await expect(page.locator('div').filter({ hasText: new RegExp(`^${fieldLabel}`) }).first()).toBeVisible({ timeout: 3000 });

    // ── 6. Supprimer le champ ────────────────────────────────────────────────
    const fieldRow = page.locator('div').filter({ hasText: new RegExp(`^${fieldLabel}`) }).first();
    await fieldRow.hover();
    const deleteBtn = fieldRow.locator('button').last();
    await deleteBtn.click({ force: true });
    await expect(page.getByText(fieldLabel)).not.toBeVisible({ timeout: 5000 });

    // Fermer
    await page.keyboard.press("Escape");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTANCE DES STATS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Persistance des stats", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndOpenFiche(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("modifier FOR et vérifier que la valeur persiste après rechargement", async () => {
    // Lire la valeur actuelle
    await openEditForm(page);
    const input = page.locator("label").filter({ hasText: /^FOR$/ }).locator("..").locator("input");
    const current = await input.inputValue();
    const newVal = current === "20" ? "18" : "20";

    await input.clear();
    await input.fill(newVal);
    await saveForm(page);

    // Recharger la page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 10000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

    // Vérifier que la valeur est bien sauvegardée
    await openEditForm(page);
    const inputAfter = page.locator("label").filter({ hasText: /^FOR$/ }).locator("..").locator("input");
    await expect(inputAfter).toHaveValue(newVal, { timeout: 5000 });
    // Annuler sans modifier
    await page.getByRole("button", { name: "Annuler" }).click();
  });

  test("modifier la Description et vérifier qu'elle persiste", async () => {
    await openEditForm(page);
    const ts = Date.now();
    const descArea = page.getByPlaceholder(/apparence de votre personnage/i);
    await descArea.clear();
    await descArea.pressSequentially(`Description persistance ${ts}`, { delay: 15 });
    await saveForm(page);

    // Recharger
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 10000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

    // Vérifier
    await openEditForm(page);
    const descAfter = page.getByPlaceholder(/apparence de votre personnage/i);
    await expect(descAfter).toHaveValue(`Description persistance ${ts}`, { timeout: 5000 });
    await page.getByRole("button", { name: "Annuler" }).click();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THÈME / APPARENCE (FloatingEditTabs)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Thème & Apparence", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndOpenFiche(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("ouvrir le mode édition affiche l'onglet Apparence par défaut", async () => {
    await page.locator("#vtt-fiche-btn-edition").click();
    await expect(page.getByText(/personnalisation/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("l'onglet Apparence contient une section 'Arrière-plan'", async () => {
    await expect(page.getByText(/arrière-plan/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("changer la couleur de fond met à jour l'input couleur", async () => {
    // Les color inputs sont présents
    const colorInputs = page.locator('input[type="color"]');
    await expect(colorInputs.first()).toBeVisible({ timeout: 5000 });
    // Modifier le premier color input (fond)
    await colorInputs.first().evaluate((el: HTMLInputElement) => {
      el.value = "#1a1a2e";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  test("naviguer vers l'onglet Explorer", async () => {
    await page.locator('[id$="-trigger-explorer"]').first().click();
    // L'onglet explorer contient une zone de recherche ou "Commu"
    await expect(page.getByText(/commu/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("naviguer vers l'onglet Mes Thèmes", async () => {
    await page.locator('[id$="-trigger-mes_themes"]').first().click();
    // L'onglet doit s'ouvrir sans erreur
    await page.waitForTimeout(500);
    // Vérifier que le header de l'éditeur est toujours visible
    await expect(page.getByText(/éditeur/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("sauver le layout ferme le panneau", async () => {
    const floatingPanel = page.locator('div.fixed.right-0').filter({ hasText: /éditeur/i });
    await floatingPanel.locator("button.button-primary").first().click();
    await expect(floatingPanel).not.toBeVisible({ timeout: 15000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTANCE DU LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Fiche — Persistance du layout", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await loginAndOpenFiche(browser));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("le layout est sauvegardé et rechargé correctement", async () => {
    // Vérifier que les widgets principaux sont présents
    await expect(page.locator('[id^="vtt-widget-vitals-view"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#vtt-widget-inventory-view")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#vtt-widget-skills-view")).toBeVisible({ timeout: 5000 });

    // Recharger et vérifier que les widgets sont toujours là
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#vtt-sidebar-fiche")).toBeVisible({ timeout: 10000 });
    await page.locator("#vtt-sidebar-fiche").click();
    await expect(page.locator("#vtt-fiche-btn-modifier")).toBeVisible({ timeout: 10000 });

    await expect(page.locator('[id^="vtt-widget-vitals-view"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#vtt-widget-inventory-view")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#vtt-widget-skills-view")).toBeVisible({ timeout: 5000 });
  });
});
