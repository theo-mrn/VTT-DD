/**
 * Notes à la table : le joueur écrit une note (enregistrement automatique), privée par défaut ;
 * le MJ ne la voit pas. Le joueur la partage avec la table : le MJ la lit. Le MJ ne voit jamais
 * la note privée d'un joueur (compte + personnage).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  appel,
  creerCampagne,
  creerCompte,
  creerHeros,
  incarner,
  nettoyer,
  rejoindre,
  type Compte,
} from './support/api';

interface Note {
  id: string;
  title: string;
  shared: boolean;
  characterId: string | null;
  owner: { id: string };
}

const notesDe = async (c: Compte, campagneId: string) =>
  (await appel<{ items: Note[] }>(c, 'GET', `/v1/campaigns/${campagneId}/notes`)).items;

test('le joueur écrit une note privée, puis la partage avec la table : le MJ la lit', async ({
  browser,
}) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage: Page = await ctxMj.newPage();
  const joueurPage: Page = await ctxJoueur.newPage();
  const mj = await creerCompte(mjPage, 'MJ');
  const joueur = await creerCompte(joueurPage, 'Joueur');
  const campagne = await creerCampagne(mj);
  const heros = await creerHeros(joueur);

  try {
    await rejoindre(joueur, campagne.code);
    await incarner(joueur, campagne.id, heros.id);

    // ── Le joueur écrit ──
    await joueurPage.goto(`/notes?campagne=${campagne.id}`);
    await joueurPage.getByRole('button', { name: 'Nouvelle note' }).click();
    const titre = `Indices ${Date.now().toString(36)}`;
    await joueurPage.getByLabel('Titre de la note').fill(titre);
    await joueurPage.getByLabel('Contenu de la note').click();
    await joueurPage.keyboard.type('Le marchand ment sur la cargaison.');
    // Enregistrée automatiquement, privée, au compte et au personnage du joueur
    await expect
      .poll(async () => (await notesDe(joueur, campagne.id)).find((n) => n.title === titre))
      .toMatchObject({ shared: false, characterId: heros.id, owner: { id: joueur.id } });
    expect((await notesDe(mj, campagne.id)).map((n) => n.title)).not.toContain(titre);

    // ── Partagée avec la table ──
    await joueurPage
      .getByRole('radiogroup', { name: 'Visibilité' })
      .getByRole('radio', { name: /Table/ })
      .click();
    await expect
      .poll(async () => (await notesDe(mj, campagne.id)).map((n) => n.title))
      .toContain(titre);

    // Le MJ la voit dans son espace Notes
    await mjPage.goto(`/notes?campagne=${campagne.id}`);
    await expect(mjPage.getByLabel('Liste des notes').getByText(titre)).toBeVisible();
  } finally {
    await nettoyer({ mj, campagnes: [campagne.id], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
