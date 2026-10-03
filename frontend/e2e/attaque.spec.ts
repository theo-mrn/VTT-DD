/**
 * Attaque complète : le joueur vise d'un clic un PNJ posé près de son héros, attaque au Contact
 * (dés tirés par le serveur), choisit « Mains nues » si l'attaque touche ; le rapport arrive
 * chez le MJ, qui l'applique (touché) ou le classe (raté).
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
  rejoindre,
} from './support/api';
import { aLEcran, carteChargee, centre, elements } from './support/carte';

interface Attaque {
  id: string;
  status: string;
  attacker: { characterId: string } | string;
  targets: { characterId: string; decision: string }[];
}

/** Le token est chargé par le moteur de ce navigateur. */
async function tokenCharge(page: Page, id: string) {
  await expect
    .poll(async () => (await elements<{ id: string }>(page, 'tokens')).map((t) => t.id), {
      timeout: 20_000,
    })
    .toContain(id);
}

test('le joueur attaque un PNJ, le MJ décide du rapport', async ({ browser }) => {
  const ctxMj = await browser.newContext();
  const ctxJoueur = await browser.newContext();
  const mjPage = await ctxMj.newPage();
  const joueurPage = await ctxJoueur.newPage();
  const mj = await creerCompte(mjPage, 'MJ');
  const joueur = await creerCompte(joueurPage, 'Joueur');
  const campagne = await creerCampagne(mj);
  const heros = await creerHeros(joueur);
  const attaques = `/v1/campaigns/${campagne.id}/attacks`;
  try {
    await rejoindre(joueur, campagne.code);
    await incarner(joueur, campagne.id, heros.id);
    const scene = await creerScene(mj, campagne.id, [heros.id]);
    const pnj = await appel<{
      items: { id: string }[];
      characters: { id: string; name: string }[];
    }>(mj, 'POST', `/v1/campaigns/${campagne.id}/maps/${scene.id}/npcs`, {
      source: { bestiary: { systemeId: 'dnd-classic', key: 'acolyte' } },
      pos: { x: 520, y: 400 },
    });
    const token = pnj.items[0]!;
    const cible = pnj.characters[0]!;
    // Dés tirés par le serveur : pas d'animation à attendre
    await appel(joueur, 'PATCH', '/v1/dice/me/preferences', { animation3d: false, sound: false });

    await mjPage.goto(`/campagnes/${campagne.id}/table?scene=${scene.id}`);
    await joueurPage.goto(`/campagnes/${campagne.id}/table`);
    await carteChargee(joueurPage);
    await tokenCharge(joueurPage, token.id);

    // ── Visée rapide : un clic sur le PNJ, puis « Attaquer » ──
    const p = await aLEcran(joueurPage, await centre(joueurPage, token.id));
    await joueurPage.mouse.click(p.x, p.y);
    await joueurPage
      .getByRole('toolbar', { name: 'Visée sur la carte' })
      .getByRole('button', { name: 'Attaquer', exact: true })
      .click();

    const menu = joueurPage.getByRole('dialog');
    const onglet = menu.getByRole('tab', { name: /Attaque avec une arme/ });
    if (await onglet.isVisible()) await onglet.click();
    // La carte du type d'attaque (« d20 Contact 1d20 + 3 »), pas la description de l'action
    await menu.getByRole('button', { name: /Contact 1d20/ }).click();

    // Touché : l'arme vient ensuite ; raté : le rapport part directement
    const mainsNues = menu.getByRole('button', { name: /Mains nues/ });
    const envoye = menu.getByText('Rapport envoyé au MJ');
    await expect(mainsNues.or(envoye)).toBeVisible({ timeout: 20_000 });
    if (await mainsNues.isVisible()) await mainsNues.click();
    await expect(envoye).toBeVisible({ timeout: 20_000 });

    const declaree = async () =>
      (await appel<{ attacks: Attaque[] }>(mj, 'GET', attaques)).attacks.find((a) =>
        a.targets.some((t) => t.characterId === cible.id),
      );
    await expect.poll(async () => (await declaree())?.status).toBe('pending');

    // ── Le MJ décide : appliquer (touché) ou classer (raté) ──
    const rapport = mjPage.getByRole('article', { name: new RegExp(`contre ${cible.name}`) });
    await rapport.getByRole('button', { name: /^(Appliquer|Classer)$/ }).click();
    await expect.poll(async () => (await declaree())?.status).toMatch(/^(applied|dismissed)$/);
  } finally {
    await nettoyer({ mj, campagnes: [campagne.id], heros: [[joueur, heros.id]] });
    await ctxMj.close();
    await ctxJoueur.close();
  }
});
