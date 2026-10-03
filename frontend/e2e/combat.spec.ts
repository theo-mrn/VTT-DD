/**
 * Combat : le MJ lance la rencontre depuis la barre (le héros posé sur la scène est coché
 * d'office), le joueur la voit, puis le MJ la termine.
 */
import { expect, test } from '@playwright/test';
import {
  appel,
  creerCampagne,
  creerCompte,
  creerHeros,
  creerScene,
  incarner,
  nettoyer,
  rejoindre,
} from './support/api';
import { carteChargee, elements } from './support/carte';

interface Combat {
  round: number;
  order: { characterId: string }[];
}

test('le MJ démarre le combat sans initiative puis le termine', async ({ browser }) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage = await ctxMj.newPage();
  const joueurPage = await ctxJoueur.newPage();
  const mj = await creerCompte(mjPage, 'MJ');
  const joueur = await creerCompte(joueurPage, 'Joueur');
  const campagne = await creerCampagne(mj);
  const heros = await creerHeros(joueur);
  const combat = `/v1/campaigns/${campagne.id}/combat`;
  try {
    await rejoindre(joueur, campagne.code);
    await incarner(joueur, campagne.id, heros.id);
    const scene = await creerScene(mj, campagne.id, [heros.id]);

    await mjPage.goto(`/campagnes/${campagne.id}/table?scene=${scene.id}`);
    await carteChargee(mjPage);
    await expect
      .poll(async () =>
        (await elements<{ characterId: string }>(mjPage, 'tokens')).map((t) => t.characterId),
      )
      .toContain(heros.id);
    await mjPage
      .getByRole('region', { name: 'Combat', exact: true })
      .getByRole('button', { name: 'Combat', exact: true })
      .click();
    // Posé sur la scène : coché d'office
    await expect(
      mjPage.getByRole('checkbox', { name: `${heros.nom} participe au combat` }),
    ).toBeChecked();
    await mjPage.getByRole('button', { name: 'Démarrer sans initiative' }).click();
    await expect(mjPage.getByRole('region', { name: 'Combat, round 1' })).toBeVisible();

    // Le joueur voit la rencontre, son héros dans l'ordre du tour
    await expect
      .poll(async () =>
        (await appel<Combat>(joueur, 'GET', combat)).order.map((p) => p.characterId),
      )
      .toContain(heros.id);

    await mjPage.getByRole('button', { name: 'Plus d’actions du combat' }).click();
    await mjPage.getByRole('menuitem', { name: 'Terminer le combat…' }).click();
    await mjPage.getByRole('dialog').getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect(mjPage.getByRole('region', { name: 'Combat, round 1' })).toBeHidden();
    await expect
      .poll(async () =>
        (
          await mj.request.get(combat, { headers: { authorization: `Bearer ${mj.jeton}` } })
        ).status(),
      )
      .toBe(404);
  } finally {
    await nettoyer({ mj, campagnes: [campagne.id], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
