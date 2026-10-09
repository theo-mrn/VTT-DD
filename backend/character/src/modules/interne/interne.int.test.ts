/**
 * Routes internes appelées par campaign : secret exigé, résumé d'un
 * personnage, initiative (clés de tri) et décompte des durées d'un passage de tour.
 */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('routes internes', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;
  let mj: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
    o = outils(t);
    alice = await t.utilisateur();
    mj = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const post = (url: string, payload: object = {}, headers: Record<string, string> = interne) =>
    t.app.inject({ method: 'POST', url, headers, payload });

  it('exige le secret interne, et ignore un jeton utilisateur', async () => {
    const p = await o.nainGuerrier(alice, 'Thorin');
    for (const headers of [
      {},
      { 'x-internal-secret': 'mauvais-secret-mauvais-secret-mauvais' },
      alice.auth,
    ]) {
      const res = await post(`/internal/characters/${p.id}/actions/initiative`, {}, headers);
      expect(res.statusCode).toBe(401);
      const resume = await t.app.inject({
        method: 'GET',
        url: `/internal/characters/${p.id}`,
        headers,
      });
      expect(resume.statusCode).toBe(401);
    }
  });

  it('résumé d’un personnage : propriétaire, système, joueur ou PNJ', async () => {
    const p = await o.nainGuerrier(alice, 'Thorin');
    const res = await t.app.inject({
      method: 'GET',
      url: `/internal/characters/${p.id}`,
      headers: interne,
    });
    expect(res.json()).toEqual({
      id: p.id,
      ownerId: alice.id,
      nom: 'Thorin',
      avatarUrl: null,
      tokenUrl: null,
      systeme: { id: 'dnd-classic', version: expect.any(String) },
      type: 'personnage',
      kind: 'pc',
      creation: false, // nainGuerrier termine la création
      imported: false,
      summary: { tagline: expect.stringContaining('Nain'), highlights: expect.any(Array) },
    });
    const inconnu = await t.app.inject({
      method: 'GET',
      url: `/internal/characters/${crypto.randomUUID()}`,
      headers: interne,
    });
    expect(inconnu.statusCode).toBe(404);

    // PNJ (reclassé par l'import de l'ancienne app)
    await t.db!.update(characters).set({ kind: 'npc' }).where(eq(characters.id, p.id));
    const pnj = await t.app.inject({
      method: 'GET',
      url: `/internal/characters/${p.id}`,
      headers: interne,
    });
    expect(pnj.json()).toMatchObject({ kind: 'npc' });
  });

  it('initiative D&D : une clé, le total du d20 + INIT', async () => {
    const p = await o.nainGuerrier(alice, 'Thorin');
    t.des.imposer(17);
    const res = await post(`/internal/characters/${p.id}/actions/initiative`, {
      appliquer: true,
      userId: mj.id,
      roomId: crypto.randomUUID(),
    });
    expect(res.statusCode).toBe(200);
    const corps = res.json() as { resultat: { jet: { total: number } }; cles: number[] };
    expect(corps.cles).toEqual([corps.resultat.jet.total]);
    expect(corps.cles[0]).toBeGreaterThanOrEqual(17);
  });

  it('initiative Star Wars : succès nets puis avantages nets', async () => {
    const p = await o.chasseurBothan(alice, 'Kesh');
    const res = await post(`/internal/characters/${p.id}/actions/initiative`, {
      parametres: { competence: 'vigilance' },
      appliquer: true,
    });
    expect(res.statusCode, res.body).toBe(200);
    const corps = res.json() as { cles: number[] };
    expect(corps.cles).toHaveLength(2);
    // Paramètre manquant : refus des règles (422), relayé tel quel à campaign
    const refus = await post(`/internal/characters/${p.id}/actions/initiative`, {});
    expect(refus.statusCode).toBe(422);
  });

  it('fin de round : les durées baissent, les états arrivés à 0 sont retirés', async () => {
    const p = await o.nainGuerrier(alice, 'Thorin');
    // États temporaires posés directement (comme le ferait un sort) : 1 et 2 rounds
    await t
      .db!.update(characters)
      .set({
        etat: sql`jsonb_set(${characters.etat}, '{possessions}', ${characters.etat}->'possessions' || ${JSON.stringify(
          [
            { entree: 'aveugle', rang: 0, actif: true, choix: {}, champs: {}, duree: 1 },
            { entree: 'effraye', rang: 0, actif: true, choix: {}, champs: {}, duree: 2 },
          ],
        )}::jsonb)`,
      })
      .where(eq(characters.id, p.id));

    const roomId = crypto.randomUUID();
    const finDeRound = (n: number) =>
      post('/internal/durations/tick', {
        tickId: `tick:${roomId}:${n}:${crypto.randomUUID()}`,
        campaignId: roomId,
        userId: mj.id,
        characterIds: [p.id],
        events: [{ kind: 'round_end', round: n }],
      });
    const r1 = await finDeRound(1);
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json()).toMatchObject({
      replayed: false,
      items: [
        {
          characterId: p.id,
          version: p.version + 1,
          expired: [{ key: 'aveugle', name: 'Aveuglé' }],
        },
      ],
    });
    const apres = (await o.ok(alice, 'GET', `/v1/characters/${p.id}`)).etat.possessions;
    expect(apres.find((x) => x.entree === 'aveugle')).toBeUndefined();
    expect(apres.find((x) => x.entree === 'effraye')?.duree).toBe(1);
    expect(apres.find((x) => x.entree === 'epee-longue')?.duree).toBeUndefined();

    const r2 = await finDeRound(2);
    expect(r2.json()).toMatchObject({ items: [{ expired: [{ key: 'effraye' }] }] });
    // Plus aucune durée : rien n'est enregistré
    const r3 = await finDeRound(3);
    expect(r3.json()).toMatchObject({ replayed: false, items: [] });
    expect((await o.ok(alice, 'GET', `/v1/characters/${p.id}`)).version).toBe(p.version + 2);

    // Événement dans la salle, au nom du MJ
    const [evenement] = await t
      .db!.select({ subject: outbox.subject, envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->'payload'->>'operation' = 'durees.decompte'`,
      )
      .orderBy(outbox.id)
      .limit(1);
    expect(evenement!.subject).toBe(`vtt.${roomId}.character.updated`);
    expect(evenement!.envelope).toMatchObject({
      actor: { userId: mj.id, role: 'gm' },
      payload: { retirees: ['aveugle'], tickId: expect.stringMatching(/^tick:/) },
    });
  });

  it('décompte annoncé au joueur qui incarne ; jet d’initiative caché sur demande', async () => {
    const d = droitsSimules();
    await t.fermer();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: d.droits });
    o = outils(t);
    alice = await t.utilisateur();
    mj = await t.utilisateur();
    const roomId = crypto.randomUUID();
    const p = await o.nainGuerrier(alice, 'Thorin');
    d.accorder(p.id, mj.id, {
      lecture: true,
      ecriture: true,
      incarnateurs: { [roomId]: alice.id },
    });
    const s = await o.ok(alice, 'GET', `/v1/characters/${p.id}`);
    await o.ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: s.version,
      entree: 'aveugle',
      duree: 1,
    });
    const r = await post('/internal/durations/tick', {
      tickId: `tick:${crypto.randomUUID()}:1:x`,
      campaignId: roomId,
      userId: mj.id,
      characterIds: [p.id],
      events: [{ kind: 'round_end', round: 1 }],
    });
    expect(r.json()).toMatchObject({ items: [{ expired: [{ key: 'aveugle' }] }] });
    const [evenement] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->'payload'->>'operation' = 'durees.decompte'`,
      );
    expect(evenement!.envelope).toMatchObject({
      visibility: 'gm_only',
      payload: { visibleToUsers: [alice.id] },
    });

    // Initiative d'un PNJ : le jet transmis à dice est caché (MJ)
    const res = await post(`/internal/characters/${p.id}/actions/initiative`, {
      appliquer: true,
      userId: mj.id,
      roomId,
      visibility: 'gm',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(t.jets.at(-1)).toMatchObject({ actionId: 'initiative', visibility: 'gm' });
  });

  it('sans INTERNAL_API_SECRET, les routes internes n’existent pas', async () => {
    const sans = await appDeTest();
    try {
      const res = await sans.app.inject({
        method: 'POST',
        url: '/internal/durations/tick',
        headers: interne,
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await sans.fermer();
    }
  });
});
