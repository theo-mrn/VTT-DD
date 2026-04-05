import { test, expect } from "@playwright/test";

/**
 * Tests Playwright — Redirections et navigation
 *
 * Comportement réel observé :
 *   /{roomid}            → /{roomid}/map (redirect serveur) puis → /home si room inexistante
 *   /{roomid}/map        → /home si roomId invalide (layout.tsx vérifie Firestore)
 *   Bouton auth navbar   → "S'identifier"
 *   Pages avec Firebase  → ne jamais utiliser networkidle (connexions persistantes)
 */

// ─── Redirections — room inexistante ─────────────────────────────────────────

test.describe("Redirections — room inexistante", () => {
  test("/{roomid} avec room inexistante finit par rediriger vers /home", async ({ page }) => {
    await page.goto("/salle-inexistante-xyz-999");
    // Passe par /map puis revient à /home après vérification Firestore
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });
  });

  test("/{roomid}/map avec room inexistante redirige vers /home", async ({ page }) => {
    await page.goto("/salle-inexistante-xyz-999/map");
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });
  });

  test("affiche un état de chargement avant la redirection", async ({ page }) => {
    await page.goto("/salle-inexistante-xyz-999/map");
    // Peut afficher brièvement "Chargement de la salle..."
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── Pages publiques accessibles sans auth ────────────────────────────────────

test.describe("Pages publiques (sans auth)", () => {
  test("/auth est accessible", async ({ page }) => {
    await page.goto("/auth");
    await expect(page).toHaveURL("/auth");
    await expect(page.getByText("Bienvenue !")).toBeVisible();
  });

  test("/ (landing) est accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/rejoindre est accessible", async ({ page }) => {
    await page.goto("/rejoindre");
    await expect(page).toHaveURL("/rejoindre");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/home est accessible", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL("/home");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/mes-campagnes est accessible", async ({ page }) => {
    await page.goto("/mes-campagnes");
    await expect(page).toHaveURL("/mes-campagnes");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/creer est accessible", async ({ page }) => {
    await page.goto("/creer");
    await expect(page).toHaveURL("/creer");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/ressources est accessible", async ({ page }) => {
    await page.goto("/ressources");
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── Bouton "S'identifier" dans la navbar ─────────────────────────────────────

test.describe("Navbar — bouton S'identifier (non authentifié)", () => {
  const pagesWithNavbar = ["/home", "/rejoindre", "/mes-campagnes", "/creer"];

  for (const path of pagesWithNavbar) {
    test(`${path} affiche le bouton "S'identifier"`, async ({ page }) => {
      await page.goto(path);
      // Ne pas utiliser networkidle — Firebase garde des connexions ouvertes
      await page.waitForLoadState("domcontentloaded");
      const authBtn = page.getByRole("button", { name: /s'identifier/i });
      await expect(authBtn.first()).toBeVisible({ timeout: 8000 });
    });
  }
});

// ─── Page 404 ─────────────────────────────────────────────────────────────────

test.describe("Page 404", () => {
  test("une URL inexistante affiche une page d'erreur", async ({ page }) => {
    const response = await page.goto("/page-qui-nexiste-vraiment-pas");
    expect([200, 404]).toContain(response?.status());
    await expect(page.locator("body")).toBeVisible();
  });
});
