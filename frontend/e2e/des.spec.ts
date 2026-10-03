/**
 * Table de dés : un jet tiré par le serveur (3D coupée) et un jet aux dés 3D (faces lues à
 * l'arrêt), chacun dans l'historique avec son total et enregistré par le service.
 */
import { expect, test } from '@playwright/test';
import { appel, creerCompte, type Compte } from './support/api';

interface Jet {
  id: string;
  notation: string;
  total: number;
  source: string;
}

const derniersJets = async (c: Compte) => appel<Jet[]>(c, 'GET', '/v1/dice/rolls?limit=5');

for (const animation3d of [false, true]) {
  test(`jet ${animation3d ? 'aux dés 3D' : 'tiré par le serveur'} : historique et service`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const joueur = await creerCompte(page, 'Lanceur');
    await appel(joueur, 'PATCH', '/v1/dice/me/preferences', { animation3d, sound: false });

    await page.goto('/des');
    await page.getByPlaceholder('Écrire une formule… 1d20+5').fill('2d6+3');
    await page.getByRole('button', { name: 'Lancer', exact: true }).click();

    // Le jet arrive dans l'historique (3D : après l'arrêt des dés)
    const ligne = page.getByRole('article', {
      name: new RegExp(`^${joueur.nom}, 2d6\\+3 : \\d+$`),
    });
    await expect(ligne).toBeVisible({ timeout: animation3d ? 45_000 : 10_000 });
    const [jet] = await derniersJets(joueur);
    expect(jet).toMatchObject({ notation: '2d6+3' });
    expect(jet!.total).toBeGreaterThanOrEqual(5);
    expect(jet!.total).toBeLessThanOrEqual(15);
    expect(jet!.source).toBe(animation3d ? '3d' : 'free');
    await expect(ligne).toHaveAttribute('aria-label', new RegExp(`: ${jet!.total}$`));
  });
}
