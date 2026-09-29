/**
 * Instances de PNJ de la carte et butin (routes internes appelées par campaign) : modèle,
 * bestiaire, création rapide, copie, numérotation par campagne, suppression, objet reçu.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, npcTemplates, outbox } from '../../db/schema.js';
import { catalogueReference } from '../../regles/catalogue.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

interface Created {
  id: string;
  nom: string;
  avatarUrl: string | null;
  tokenUrl: string | null;
  templateId: string | null;
}

describe.skipIf(!TEST_DATABASE_URL)('instances de PNJ et butin', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let campagne: string;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: salles.droits });
    o = outils(t);
    [mj, alice] = await Promise.all([t.utilisateur(), t.utilisateur()]);
    campagne = crypto.randomUUID();
    salles.nommer(campagne, mj.id, 'gm');
  });

  afterEach(async () => {
    await t.db!.delete(npcTemplates).where(eq(npcTemplates.campaignId, campagne));
    await t.db!.delete(outbox).where(sql`${outbox.envelope}->>'roomId' = ${campagne}`);
    await t.fermer();
  });

  const post = (url: string, payload: object) =>
    t.app.inject({ method: 'POST', url, headers: interne, payload });
  const npcs = async (source: object, count = 1) => {
    const res = await post('/internal/npcs', {
      ownerId: mj.id,
      campaignId: campagne,
      systemId: 'dnd-classic',
      count,
      source,
    });
    if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
    return (res.json() as { items: Created[] }).items;
  };
  const row = async (id: string) =>
    (await t.db!.select().from(characters).where(eq(characters.id, id)))[0]!;

  it('création rapide, numérotation par campagne et copie d’une instance', async () => {
    const gobelins = await npcs(
      { quick: { name: 'Gobelin', type: 'personnage', valeurs: { FOR: 8 } } },
      3,
    );
    expect(gobelins.map((g) => g.nom)).toEqual(['Gobelin', 'Gobelin 2', 'Gobelin 3']);
    const g2 = await row(gobelins[1]!.id);
    expect(g2).toMatchObject({ ownerId: mj.id, kind: 'npc', campaignId: campagne });
    expect(g2.etat.creation).toBe(false);
    expect(g2.etat.valeurs.FOR).toBe(8);

    // Copie de l'état actuel : même fiche, numéro suivant
    const [copie] = await npcs({ characterId: gobelins[1]!.id });
    expect(copie!.nom).toBe('Gobelin 4');
    expect((await row(copie!.id)).etat.valeurs.FOR).toBe(8);
    // Une autre campagne numérote de son côté
    const ailleurs = await post('/internal/npcs', {
      ownerId: mj.id,
      campaignId: crypto.randomUUID(),
      systemId: 'dnd-classic',
      count: 1,
      source: { quick: { name: 'Gobelin', type: 'personnage' } },
    });
    expect((ailleurs.json() as { items: Created[] }).items[0]!.nom).toBe('Gobelin');

    // Événements dans la campagne, pour le MJ seul
    const created = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${gobelins[0]!.id}`);
    expect(created[0]!.envelope).toMatchObject({
      type: 'character.created',
      roomId: campagne,
      visibility: 'gm_only',
    });

    // Suppression : seulement des PNJ de la campagne (ou du MJ), jamais un personnage joueur
    const heros = await o.nainGuerrier(alice, 'Thorin');
    const res = await post('/internal/npcs/delete', {
      ids: [gobelins[0]!.id, heros.id],
      userId: mj.id,
      roomId: campagne,
    });
    expect(res.json()).toEqual({ deleted: [gobelins[0]!.id] });
    expect((await row(gobelins[0]!.id)).deletedAt).not.toBeNull();
    expect((await row(heros.id)).deletedAt).toBeNull();
    // Le nom libéré n'est pas repris : la suite continue
    expect((await npcs({ quick: { name: 'Gobelin', type: 'personnage' } }))[0]!.nom).toBe(
      'Gobelin 5',
    );
  });

  it('depuis un modèle de la campagne ou le bestiaire du système', async () => {
    const modele = await o.requete(mj, 'POST', `/v1/campaigns/${campagne}/npc-templates`, {
      name: 'Orque',
      systemeId: 'dnd-classic',
      type: 'personnage',
      imageUrl: 'https://assets.test/orque.png',
      tokenUrl: 'https://assets.test/orque-jeton.png',
    });
    const template = modele.json() as { id: string };
    const [orque] = await npcs({ templateId: template.id }, 1);
    expect(orque).toMatchObject({
      nom: 'Orque',
      templateId: template.id,
      avatarUrl: 'https://assets.test/orque.png',
      tokenUrl: 'https://assets.test/orque-jeton.png',
    });
    expect((await row(orque!.id)).templateId).toBe(template.id);
    // Modèle d'une autre campagne, système différent : refusés
    const autre = await post('/internal/npcs', {
      ownerId: mj.id,
      campaignId: crypto.randomUUID(),
      systemId: 'dnd-classic',
      count: 1,
      source: { templateId: template.id },
    });
    expect(autre.statusCode).toBe(404);
    const mauvais = await post('/internal/npcs', {
      ownerId: mj.id,
      campaignId: campagne,
      systemId: 'star-wars-eote',
      count: 1,
      source: { templateId: template.id },
    });
    expect(mauvais.json()).toMatchObject({ code: 'system_mismatch' });

    // Bestiaire : les valeurs imprimées se retrouvent sur la fiche calculée
    const creature = catalogueReference().bestiaire!('dnd-classic')!.creatures[0]!;
    const [bete] = await npcs({ bestiary: { systemeId: 'dnd-classic', key: creature.id } }, 1);
    expect(bete!.nom).toBe(creature.nom);
    const fiche = await t.app.inject({
      method: 'GET',
      url: `/internal/characters/${bete!.id}/sheet?userId=${mj.id}`,
      headers: interne,
    });
    // Le MJ (propriétaire, jamais engagé ici) lit la fiche calculée
    const valeurs = (fiche.json() as { valeurs: Record<string, { valeur: unknown }> }).valeurs;
    for (const [cle, v] of Object.entries(creature.valeurs))
      if (typeof v === 'number') expect(valeurs[cle]?.valeur, cle).toBe(v);
    const inconnue = await post('/internal/npcs', {
      ownerId: mj.id,
      campaignId: campagne,
      systemId: 'dnd-classic',
      count: 1,
      source: { bestiary: { systemeId: 'dnd-classic', key: 'licorne-de-cristal' } },
    });
    expect(inconnue.statusCode).toBe(404);
  });

  it('butin : objet du catalogue ou objet libre, ajouté à l’inventaire', async () => {
    const heros = await o.nainGuerrier(alice, 'Thorin');
    const recevoir = (item: object) =>
      post(`/internal/characters/${heros.id}/possessions/receive`, {
        item,
        userId: alice.id,
        roomId: campagne,
        playerId: alice.id,
      });
    const epee = await recevoir({ ref: 'epee-longue', name: 'Épée longue', quantity: 1 });
    expect(epee.json()).toMatchObject({ entree: 'epee-longue' });
    // Une épée de plus : unités ajoutées ou nouvel exemplaire, selon la sorte
    const epees = (await row(heros.id)).etat.possessions.filter((p) => p.entree === 'epee-longue');
    expect(epees.reduce((n, p) => n + (p.quantite ?? 1), 0)).toBe(2);
    const cle = await recevoir({
      name: 'Clé rouillée',
      description: 'Ouvre la crypte',
      quantity: 2,
    });
    expect(cle.statusCode).toBe(200);
    const libre = (cle.json() as { entree: string }).entree;
    const apres = await row(heros.id);
    const possession = apres.etat.possessions.find((p) => p.entree === libre)!;
    expect(Object.values(possession.champs)).toContain('Clé rouillée');
    expect(possession.quantite).toBe(2);
    const inconnu = await recevoir({ ref: 'epee-de-verre', name: 'X', quantity: 1 });
    expect(inconnu.json()).toMatchObject({ code: 'entree_inconnue' });
    // Événement : le MJ et le joueur qui l'incarne
    const events = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(inArray(sql`${outbox.envelope}->'payload'->>'operation'`, ['possession.butin']));
    expect(events.at(-1)!.envelope).toMatchObject({
      roomId: campagne,
      visibility: 'gm_only',
      payload: { visibleToUsers: [alice.id] },
    });
  });
});
