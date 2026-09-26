/**
 * Routes des personnages sur un vrai PostgreSQL (rôle characters_svc).
 * Chaque test crée ses propres utilisateurs ; leurs personnages et leurs
 * événements sont supprimés à la fin.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;

interface Personnage {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  version: number;
  etat: {
    creation: boolean;
    valeurs: Record<string, unknown>;
    possessions: { entree: string }[];
    journal: unknown[];
  };
  fiche: { valeurs: Record<string, { valeur: unknown; max?: number }>; creation: boolean };
  createdAt: string;
  updatedAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('personnages par HTTP', () => {
  let t: Contexte;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const requete = (
    u: Utilisateur,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  /** Requête qui doit réussir (200/201) et renvoyer un personnage. */
  async function ok(
    u: Utilisateur,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ): Promise<Personnage> {
    const res = await requete(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return res.json() as Personnage;
  }

  const creer = (u: Utilisateur, systemeId: string, nom = 'Héros') =>
    ok(u, 'POST', '/v1/characters', { systemeId, type: 'personnage', nom });

  /** Enchaîne des étapes de création, en reportant la version à chaque fois. */
  async function etapes(u: Utilisateur, p: Personnage, suite: [string, object][]) {
    let courant = p;
    for (const [etape, corps] of suite) {
      courant = await ok(u, 'POST', `/v1/characters/${p.id}/creation/${etape}`, {
        version: courant.version,
        ...corps,
      });
    }
    return courant;
  }

  /** Nain guerrier D&D terminé, avec une épée longue. */
  async function nainGuerrier(u: Utilisateur, nom: string) {
    let p = await creer(u, 'dnd-classic', nom);
    p = await etapes(u, p, [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
      ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
      ['caracteristiques', {}],
      ['de-de-vie', {}],
    ]);
    p = await ok(u, 'POST', `/v1/characters/${p.id}/creation/terminer`, { version: p.version });
    return ok(u, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'epee-longue',
    });
  }

  const evenements = async (id: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'`, envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`)
        .orderBy(outbox.id)
    ).map((e) => ({ type: e.type, envelope: e.envelope as Record<string, unknown> }));

  it('crée, lit, liste, renomme et supprime un personnage', async () => {
    const p = await creer(alice, 'star-wars-eote', 'Kesh');
    expect(p).toMatchObject({
      ownerId: alice.id,
      nom: 'Kesh',
      avatarUrl: null,
      version: 1,
      etat: { creation: true, possessions: [] },
      fiche: { creation: true },
    });
    expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);

    expect(await ok(alice, 'GET', `/v1/characters/${p.id}`)).toMatchObject({
      id: p.id,
      version: 1,
    });
    const liste = (await requete(alice, 'GET', '/v1/characters')).json();
    expect(liste).toEqual([
      {
        id: p.id,
        nom: 'Kesh',
        avatarUrl: null,
        systeme: { id: 'star-wars-eote', version: '1.0.0' },
        type: 'personnage',
        creation: true,
        updatedAt: p.updatedAt,
      },
    ]);

    const renomme = await ok(alice, 'PATCH', `/v1/characters/${p.id}`, {
      version: 1,
      nom: 'Kesh Vatra',
      avatarUrl: 'https://cdn.exemple.fr/kesh.png',
    });
    expect(renomme).toMatchObject({
      nom: 'Kesh Vatra',
      avatarUrl: 'https://cdn.exemple.fr/kesh.png',
      version: 2,
    });

    const suppr = await requete(alice, 'DELETE', `/v1/characters/${p.id}`);
    expect(suppr.statusCode).toBe(204);
    expect((await requete(alice, 'GET', `/v1/characters/${p.id}`)).statusCode).toBe(404);
    expect((await requete(alice, 'GET', '/v1/characters')).json()).toEqual([]);

    const types = (await evenements(p.id)).map((e) => e.type);
    expect(types).toEqual(['character.created', 'character.updated', 'character.deleted']);
    const [cree] = await evenements(p.id);
    expect(cree!.envelope).toMatchObject({
      actor: { userId: alice.id, role: 'user', characterId: p.id },
      aggregate: { type: 'character', id: p.id },
      visibility: 'owner',
    });
  });

  it('refuse un système ou un type inconnu, un corps invalide', async () => {
    const inconnu = await requete(alice, 'POST', '/v1/characters', {
      systemeId: 'inconnu',
      type: 'personnage',
      nom: 'X',
    });
    expect(inconnu.statusCode).toBe(400);
    expect(inconnu.headers['content-type']).toContain('application/problem+json');
    const type = await requete(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'dragon',
      nom: 'X',
    });
    expect(type.statusCode).toBe(422);
    const vide = await requete(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: '  ',
    });
    expect(vide.statusCode).toBe(400);
  });

  it('404 sur le personnage d’un autre utilisateur, quelle que soit la route', async () => {
    const p = await creer(alice, 'dnd-classic');
    const u = `/v1/characters/${p.id}`;
    for (const [method, url, payload] of [
      ['GET', u, undefined],
      ['PATCH', u, { version: 1, nom: 'Volé' }],
      ['DELETE', u, undefined],
      ['PUT', `${u}/valeurs`, { version: 1, valeurs: { nom: 'x' } }],
      ['GET', `${u}/creation`, undefined],
      ['POST', `${u}/creation/race`, { version: 1, entrees: [{ entree: 'nain' }] }],
      ['GET', `${u}/achats`, undefined],
      ['POST', `${u}/repos`, { version: 1 }],
      ['POST', `${u}/actions/test`, {}],
    ] as const) {
      const res = await requete(bob, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await requete(bob, 'GET', '/v1/characters')).json()).toEqual([]);
    expect(await ok(alice, 'GET', u)).toMatchObject({ nom: 'Héros', version: 1 });
  });

  it('409 sur une version périmée, y compris pour deux écritures simultanées', async () => {
    const p = await creer(alice, 'dnd-classic');
    await ok(alice, 'PATCH', `/v1/characters/${p.id}`, { version: 1, nom: 'Premier' });
    const perime = await requete(alice, 'PATCH', `/v1/characters/${p.id}`, {
      version: 1,
      nom: 'Second',
    });
    expect(perime.statusCode).toBe(409);
    expect(perime.headers['content-type']).toContain('application/problem+json');
    expect(perime.json()).toMatchObject({ status: 409, code: 'version_perimee' });

    const [a, b] = await Promise.all(
      ['A', 'B'].map((nom) =>
        requete(alice, 'PATCH', `/v1/characters/${p.id}`, { version: 2, nom }),
      ),
    );
    expect([a!.statusCode, b!.statusCode].sort()).toEqual([200, 409]);
    expect(await ok(alice, 'GET', `/v1/characters/${p.id}`)).toMatchObject({ version: 3 });
  });

  it('création Star Wars complète : espèce, carrière, XP, profil', async () => {
    let p = await creer(alice, 'star-wars-eote', 'Kesh');
    p = await etapes(alice, p, [
      ['espece', { entrees: [{ entree: 'bothan' }] }],
      [
        'carriere',
        {
          entrees: [
            {
              entree: 'chasseur-de-primes',
              choix: {
                'rangs-de-depart': ['athletisme', 'perception', 'distance-lourde', 'vigilance'],
              },
            },
          ],
        },
      ],
      [
        'specialisation',
        {
          entrees: [
            { entree: 'assassin', choix: { 'rangs-de-depart': ['discretion', 'magouilles'] } },
          ],
        },
      ],
      ['experience', { achat: 'caracteristique', objet: 'agilite' }],
    ]);
    expect(p.etat.journal).toHaveLength(1);

    const achats = (await requete(alice, 'GET', `/v1/characters/${p.id}/achats`)).json() as {
      achat: { id: string };
      solde: number;
    }[];
    expect(achats.find((a) => a.achat.id === 'rang-competence')?.solde).toBe(70); // 100 − 30
    p = await ok(alice, 'POST', `/v1/characters/${p.id}/achats`, {
      version: p.version,
      achat: 'rang-competence',
      objet: 'distance-lourde',
    });

    let etat = (await requete(alice, 'GET', `/v1/characters/${p.id}/creation`)).json() as {
      etape: { id: string };
      statut: string;
    }[];
    expect(etat.find((e) => e.etape.id === 'profil')?.statut).toBe('a-faire');
    const refuse = await requete(alice, 'POST', `/v1/characters/${p.id}/creation/terminer`, {
      version: p.version,
    });
    expect(refuse.statusCode).toBe(422);

    p = await etapes(alice, p, [
      [
        'profil',
        {
          valeurs: {
            nom: 'Kesh Vatra',
            categorie: 'pj',
            motivation: 'La prime',
            historique: 'Né sur Bothawui',
            credits: 500,
          },
        },
      ],
    ]);
    etat = (await requete(alice, 'GET', `/v1/characters/${p.id}/creation`)).json();
    expect(etat.every((e) => e.statut === 'faite')).toBe(true);

    p = await ok(alice, 'POST', `/v1/characters/${p.id}/creation/terminer`, { version: p.version });
    expect(p.etat.creation).toBe(false);
    expect(p.fiche.creation).toBe(false);
    expect(p.version).toBe(8);

    // Après la création, une caractéristique ne se saisit plus : elle s'achète
    const base = await requete(alice, 'PUT', `/v1/characters/${p.id}/valeurs`, {
      version: p.version,
      valeurs: { credits: 9000 },
    });
    expect(base.statusCode).toBe(422);
    p = await ok(alice, 'PUT', `/v1/characters/${p.id}/valeurs`, {
      version: p.version,
      valeurs: { motivation: 'La liberté', blessures: 4 },
    });
    expect(p.etat.valeurs).toMatchObject({ motivation: 'La liberté', blessures: 4 });
    p = await ok(alice, 'POST', `/v1/characters/${p.id}/repos`, { version: p.version });
    expect(p.etat.valeurs.blessures).toBe(0);
  });

  it('création D&D : caractéristiques et dé de vie tirés par le serveur', async () => {
    let p = await creer(alice, 'dnd-classic', 'Thorin');
    p = await etapes(alice, p, [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
      ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
      ['caracteristiques', {}],
    ]);
    const cars = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((c) => p.etat.valeurs[c] as number);
    expect(cars.every((v) => v >= 3 && v <= 18)).toBe(true);
    expect(cars.filter((v) => v % 2 === 0)).toHaveLength(3);

    t.des.imposer(8);
    p = await etapes(alice, p, [['de-de-vie', {}]]);
    expect(p.etat.valeurs.jetsDeVie).toBe(8);

    // Le tirage est gardé dans l'événement, pour l'historique
    const tirage = (await evenements(p.id)).find(
      (e) =>
        (e.envelope.payload as { operation?: string }).operation === 'creation.caracteristiques',
    );
    const { attributs, retenu } = tirage!.envelope.payload as {
      attributs: string[];
      retenu: { valeurs: number[]; jets: unknown[] };
    };
    expect(attributs.map((a) => p.etat.valeurs[a])).toEqual(retenu.valeurs);
    expect(retenu.jets).toHaveLength(6);

    p = await ok(alice, 'POST', `/v1/characters/${p.id}/creation/terminer`, { version: p.version });
    expect(p.etat.creation).toBe(false);
    expect(p.etat.valeurs.PV).toBe(p.fiche.valeurs.PV?.max);
  });

  it('achat puis remboursement', async () => {
    let p = await creer(alice, 'star-wars-eote');
    p = await etapes(alice, p, [['espece', { entrees: [{ entree: 'humain' }] }]]);
    const solde = async () =>
      (
        (await requete(alice, 'GET', `/v1/characters/${p.id}/achats`)).json() as {
          achat: { id: string };
          solde: number;
        }[]
      ).find((a) => a.achat.id === 'caracteristique')!.solde;
    const avant = await solde();
    p = await ok(alice, 'POST', `/v1/characters/${p.id}/achats`, {
      version: p.version,
      achat: 'caracteristique',
      objet: 'agilite',
    });
    expect(p.etat.journal).toHaveLength(1);
    expect(await solde()).toBeLessThan(avant);

    const refus = await requete(alice, 'POST', `/v1/characters/${p.id}/achats`, {
      version: p.version,
      achat: 'caracteristique',
      objet: 'inconnue',
    });
    expect(refus.statusCode).toBe(422);

    p = await ok(alice, 'POST', `/v1/characters/${p.id}/achats/rembourser`, {
      version: p.version,
      index: 0,
    });
    expect(p.etat.journal).toEqual([]);
    expect(await solde()).toBe(avant);
  });

  it('possessions : ajout, mise à jour puis retrait', async () => {
    let p = await creer(alice, 'star-wars-eote');
    p = await ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'fusil-blaster',
    });
    p = await ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'fusil-blaster',
      actif: false,
    });
    expect(p.etat.possessions).toEqual([
      { entree: 'fusil-blaster', rang: 0, actif: false, choix: {}, champs: {} },
    ]);
    const perime = await t.app.inject({
      method: 'DELETE',
      url: `/v1/characters/${p.id}/possessions/fusil-blaster?version=1`,
      headers: alice.auth,
    });
    expect(perime.statusCode).toBe(409);
    p = await ok(
      alice,
      'DELETE',
      `/v1/characters/${p.id}/possessions/fusil-blaster?version=${p.version}`,
    );
    expect(p.etat.possessions).toEqual([]);
  });

  it('attaque appliquée à une cible possédée, dans la même transaction', async () => {
    const thorin = await nainGuerrier(alice, 'Thorin');
    const gimli = await nainGuerrier(alice, 'Gimli');
    const pvAvant = gimli.etat.valeurs.PV as number;

    // Sans appliquer : résultat seul, aucun personnage modifié
    t.des.imposer(20, 6, 6, 6, 6);
    const seul = await requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: gimli.id,
    });
    expect(seul.statusCode).toBe(200);
    const corpsSeul = seul.json() as { resultat: { reussi: boolean }; personnage?: unknown };
    expect(corpsSeul.resultat.reussi).toBe(true);
    expect(corpsSeul.personnage).toBeUndefined();
    expect(await ok(alice, 'GET', `/v1/characters/${gimli.id}`)).toMatchObject({
      version: gimli.version,
    });

    // Avec appliquer : critique (20 naturel), PV de la cible retirés
    t.des.imposer(20, 6, 6, 6, 6);
    const res = await requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: gimli.id,
      appliquer: true,
    });
    expect(res.statusCode).toBe(200);
    const corps = res.json() as {
      resultat: { reussi: boolean; modifications: { entite: string; valeur: number }[] };
      personnage: Personnage;
      cible: Personnage;
    };
    const degats = corps.resultat.modifications.find((m) => m.entite === 'cible')!.valeur;
    expect(degats).toBeGreaterThan(0);
    expect(corps.cible.version).toBe(gimli.version + 1);
    expect(corps.cible.etat.valeurs.PV).toBe(pvAvant - degats);
    expect(corps.personnage.version).toBe(thorin.version);

    const types = (await evenements(thorin.id)).map((e) => e.type);
    expect(types.filter((x) => x === 'character.action_resolved')).toHaveLength(2);
    const [resolu] = (await evenements(thorin.id)).filter(
      (e) => e.type === 'character.action_resolved',
    );
    expect(resolu!.envelope.payload).toMatchObject({
      action: 'attaque',
      cibleId: gimli.id,
      applique: false,
      resultat: { reussi: true },
    });
    const cible = await evenements(gimli.id);
    expect(cible.at(-1)!.envelope.payload).toMatchObject({
      operation: 'action.cible',
      version: gimli.version + 1,
    });
  });

  it('refuse une cible d’un autre utilisateur, une action inconnue', async () => {
    const thorin = await nainGuerrier(alice, 'Thorin');
    const autre = await nainGuerrier(bob, 'Autre');
    const res = await requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: autre.id,
      appliquer: true,
    });
    expect(res.statusCode).toBe(404);
    expect(await ok(bob, 'GET', `/v1/characters/${autre.id}`)).toMatchObject({
      version: autre.version,
    });
    const inconnue = await requete(
      alice,
      'POST',
      `/v1/characters/${thorin.id}/actions/inconnue`,
      {},
    );
    expect(inconnue.statusCode).toBe(422);
    expect(inconnue.json()).toMatchObject({ code: 'action_refusee' });
  });

  it('un état invalide n’est jamais enregistré', async () => {
    const p = await creer(alice, 'dnd-classic');
    const res = await requete(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'inconnue',
    });
    expect(res.statusCode).toBe(422);
    const avant = await ok(alice, 'GET', `/v1/characters/${p.id}`);
    expect(avant.version).toBe(1);
    const lignes = await t.db!.execute(
      sql`select etat from characters.characters where id = ${p.id}`,
    );
    expect(lignes.rows[0]).toMatchObject({ etat: { possessions: [] } });
    expect((await evenements(p.id)).map((e) => e.type)).toEqual(['character.created']);
  });
});
