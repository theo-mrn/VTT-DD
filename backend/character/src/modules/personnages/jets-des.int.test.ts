/**
 * Jets d'action transmis au service dice, et fiche lue par dice pour les
 * variables de ses jets (route interne /sheet).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('jets transmis à dice', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: salles.droits });
    o = outils(t);
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  it('chaque action transmet son jet : dés, total, issue, campagne et visibilité', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const gimli = await o.nainGuerrier(alice, 'Gimli');
    const campagne = crypto.randomUUID();
    t.des.imposer(20, 6, 6, 6, 6);
    const res = await o.requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: gimli.id,
      campaignId: campagne,
      visibility: 'gm',
    });
    expect(res.statusCode).toBe(200);
    expect(t.jets).toHaveLength(1);
    const jet = t.jets[0]!;
    expect(jet).toMatchObject({
      campaignId: campagne,
      authorId: alice.id,
      characterId: thorin.id,
      characterName: 'Thorin',
      actionId: 'attaque',
      label: 'Attaque avec une arme',
      systemId: 'dnd-classic',
      visibility: 'gm',
      outcome: { success: true, critical: true, fumble: false },
    });
    expect(jet.dice[0]).toEqual({
      faces: 20,
      values: [{ value: 20, kept: true, exploded: false }],
    });
    expect(typeof jet.total).toBe('number');
    expect(jet.explanations.length).toBeGreaterThan(0);

    // Sans campagne : jet personnel, visibilité par défaut
    await o.requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/initiative`, {});
    expect(t.jets[1]).toMatchObject({ actionId: 'initiative', visibility: 'public' });
    expect(t.jets[1]!.campaignId).toBeUndefined();

    // Action refusée : rien n'est transmis
    await o.requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/inconnue`, {});
    expect(t.jets).toHaveLength(2);
  });

  it('initiative lancée par campaign pour un MJ : dans l’historique de sa campagne', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const campagne = crypto.randomUUID();
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/characters/${thorin.id}/actions/initiative`,
      headers: interne,
      payload: { userId: bob.id, roomId: campagne },
    });
    expect(res.statusCode).toBe(200);
    expect(t.jets[0]).toMatchObject({ authorId: bob.id, campaignId: campagne });
    // Appel du système (sans utilisateur) : pas de jet transmis
    await t.app.inject({
      method: 'POST',
      url: `/internal/characters/${thorin.id}/actions/initiative`,
      headers: interne,
      payload: {},
    });
    expect(t.jets).toHaveLength(1);
  });

  it('fiche pour dice : valeurs et modificateurs, mêmes droits qu’une action', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const sheet = (userId: string, headers: Record<string, string> = interne) =>
      t.app.inject({
        method: 'GET',
        url: `/internal/characters/${thorin.id}/sheet?userId=${userId}`,
        headers,
      });
    expect((await sheet(alice.id, {})).statusCode).toBe(401);
    const res = await sheet(alice.id);
    expect(res.statusCode).toBe(200);
    const corps = res.json() as {
      nom: string;
      ownerId: string;
      systeme: { id: string };
      valeurs: Record<string, { valeur: unknown; modificateur?: number; detail?: unknown }>;
    };
    expect(corps).toMatchObject({
      nom: 'Thorin',
      ownerId: alice.id,
      systeme: { id: 'dnd-classic' },
    });
    expect(typeof corps.valeurs.FOR!.valeur).toBe('number');
    expect(typeof corps.valeurs.FOR!.modificateur).toBe('number');
    expect(corps.valeurs.FOR!.detail).toBeUndefined();

    // Inconnu de bob : 404 ; lecture seule (joueur de la campagne) : 403 ; MJ : 200
    expect((await sheet(bob.id)).statusCode).toBe(404);
    salles.accorder(thorin.id, bob.id, { lecture: true, ecriture: false });
    expect((await sheet(bob.id)).statusCode).toBe(403);
    salles.accorder(thorin.id, bob.id, { lecture: true, ecriture: true });
    expect((await sheet(bob.id)).statusCode).toBe(200);
  });
});
