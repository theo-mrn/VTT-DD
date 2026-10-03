/**
 * Messagerie de la table : un message du joueur à toute la table arrive chez le MJ, en direct.
 */
import { expect, test } from '@playwright/test';
import {
  creerCampagne,
  creerCompte,
  creerHeros,
  incarner,
  nettoyer,
  rejoindre,
} from './support/api';

test('le joueur écrit à la table, le MJ lit le message en direct', async ({ browser }) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage = await ctxMj.newPage();
  const joueurPage = await ctxJoueur.newPage();
  const mj = await creerCompte(mjPage, 'MJ');
  const joueur = await creerCompte(joueurPage, 'Joueur');
  const campagne = await creerCampagne(mj);
  const heros = await creerHeros(joueur);
  try {
    await rejoindre(joueur, campagne.code);
    await incarner(joueur, campagne.id, heros.id);
    await mjPage.goto(`/campagnes/${campagne.id}/table?panneau=chat`);
    await joueurPage.goto(`/campagnes/${campagne.id}/table?panneau=chat`);

    const message = `On fouille la crypte ? ${Date.now().toString(36)}`;
    const champ = joueurPage.getByLabel('Message à toute la table');
    await champ.fill(message);
    await champ.press('Enter');

    await expect(joueurPage.getByLabel('Messages de la table').getByText(message)).toBeVisible();
    await expect(mjPage.getByLabel('Messages de la table').getByText(message)).toBeVisible();
  } finally {
    await nettoyer({ mj, campagnes: [campagne.id], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
