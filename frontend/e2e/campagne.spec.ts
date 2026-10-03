/**
 * Campagne à deux : le MJ crée sa campagne avec l'assistant, le joueur la rejoint par le lien du
 * code, choisit son héros (amené de hors campagne) et entre à la table ; le MJ y entre aussi.
 */
import { expect, test } from '@playwright/test';
import { creerCompte, creerHeros, nettoyer, type Compte } from './support/api';

test('le MJ crée la campagne, le joueur la rejoint par le code avec son héros', async ({
  browser,
}) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage = await ctxMj.newPage();
  const joueurPage = await ctxJoueur.newPage();
  const mj: Compte = await creerCompte(mjPage, 'MJ');
  const joueur: Compte = await creerCompte(joueurPage, 'Joueur');
  const heros = await creerHeros(joueur);
  let campagneId: string | null = null;

  try {
    // ── Le MJ crée la campagne ──
    await mjPage.goto('/campagnes/nouvelle');
    const titre = `La Crypte ${Date.now().toString(36)}`;
    await mjPage.getByLabel('Titre de la campagne').fill(titre);
    await mjPage.getByRole('button', { name: 'Continuer' }).click();
    await mjPage
      .getByRole('radiogroup', { name: 'Système de jeu' })
      .getByRole('radio', { name: /D&D classique/ })
      .click();
    await mjPage.getByRole('button', { name: 'Continuer' }).click();
    await mjPage.getByRole('button', { name: 'Continuer' }).click();
    await mjPage.getByRole('button', { name: 'Créer la campagne' }).click();
    await expect(mjPage).toHaveURL(/\/campagnes\/[0-9a-f-]{36}/);
    campagneId = /\/campagnes\/([0-9a-f-]{36})/.exec(mjPage.url())![1]!;
    await expect(mjPage.getByRole('heading', { name: titre })).toBeVisible();

    // Le code partagé par le MJ
    const code = (
      await (
        await mjPage.request.get(`/v1/campaigns/${campagneId}`, {
          headers: { authorization: `Bearer ${mj.jeton}` },
        })
      ).json()
    ).code as string;
    await expect(mjPage.getByText(code).first()).toBeVisible();

    // ── Le joueur rejoint par le lien et amène son héros ──
    await joueurPage.goto(`/join/${code}`);
    await expect(joueurPage).toHaveURL(new RegExp(`/campagnes/${campagneId}/personnage`));
    const amener = joueurPage.getByRole('button', { name: /Amener un personnage existant/ });
    if ((await amener.getAttribute('aria-expanded')) === 'false') await amener.click();
    await joueurPage.getByRole('radio', { name: new RegExp(heros.nom) }).check();
    await joueurPage.getByRole('button', { name: 'Entrer à la table' }).first().click();
    await expect(joueurPage).toHaveURL(new RegExp(`/campagnes/${campagneId}/table`));
    await expect(joueurPage.getByText(`Vous incarnez ${heros.nom}`)).toBeVisible();

    // ── Le MJ entre en maître du jeu ──
    await mjPage.goto(`/campagnes/${campagneId}/personnage`);
    // Sans personnage, le MJ est déjà sur « Maître du jeu »
    await mjPage.getByRole('button', { name: 'Entrer en maître du jeu' }).first().click();
    await expect(mjPage).toHaveURL(new RegExp(`/campagnes/${campagneId}/table`));

    // Le joueur fait partie des membres, avec son héros
    const detail = await (
      await mjPage.request.get(`/v1/campaigns/${campagneId}`, {
        headers: { authorization: `Bearer ${mj.jeton}` },
      })
    ).json();
    expect(detail.characters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterId: heros.id, playedBy: joueur.id }),
      ]),
    );
  } finally {
    await nettoyer({ mj, campagnes: campagneId ? [campagneId] : [], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
