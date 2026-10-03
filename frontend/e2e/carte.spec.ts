/**
 * Carte en temps réel, MJ et joueur chacun dans son navigateur : le héros posé par le MJ
 * apparaît chez le joueur ; le MJ le déplace à la souris et le joueur le voit arriver ; une porte
 * ouverte et le brouillard total passent chez le joueur ; un ping du MJ lui parvient.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  appel,
  creerCampagne,
  creerCompte,
  creerHeros,
  creerScene,
  incarner,
  nettoyer,
  poser,
  rejoindre,
  type Compte,
} from './support/api';
import {
  carteChargee,
  centre,
  donnee,
  ecouterPings,
  glisser,
  pingsRecus,
  pinger,
  scene,
} from './support/carte';

interface Token {
  id: string;
  characterId: string;
  pos: { x: number; y: number };
}

test('le MJ déplace le héros, ouvre une porte, couvre la carte et pingue : le joueur suit', async ({
  browser,
}) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage: Page = await ctxMj.newPage();
  const joueurPage: Page = await ctxJoueur.newPage();
  const mj: Compte = await creerCompte(mjPage, 'MJ');
  const joueur: Compte = await creerCompte(joueurPage, 'Joueur');
  const campagne = await creerCampagne(mj);
  const heros = await creerHeros(joueur);

  try {
    // ── Préparation : le joueur incarne son héros, posé sur la carte du groupe ──
    await rejoindre(joueur, campagne.code);
    await incarner(joueur, campagne.id, heros.id);
    const carte = await creerScene(mj, campagne.id, [heros.id]);
    const base = `/v1/campaigns/${campagne.id}/maps/${carte.id}`;
    const token = (await appel<{ items: Token[] }>(mj, 'GET', `${base}/tokens`)).items.find(
      (t) => t.characterId === heros.id,
    )!;
    const [porte] = await poser<{ id: string; version: number }>(
      mj,
      campagne.id,
      carte.id,
      'obstacles',
      [
        {
          kind: 'door',
          points: [
            { x: 800, y: 300 },
            { x: 900, y: 300 },
          ],
        },
      ],
    );

    // ── Chacun ouvre la table ──
    await mjPage.goto(`/campagnes/${campagne.id}/table?scene=${carte.id}`);
    await joueurPage.goto(`/campagnes/${campagne.id}/table`);
    await carteChargee(mjPage);
    await carteChargee(joueurPage);
    await expect.poll(() => donnee(joueurPage, 'tokens', token.id)).not.toBeNull();

    // ── Le MJ glisse le héros, le joueur le voit arriver ──
    const depart = await centre(mjPage, token.id);
    await glisser(mjPage, depart, { x: depart.x + 300, y: depart.y + 150 });
    await expect
      .poll(async () => (await donnee<Token>(mjPage, 'tokens', token.id))?.pos.x)
      .toBeGreaterThan(token.pos.x + 200);
    const arrivee = (await donnee<Token>(mjPage, 'tokens', token.id))!.pos;
    await expect
      .poll(async () => (await donnee<Token>(joueurPage, 'tokens', token.id))?.pos, {
        message: 'le joueur voit le héros à sa nouvelle place',
      })
      .toEqual(arrivee);

    // ── Porte ouverte par le MJ : ouverte chez le joueur ──
    await appel(mj, 'POST', `${base}/obstacles/batch`, {
      update: [{ id: porte!.id, version: porte!.version, isOpen: true }],
    });
    await expect
      .poll(
        async () => (await donnee<{ isOpen: boolean }>(joueurPage, 'obstacles', porte!.id))?.isOpen,
      )
      .toBe(true);

    // ── Brouillard sur toute la carte ──
    const avant = await appel<{ version: number }>(mj, 'GET', base);
    await appel(mj, 'PATCH', base, { fogFull: true, version: avant.version });
    await expect
      .poll(async () => (await scene<{ fogFull: boolean }>(joueurPage))?.fogFull)
      .toBe(true);

    // ── Ping du MJ, centré : il parvient au joueur ──
    await ecouterPings(joueurPage);
    await pinger(mjPage, { x: 1200, y: 900 }, true);
    await expect
      .poll(() => pingsRecus(joueurPage))
      .toEqual([expect.objectContaining({ x: 1200, y: 900, focus: true })]);
  } finally {
    await nettoyer({ mj, campagnes: [campagne.id], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
