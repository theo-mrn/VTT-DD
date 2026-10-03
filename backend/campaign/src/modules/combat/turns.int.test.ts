/**
 * Combat, étape A (docs/combat.md § 4, § 9) sur un vrai PostgreSQL, avec le faux character :
 * mode du système, participants cachés et vue expurgée (REST et événements), précédent et
 * journal des passages (durées rendues), donner le tour, acteur du créneau, réordonner,
 * réglages, ajout et retrait de participants, initiative par camp, individuelle et demandée
 * aux joueurs.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Participant {
  characterId: string;
  side: string;
  sortKeys: number[];
  hasActed: boolean;
  visibleToPlayers?: boolean;
  initiative?: { summary: string; params: Record<string, unknown>; source: string } | null;
  initiativePending?: boolean;
  joinedRound?: number;
  defeated?: boolean;
}
interface Combat {
  id: string;
  round: number;
  mode: string;
  order: Participant[];
  currentIndex: number;
  slots?: { side: string }[];
  initiativeRolled: boolean;
  version: number;
  currentActorId?: string | null;
  turn?: number;
  canGoBack?: boolean;
  settings?: Record<string, boolean>;
  startedAt?: string;
  redacted?: boolean;
  durationUpdates?: { characterId: string; expired: string[] }[];
  durationFailures?: string[];
}

describe.skipIf(!TEST_DATABASE_URL)('combat, tours (étape A)', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (campaignId: string, rest = '') => `/v1/campaigns/${campaignId}/combat${rest}`;
  const events = async (campaignId: string, type?: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    )
      .map(
        (e) => e.envelope as { type: string; visibility: string; payload: Record<string, unknown> },
      )
      .filter((e) => e.type.startsWith('combat.') && (!type || e.type === type));
  const callsTo = (path: string) => t.character.calls.filter((c) => c.path.endsWith(path));

  it('mode du système, réglages par défaut, démarrage avec initiative par camp', async () => {
    const sw = 'star-wars-eote';
    const id = await h.campaign(gm, sw, [alice]);
    const keys = (base: number[]) => (params: Record<string, unknown>) =>
      params.competence === 'vigilance' ? [base[0]! - 1, base[1]!] : base;
    const kesh = await h.engage(id, alice, { systemId: sw, sortKeys: keys([2, 0]) });
    const trooper = await h.engage(id, gm, { systemId: sw, sortKeys: keys([3, 1]) });
    const c = await h.ok<Combat>(gm, 'POST', url(id), {
      participants: [kesh, trooper],
      rollInitiative: true,
      paramsBySide: { enemies: { competence: 'vigilance' } },
      settings: { gmRollsHidden: false },
    });
    // Star Wars déclare `initiative.mode: creneaux` : pas besoin de le dire
    expect(c).toMatchObject({
      mode: 'slots',
      initiativeRolled: true,
      turn: 0,
      canGoBack: false,
      currentActorId: null,
      settings: { playersActOutsideTurn: true, gmRollsHidden: false, physicalDice: true },
      redacted: false,
    });
    expect(c.startedAt).toBeTruthy();
    expect(c.order.map((p) => [p.characterId, p.sortKeys])).toEqual([
      [trooper, [2, 1]],
      [kesh, [2, 0]],
    ]);
    expect(c.order[0]!.initiative).toMatchObject({
      params: { competence: 'vigilance' },
      source: 'server',
    });
    expect(c.slots).toEqual([{ side: 'enemies' }, { side: 'players' }]);
    const rolls = callsTo('/actions/initiative');
    expect(rolls.find((r) => r.path.includes(trooper))!.body.parametres).toEqual({
      competence: 'vigilance',
    });
    expect(rolls.find((r) => r.path.includes(kesh))!.body.parametres).toBeUndefined();

    // D&D : individuel par défaut
    const dnd = await h.campaign(gm, 'dnd-classic');
    const npc = await h.engage(dnd, gm);
    expect(await h.ok<Combat>(gm, 'POST', url(dnd), { participants: [npc] })).toMatchObject({
      mode: 'individual',
    });
  });

  it('participants cachés : vue expurgée en REST, dans le détail et dans les événements', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { sortKeys: [12] });
    const ninja = await h.engage(id, gm, { sortKeys: [19] });
    const orc = await h.engage(id, gm, { sortKeys: [8] });
    await h.play(id, alice, aria);
    expect(
      (
        await h.request(gm, 'POST', url(id), {
          participants: [aria, ninja],
          hidden: [orc],
        })
      ).json(),
    ).toMatchObject({ status: 400, code: 'unknown_participant' });
    await h.ok(gm, 'POST', url(id), { participants: [aria, ninja, orc], hidden: [ninja] });
    const full = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), {});
    expect(full.order.map((p) => p.characterId)).toEqual([ninja, aria, orc]);
    expect(full.currentActorId).toBe(ninja);

    // Le joueur : le ninja n'existe pas, l'initiative de l'orc est vide, tour d'un adversaire
    const view = await h.ok<Combat>(alice, 'GET', url(id));
    expect(view).toMatchObject({ redacted: true, currentIndex: -1, currentActorId: null });
    expect(view.order.map((p) => p.characterId)).toEqual([aria, orc]);
    expect(view.order[0]).toMatchObject({ sortKeys: [12], initiative: { source: 'server' } });
    expect(view.order[1]).toMatchObject({ sortKeys: [], initiative: null });
    expect(view).not.toHaveProperty('canGoBack');
    expect(JSON.stringify(view)).not.toContain(ninja);
    const detail = await h.ok<{ combat: Combat }>(alice, 'GET', `/v1/campaigns/${id}`);
    expect(JSON.stringify(detail.combat)).not.toContain(ninja);
    expect(detail.combat.redacted).toBe(true);

    // Le MJ passe le tour du ninja : l'événement public ne le nomme pas
    await h.ok(gm, 'POST', url(id, '/next'), {});
    const turns = await events(id, 'combat.turn_changed');
    const publicOnes = turns.filter((e) => e.visibility === 'public');
    for (const e of publicOnes) {
      expect(JSON.stringify(e.payload)).not.toContain(ninja);
      expect(e.payload).not.toHaveProperty('order');
    }
    expect(publicOnes.at(-1)!.payload).toMatchObject({
      reason: 'next',
      acted: null,
      currentIndex: 0,
      currentActorId: aria,
    });
    const gmOnes = turns.filter((e) => e.visibility === 'gm_only');
    expect(gmOnes.at(-1)!.payload).toMatchObject({ acted: ninja, currentIndex: 1 });
    // Le démarrage ne liste que les participants visibles
    const [started] = await events(id, 'combat.started');
    expect(started!.payload.participants).toEqual([aria, orc]);

    // Révélation : le ninja apparaît aux joueurs
    await h.ok(gm, 'PATCH', url(id, `/participants/${ninja}`), { visibleToPlayers: true });
    expect((await h.ok<Combat>(alice, 'GET', url(id))).order.map((p) => p.characterId)).toEqual([
      ninja,
      aria,
      orc,
    ]);
  });

  it('précédent : journal des passages, durées rendues, plusieurs retours, MJ seulement', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { sortKeys: [15], durations: { beni: 1, rage: 3 } });
    const npc = await h.engage(id, gm, { sortKeys: [5], durations: { lent: 2 } });
    await h.play(id, alice, aria);
    await h.ok(gm, 'POST', url(id), { participants: [aria, npc] });
    let c = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), {});
    expect(c.canGoBack).toBe(false);
    expect((await h.request(gm, 'POST', url(id, '/previous'), {})).json()).toMatchObject({
      status: 409,
      code: 'nothing_to_undo',
    });

    c = await h.ok<Combat>(alice, 'POST', url(id, '/next'), {});
    expect(c).toMatchObject({ currentIndex: 1, turn: 1 });
    c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {});
    expect(c).toMatchObject({ round: 2, currentIndex: 0, turn: 2, canGoBack: true });
    const character = t.character.characters;
    expect(character.get(aria)!.durations).toEqual({ rage: 2 });
    expect(character.get(npc)!.durations).toEqual({ lent: 1 });

    expect((await h.request(alice, 'POST', url(id, '/previous'), {})).statusCode).toBe(403);
    expect(
      (await h.request(gm, 'POST', url(id, '/previous'), { version: 1 })).json(),
    ).toMatchObject({ status: 409, code: 'version_conflict' });

    // Retour au tour du PNJ, round 1 : les durées reviennent (état expiré compris)
    c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), { version: c.version });
    expect(c).toMatchObject({ round: 1, currentIndex: 1, turn: 1, currentActorId: npc });
    expect(c.order.map((p) => p.hasActed)).toEqual([true, false]);
    expect(c.durationUpdates).toEqual(
      expect.arrayContaining([
        { characterId: aria, expired: ['beni'] },
        { characterId: npc, expired: [] },
      ]),
    );
    expect(character.get(aria)!.durations).toEqual({ beni: 1, rage: 3 });
    expect(character.get(npc)!.durations).toEqual({ lent: 2 });
    const reverts = callsTo('/modifications/revert');
    expect(reverts).toHaveLength(1);
    expect(reverts[0]!.body.applicationId).toMatch(/^tick:/);

    // Un second retour : au tour d'Aria ; puis plus rien
    c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), {});
    expect(c).toMatchObject({ round: 1, currentIndex: 0, turn: 0, canGoBack: false });
    expect(c.durationUpdates).toBeUndefined();
    expect((await h.request(gm, 'POST', url(id, '/previous'), {})).statusCode).toBe(409);

    // Rejouer le même round décompte de nouveau (nouveau passage, nouveau tickId)
    await h.ok(gm, 'POST', url(id, '/next'), {});
    c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {});
    expect(c.round).toBe(2);
    expect(character.get(aria)!.durations).toEqual({ rage: 2 });
    const tickIds = new Set(callsTo('/durees/decompter').map((r) => r.body.tickId));
    expect(tickIds.size).toBe(2);
    const reasons = (await events(id, 'combat.turn_changed')).map((e) => e.payload.reason);
    expect(reasons.filter((r) => r === 'previous')).toHaveLength(2);
  });

  it('précédent : une fiche modifiée depuis est signalée, les autres sont rendues', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { sortKeys: [15], durations: { beni: 2 } });
    const npc = await h.engage(id, gm, { sortKeys: [5], durations: { lent: 2 } });
    await h.ok(gm, 'POST', url(id), { participants: [aria, npc] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});
    await h.ok(gm, 'POST', url(id, '/next'), {});
    await h.ok(gm, 'POST', url(id, '/next'), {});
    // La durée de l'état du PNJ a été changée à la main entre-temps
    t.character.characters.get(npc)!.durations = { lent: 7 };
    const c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), {});
    expect(c.round).toBe(1);
    expect(c.durationUpdates).toEqual([{ characterId: aria, expired: [] }]);
    expect(c.durationFailures).toEqual([npc]);
    expect(t.character.characters.get(aria)!.durations).toEqual({ beni: 2 });
    expect(t.character.characters.get(npc)!.durations).toEqual({ lent: 7 });
  });

  it('donner le tour, réordonner : MJ, le tour suit le participant', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const a1 = await h.engage(id, alice, { sortKeys: [20] });
    const n1 = await h.engage(id, gm, { sortKeys: [10] });
    const n2 = await h.engage(id, gm, { sortKeys: [5] });
    await h.ok(gm, 'POST', url(id), { participants: [a1, n1, n2] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});
    expect((await h.request(alice, 'POST', url(id, '/turn'), { characterId: n2 })).statusCode).toBe(
      403,
    );
    expect((await h.request(gm, 'POST', url(id, '/turn'), { slotIndex: 1 })).json()).toMatchObject({
      status: 400,
      code: 'participant_required',
    });
    let c = await h.ok<Combat>(gm, 'POST', url(id, '/turn'), { characterId: n2 });
    expect(c).toMatchObject({ currentIndex: 2, currentActorId: n2, canGoBack: true });
    expect(c.order.every((p) => !p.hasActed)).toBe(true);

    expect(
      (await h.request(gm, 'PUT', url(id, '/order'), { order: [n2, a1] })).json(),
    ).toMatchObject({ status: 400, code: 'order_mismatch' });
    c = await h.ok<Combat>(gm, 'PUT', url(id, '/order'), { order: [n2, n1, a1] });
    expect(c.order.map((p) => p.characterId)).toEqual([n2, n1, a1]);
    expect(c).toMatchObject({ currentIndex: 0, currentActorId: n2 });
    // Précédent annule le « donner le tour », pas le réordonnancement
    c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), {});
    expect(c.order.map((p) => p.characterId)).toEqual([n2, n1, a1]);
    expect(c.currentActorId).toBe(a1);
    const reasons = (await events(id, 'combat.turn_changed')).map((e) => e.payload.reason);
    expect(reasons).toEqual(expect.arrayContaining(['turn_set', 'reordered', 'previous']));
  });

  it('acteur du créneau : le joueur prend le créneau de son camp, le MJ fait rejouer', async () => {
    const sw = 'star-wars-eote';
    const id = await h.campaign(gm, sw, [alice, bob]);
    const kesh = await h.engage(id, alice, { systemId: sw, sortKeys: [3, 0] });
    const vara = await h.engage(id, bob, { systemId: sw, sortKeys: [2, 0] });
    const trooper = await h.engage(id, gm, { systemId: sw, sortKeys: [1, 0] });
    await h.play(id, alice, kesh);
    await h.play(id, bob, vara);
    await h.ok(gm, 'POST', url(id), { participants: [kesh, vara, trooper] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});
    // Créneau players : Bob prend le créneau pour Vara ; Alice ne peut pas le prendre pour elle
    expect(
      (await h.request(alice, 'POST', url(id, '/slot-actor'), { characterId: vara })).statusCode,
    ).toBe(403);
    let c = await h.ok<Combat>(bob, 'POST', url(id, '/slot-actor'), { characterId: vara });
    expect(c).toMatchObject({ currentActorId: vara, currentIndex: 0, redacted: true });
    // Kesh ne termine pas le créneau de Vara ; Vara, si (sans dire qui)
    expect(
      (await h.request(alice, 'POST', url(id, '/next'), { characterId: kesh })).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    c = await h.ok<Combat>(bob, 'POST', url(id, '/next'), {});
    expect(c).toMatchObject({ currentIndex: 1, currentActorId: null });
    // Créneau players suivant : Vara a déjà agi
    expect(
      (await h.request(bob, 'POST', url(id, '/slot-actor'), { characterId: vara })).json(),
    ).toMatchObject({ status: 409, code: 'already_acted' });
    expect(
      (await h.request(bob, 'POST', url(id, '/slot-actor'), { characterId: vara, force: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await h.request(gm, 'POST', url(id, '/slot-actor'), { characterId: trooper })).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    c = await h.ok<Combat>(gm, 'POST', url(id, '/slot-actor'), { characterId: vara, force: true });
    expect(c.currentActorId).toBe(vara);
    c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), {});
    expect(c.currentActorId).toBeNull();
  });

  it('réglages : MJ, événement public, version', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const npc = await h.engage(id, gm);
    const c0 = await h.ok<Combat>(gm, 'POST', url(id), { participants: [npc] });
    expect(
      (await h.request(alice, 'PATCH', url(id, '/settings'), { physicalDice: false })).statusCode,
    ).toBe(403);
    expect((await h.request(gm, 'PATCH', url(id, '/settings'), {})).statusCode).toBe(400);
    const c = await h.ok<Combat>(gm, 'PATCH', url(id, '/settings'), {
      playersActOutsideTurn: false,
      version: c0.version,
    });
    expect(c.settings).toEqual({
      playersActOutsideTurn: false,
      gmRollsHidden: true,
      physicalDice: true,
    });
    expect(c.version).toBe(c0.version + 1);
    const [e] = await events(id, 'combat.settings_updated');
    expect(e).toMatchObject({
      visibility: 'public',
      payload: { settings: c.settings, version: c.version },
    });
  });

  it('participants : rejoindre à sa place, saisie, hors de combat, retrait', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { sortKeys: [18] });
    const orc = await h.engage(id, gm, { sortKeys: [10] });
    const wolf = await h.engage(id, gm, { sortKeys: [14], side: 'allies' });
    const troll = await h.engage(id, gm, { sortKeys: [3] });
    const stranger = crypto.randomUUID();
    await h.ok(gm, 'POST', url(id), { participants: [aria, orc] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});
    let c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {}); // tour de l'orc
    expect(c.currentActorId).toBe(orc);

    const add = (body: unknown) => h.request(gm, 'POST', url(id, '/participants'), body);
    expect((await add({ participants: [{ characterId: aria }] })).json()).toMatchObject({
      status: 409,
      code: 'already_participant',
    });
    expect((await add({ participants: [{ characterId: stranger }] })).json()).toMatchObject({
      status: 422,
      code: 'character_not_engaged',
    });
    expect(
      (
        await h.request(alice, 'POST', url(id, '/participants'), {
          participants: [{ characterId: wolf }],
        })
      ).statusCode,
    ).toBe(403);
    // Initiative déjà tirée : le loup lance (14) et entre avant l'orc ; le tour reste à l'orc
    c = await h.ok<Combat>(gm, 'POST', url(id, '/participants'), {
      participants: [
        { characterId: wolf },
        { characterId: troll, initiative: { sortKeys: [25] }, visibleToPlayers: false },
      ],
    });
    expect(c.order.map((p) => p.characterId)).toEqual([troll, aria, wolf, orc]);
    expect(c.currentActorId).toBe(orc);
    expect(c.order[0]).toMatchObject({
      joinedRound: 1,
      visibleToPlayers: false,
      initiative: { source: 'manual', summary: '25' },
    });
    const added = (await events(id, 'combat.turn_changed')).filter(
      (e) => e.payload.reason === 'participants_added',
    );
    expect(added.find((e) => e.visibility === 'gm_only')!.payload.added).toEqual([wolf, troll]);
    expect(added.find((e) => e.visibility === 'public')!.payload).not.toHaveProperty('added');

    // Saisie : le troll repasse derrière ; hors de combat
    c = await h.ok<Combat>(gm, 'PATCH', url(id, `/participants/${troll}`), { sortKeys: [1] });
    expect(c.order.map((p) => p.characterId)).toEqual([aria, wolf, orc, troll]);
    expect(c.currentActorId).toBe(orc);
    c = await h.ok<Combat>(gm, 'PATCH', url(id, `/participants/${orc}`), { defeated: true });
    expect(c.order.find((p) => p.characterId === orc)!.defeated).toBe(true);
    expect((await h.request(gm, 'PATCH', url(id, `/participants/${orc}`), {})).statusCode).toBe(
      400,
    );

    // Retrait : le tour passe au suivant, qui n'est pas remis par « Précédent »
    c = await h.ok<Combat>(gm, 'DELETE', url(id, `/participants/${orc}`));
    expect(c.order.map((p) => p.characterId)).toEqual([aria, wolf, troll]);
    expect(c.currentActorId).toBe(troll);
    expect((await h.request(gm, 'DELETE', url(id, `/participants/${orc}`))).json()).toMatchObject({
      status: 404,
      code: 'participant_not_found',
    });
    c = await h.ok<Combat>(gm, 'POST', url(id, '/previous'), {});
    expect(c.order.map((p) => p.characterId)).toEqual([aria, wolf, troll]);
  });

  it('initiative : relance individuelle (mêmes paramètres), sous-ensemble, jet demandé aux joueurs', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    let ariaKeys = [12];
    const aria = await h.engage(id, alice, { sortKeys: () => ariaKeys });
    const brom = await h.engage(id, bob, { sortKeys: [16] });
    const orc = await h.engage(id, gm, { sortKeys: [14] });
    await h.play(id, alice, aria);
    await h.play(id, bob, brom);
    await h.ok(gm, 'POST', url(id), { participants: [aria, brom, orc] });

    // Les joueurs lancent : Aria et Brom attendent, l'orc est tiré par le serveur
    let c = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), {
      askPlayers: true,
      params: { [orc]: { avantage: true } },
    });
    expect(c.order.map((p) => [p.characterId, p.initiativePending])).toEqual([
      [orc, false],
      [aria, true],
      [brom, true],
    ]);
    expect(callsTo('/actions/initiative')).toHaveLength(1);
    // Bob lance pour Brom ; Alice ne lance pas pour lui ; pas deux fois
    expect(
      (await h.request(alice, 'POST', url(id, `/participants/${brom}/initiative`), {})).statusCode,
    ).toBe(403);
    const rolled = await h.ok<{ combat: Combat; pendingStep: unknown }>(
      bob,
      'POST',
      url(id, `/participants/${brom}/initiative`),
      { dice: 'physical' },
    );
    expect(rolled.pendingStep).toBeNull();
    expect(rolled.combat.redacted).toBe(true);
    expect(rolled.combat.order.map((p) => p.characterId)).toEqual([brom, orc, aria]);
    expect(
      (await h.request(bob, 'POST', url(id, `/participants/${brom}/initiative`), {})).statusCode,
    ).toBe(403);

    // Le MJ relance l'orc : mêmes paramètres qu'au premier jet
    await h.ok(gm, 'POST', url(id, `/participants/${orc}/initiative`), {});
    const orcRolls = callsTo('/actions/initiative').filter((r) => r.path.includes(orc));
    expect(orcRolls.map((r) => r.body.parametres)).toEqual([
      { avantage: true },
      { avantage: true },
    ]);

    // Sous-ensemble : seule Aria relance ; le tour ne repart pas de zéro (l'orc a agi, c'est
    // le tour d'Aria, qui le garde à sa nouvelle place)
    await h.ok(gm, 'POST', url(id, '/next'), {});
    ariaKeys = [30];
    c = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), { participants: [aria] });
    expect(c.order.map((p) => p.characterId)).toEqual([aria, brom, orc]);
    expect(c.currentActorId).toBe(aria);
    expect(c.order.find((p) => p.characterId === orc)!.hasActed).toBe(true);
    expect(c.order[0]!.initiativePending).toBe(false);
    expect(
      (
        await h.request(gm, 'POST', url(id, '/initiative'), { participants: [crypto.randomUUID()] })
      ).json(),
    ).toMatchObject({ status: 400, code: 'unknown_participant' });
  });

  it('fin : états à durée retirés sur demande, MJ seulement', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { durations: { beni: 3 } });
    const npc = await h.engage(id, gm, { durations: { lent: 5, rage: 1 } });
    const c = await h.ok<Combat>(gm, 'POST', url(id), { participants: [aria, npc] });
    expect((await h.request(alice, 'POST', url(id, '/end'), {})).statusCode).toBe(403);
    expect(
      (await h.request(gm, 'POST', url(id, '/end'), { clearTimedStates: true })).statusCode,
    ).toBe(204);
    expect(t.character.characters.get(aria)!.durations).toEqual({});
    expect(t.character.characters.get(npc)!.durations).toEqual({});
    const clears = callsTo('/durees/decompter');
    expect(clears).toHaveLength(2);
    for (const r of clears)
      expect(r.body).toMatchObject({ clear: true, tickId: `tick:${c.id}:end`, userId: gm.id });
    // Sans l'option : rien n'est retiré
    const hero = await h.engage(id, alice, { durations: { beni: 3 } });
    await h.ok(gm, 'POST', url(id), { participants: [hero] });
    expect(
      (await h.request(gm, 'POST', url(id, '/end'), { pendingAttacks: 'keep' })).statusCode,
    ).toBe(204);
    expect(t.character.characters.get(hero)!.durations).toEqual({ beni: 3 });
  });
});
