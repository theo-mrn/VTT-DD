/**
 * Fiche de personnage : les PV s'ajustent par la fenêtre de la ressource (dégâts puis soins) et
 * la valeur est enregistrée (relue après rechargement).
 */
import { expect, test, type Locator } from '@playwright/test';
import { creerCompte, creerHeros, nettoyer } from './support/api';

/** « 12 / 14 » affiché par la tuile : valeur courante et maximum. */
async function pv(tuile: Locator) {
  const [, courant, max] = /(\d+)\s*\/\s*(\d+)/.exec(await tuile.innerText()) ?? [];
  return { courant: Number(courant), max: Number(max) };
}

test('dégâts puis soins sur les PV, enregistrés', async ({ page }) => {
  const joueur = await creerCompte(page, 'Fiche');
  const heros = await creerHeros(joueur);
  try {
    await page.goto(`/personnages/${heros.id}`);
    const tuile = page.getByRole('button', { name: 'Modifier Points de vie' });
    await expect(tuile).toHaveText(/\d+\s*\/\s*\d+/);
    const depart = await pv(tuile);
    expect(depart.max).toBeGreaterThan(3);

    // Dégâts : 3
    await tuile.click();
    const fenetre = page.getByRole('dialog');
    await fenetre.getByRole('radio', { name: 'Dégâts' }).click();
    await fenetre.getByLabel('Montant').fill('3');
    await fenetre.getByRole('button', { name: 'Retirer 3' }).click();
    await expect(fenetre).toBeHidden();
    await expect.poll(async () => (await pv(tuile)).courant).toBe(depart.courant - 3);

    await page.reload();
    await expect.poll(async () => (await pv(tuile)).courant).toBe(depart.courant - 3);

    // Soins : 2, par le raccourci
    await tuile.click();
    await fenetre.getByRole('radio', { name: 'Soins' }).click();
    await fenetre.getByRole('button', { name: '+2' }).click();
    await fenetre.getByRole('button', { name: 'Ajouter 2' }).click();
    await expect.poll(async () => (await pv(tuile)).courant).toBe(depart.courant - 1);
  } finally {
    await nettoyer({ heros: [[joueur, heros.id]] });
  }
});
