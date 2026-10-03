/**
 * Compte : changer son nom d'aventurier ; devenir amis (recherche, demande, acceptation).
 */
import { expect, test } from '@playwright/test';
import { appel, creerCompte } from './support/api';

test('changer son nom d’aventurier', async ({ page }) => {
  const moi = await creerCompte(page, 'Renomme');
  await page.goto('/profil');
  const nom = `Elrond ${Date.now().toString(36)}`;
  await page.getByLabel('Nom', { exact: true }).fill(nom);
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Nom', { exact: true }) })
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect
    .poll(async () => (await appel<{ name: string }>(moi, 'GET', '/v1/users/me')).name)
    .toBe(nom);
  await page.reload();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(nom);
});

test('devenir amis : recherche, demande, acceptation', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  try {
    const alice = await creerCompte(pageA, 'Alice');
    const bob = await creerCompte(pageB, 'Bob');

    // Alice cherche Bob et lui envoie une demande
    await pageA.goto('/amis');
    await pageA.getByLabel('Rechercher un joueur').fill(bob.nom);
    const ligne = pageA.getByRole('listitem').filter({ hasText: bob.nom });
    await ligne.getByRole('button', { name: 'Ajouter' }).click();
    await expect(ligne.getByText('Demande envoyée')).toBeVisible();

    // Bob l'accepte
    await pageB.goto('/amis');
    await expect(pageB.getByText('Demandes reçues (1)')).toBeVisible();
    await pageB.getByRole('button', { name: 'Accepter' }).click();
    await expect
      .poll(async () =>
        (await appel<{ id: string }[]>(alice, 'GET', '/v1/friends')).map((a) => a.id),
      )
      .toContain(bob.id);
    expect((await appel<{ id: string }[]>(bob, 'GET', '/v1/friends')).map((a) => a.id)).toContain(
      alice.id,
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
