/**
 * Marketplace (docs/marketplace.md), côté créateur : profil de créateur, nouveau pack, fiche
 * modifiée et enregistrée, retrouvée dans le studio. Un brouillon reste invisible des autres.
 * (Sans R2 en CI : le contenu d'une version n'est pas envoyé ici, la revue est testée par les
 * tests d'intégration du service.)
 */
import { expect, test } from '@playwright/test';
import { appel, creerCompte } from './support/api';

test('un créateur crée son profil et un pack, qui reste un brouillon privé', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const autrePage = await (await browser.newContext()).newPage();
  const createur = await creerCompte(page, 'Createur');
  const autre = await creerCompte(autrePage, 'Curieux');

  await page.goto('/marketplace/studio');
  await page.getByRole('button', { name: 'Créer mon profil de créateur' }).click();
  await page.getByLabel('Nom public').fill(`Atelier ${createur.id.slice(0, 6)}`);
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await page.getByRole('button', { name: 'Nouveau pack' }).click();
  await expect(page).toHaveURL(/\/marketplace\/studio\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  const titre = `Cryptes ${Date.now().toString(36)}`;
  await page.getByLabel('Titre').fill(titre);
  await page.getByLabel('Résumé').fill('Un donjon salé');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: titre })).toBeVisible();

  const fiche = await appel<{ title: string; summary: string; status: string }>(
    createur,
    'GET',
    `/v1/marketplace/studio/listings/${id}`,
  );
  expect(fiche).toMatchObject({ title: titre, summary: 'Un donjon salé', status: 'draft' });

  await page.goto('/marketplace/studio');
  await expect(page.getByText(titre)).toBeVisible();

  // Un autre membre ne le trouve pas (brouillon)
  const res = await autre.request.get(`/v1/marketplace/listings/${id}`, {
    headers: { authorization: `Bearer ${autre.jeton}` },
  });
  expect(res.status()).toBe(404);

  await appel(createur, 'DELETE', `/v1/marketplace/studio/listings/${id}`);
});
