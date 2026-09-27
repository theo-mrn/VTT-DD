/**
 * Jets et historique sur un vrai PostgreSQL (rôle dice_svc), avec de faux
 * campaign et character (serveur HTTP local).
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type RollBody,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('jets', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    bob = await t.user('Bob');
    campaignId = t.services.campaign({ [gm.id]: 'gm', [alice.id]: 'player', [bob.id]: 'player' });
  });

  afterEach(async () => {
    await t.close();
  });

  const history = (u: TestUser, query = `campaignId=${campaignId}`) =>
    h.ok<RollBody[]>(u, 'GET', `/v1/dice/rolls?${query}`);

  it('lance une notation : champs de l’ancienne app, réponse de l’ancienne API, événement', async () => {
    t.dice.force(17);
    const r = await h.roll(alice, { notation: '1d20+3', campaignId });
    expect(r).toMatchObject({
      campaignId,
      uid: alice.id,
      userName: 'Alice',
      persoId: null,
      isPrivate: false,
      isBlind: false,
      diceCount: 1,
      diceFaces: 20,
      modifier: 0,
      results: [17],
      total: 20,
      notation: '1d20+3',
      output: '1d20+3 = [17]+3 = 20',
      symbolResult: null,
      // Tiré par le serveur, sans animation qui fasse foi (ancienne app : « Dice Roller/API »)
      type: 'Dice Roller/API',
      source: 'free',
      visibility: 'public',
      hidden: false,
      rolls: [{ type: 'd20', value: 17 }],
      saved: true,
      user: 'Alice',
    });
    expect(typeof r.timestamp).toBe('number');

    const [event] = await t
      .db!.select()
      .from(outbox)
      .where(eq(sql`${outbox.envelope}->'aggregate'->>'id'`, r.id));
    expect(event!.subject).toBe(`vtt.${campaignId}.dice.rolled`);
    expect(event!.envelope).toMatchObject({
      type: 'dice.rolled',
      visibility: 'public',
      actor: { userId: alice.id, role: 'player' },
      payload: { id: r.id, total: 20, results: [17], output: '1d20+3 = [17]+3 = 20' },
    });
  });

  it('le MJ sans personnage apparaît comme « MJ » ; ancien nom roomId accepté', async () => {
    const r = await h.roll(gm, { notation: '2d6', roomId: campaignId });
    expect(r.userName).toBe('MJ');
    expect(r.campaignId).toBe(campaignId);
  });

  it('erreurs : notation requise, trop longue, invalide', async () => {
    const cases: [Record<string, unknown>, number, string][] = [
      [{ campaignId }, 400, 'notation_required'],
      [{ notation: '  ', campaignId }, 400, 'notation_required'],
      [{ notation: '1d20+'.repeat(101), campaignId }, 400, 'notation_too_long'],
      [{ notation: '1d20+FOO', campaignId }, 400, 'invalid_notation'],
      [{ notation: '1d20', pool: [{ de: 'aptitude', nombre: 1 }] }, 400, 'notation_and_pool'],
      [{ pool: [{ de: 'aptitude', nombre: 1 }] }, 400, 'system_required'],
      [{ notation: '1d20', systemId: 'inconnu' }, 422, 'unknown_system'],
    ];
    for (const [body, status, code] of cases) {
      const res = await h.request(alice, 'POST', '/v1/dice/rolls', body);
      expect(res.statusCode, JSON.stringify(body)).toBe(status);
      expect(res.json().code, JSON.stringify(body)).toBe(code);
    }
    // Sans jeton : 401
    const anon = await t.app.inject({
      method: 'POST',
      url: '/v1/dice/rolls',
      payload: { notation: '1d20' },
    });
    expect(anon.statusCode).toBe(401);
  });

  it('non-membre : 404 ; spectateur : 403 ; campaign en panne : 503', async () => {
    const eve = await t.user('Ève');
    let res = await h.request(eve, 'POST', '/v1/dice/rolls', { notation: '1d20', campaignId });
    expect([res.statusCode, res.json().code]).toEqual([404, 'campaign_not_found']);
    res = await h.request(eve, 'GET', `/v1/dice/rolls?campaignId=${campaignId}`);
    expect(res.statusCode).toBe(404);

    t.services.setRole(campaignId, eve.id, 'spectator');
    res = await h.request(eve, 'POST', '/v1/dice/rolls', { notation: '1d20', campaignId });
    expect([res.statusCode, res.json().code]).toEqual([403, 'spectator_cannot_roll']);
    expect((await history(eve)).length).toBe(0);

    t.services.setDown(true);
    res = await h.request(alice, 'POST', '/v1/dice/rolls', { notation: '1d20', campaignId });
    expect([res.statusCode, res.json().code]).toEqual([503, 'campaign_unavailable']);
  });

  it('personnage : variables en nom nu et @, nom et avatar du personnage', async () => {
    const hero = t.services.character({
      ownerId: alice.id,
      name: 'Aria',
      avatarUrl: 'https://cdn.test/aria.png',
      values: { FOR: { valeur: 16, modificateur: 3 }, NIV: { valeur: 4 } },
    });
    t.dice.force(10, 10);
    const r = await h.roll(alice, {
      notation: '1d20+FOR+NIV + @FOR',
      campaignId,
      persoId: hero,
    });
    // Notation saisie conservée ; détail après substitution (@FOR : valeur, FOR : modificateur)
    expect(r).toMatchObject({
      total: 33,
      notation: '1d20+FOR+NIV + @FOR',
      output: '1d20+3+4 + @FOR = [10]+3+4 + @FOR = 33',
      userName: 'Aria',
      userAvatar: 'https://cdn.test/aria.png',
      persoId: hero,
    });

    // Personnage d'un autre : 404 (inconnu) ou 403 (lisible sans droit d'agir)
    const other = t.services.character({ ownerId: bob.id, readers: [alice.id] });
    let res = await h.request(alice, 'POST', '/v1/dice/rolls', {
      notation: '1d20',
      characterId: other,
    });
    expect([res.statusCode, res.json().code]).toEqual([403, 'character_forbidden']);
    res = await h.request(bob, 'POST', '/v1/dice/rolls', { notation: '1d20', characterId: hero });
    expect([res.statusCode, res.json().code]).toEqual([404, 'character_not_found']);

    // Variables explicites (ancienne API) : sans personnage
    t.dice.force(5);
    expect((await h.roll(bob, { notation: '1d20+CON', variables: { CON: 2 } })).total).toBe(7);
  });

  it('sans personnage indiqué : celui que l’appelant incarne, comme l’ancienne app', async () => {
    const hero = t.services.character({
      ownerId: alice.id,
      name: 'Aria',
      values: { DEX: { valeur: 14, modificateur: 2 } },
    });
    t.services.play(campaignId, alice.id, hero);
    t.dice.force(8);
    const r = await h.roll(alice, { notation: '1d20+DEX', campaignId });
    expect(r).toMatchObject({ total: 10, persoId: hero, userName: 'Aria' });
    // Notation sans nom : campaign n'est pas interrogé pour le personnage
    const calls = t.services.calls.length;
    const plain = await h.roll(alice, { notation: '1d20', campaignId });
    expect(plain.persoId).toBeNull();
    expect(t.services.calls.slice(calls).some((c) => c.startsWith('GET /v1/campaigns'))).toBe(
      false,
    );
  });

  it('dés à symboles : notation N<dé> avec le système de la campagne, ou pool', async () => {
    t.services.setSystem(campaignId, 'star-wars-eote');
    t.dice.force(4, 2, 2);
    const r = await h.roll(alice, { notation: '2aptitude 1difficulte', campaignId });
    expect(r).toMatchObject({
      systemId: 'star-wars-eote',
      symbolResult: '2 Succès',
      output: 'Aptitude [4, 2], Difficulté [2] = 2 Succès',
      results: [4, 2, 2],
      total: 0,
      rolls: [
        { type: 'aptitude', value: 4 },
        { type: 'aptitude', value: 2 },
        { type: 'difficulte', value: 2 },
      ],
    });
    expect(r.symbols.results.succesNets).toBe(2);

    const p = await h.roll(bob, {
      pool: [{ de: 'fortune', nombre: 2 }],
      systemId: 'star-wars-eote',
    });
    expect(p.symbols.dice).toHaveLength(2);
    expect(p.notation).toBe('2fortune');
  });

  it('dés 3D (physicalResults) : les faces lues font foi, source 3d, type « Dice Roller »', async () => {
    t.dice.force(1, 1, 1);
    const r = await h.roll(alice, {
      notation: '2d6+1d20+3',
      campaignId,
      physicalResults: [
        { type: 'd20', value: 17 },
        { type: 'd6', value: 4 },
        { type: 'd6', value: 5 },
      ],
    });
    expect(r).toMatchObject({
      results: [4, 5, 17],
      total: 29,
      output: '2d6+1d20+3 = [4, 5]+[17]+3 = 29',
      diceCount: 2,
      diceFaces: 6,
      source: '3d',
      type: 'Dice Roller',
      rolls: [
        { type: 'd6', value: 4 },
        { type: 'd6', value: 5 },
        { type: 'd20', value: 17 },
      ],
    });
    const [event] = await t
      .db!.select()
      .from(outbox)
      .where(eq(sql`${outbox.envelope}->'aggregate'->>'id'`, r.id));
    expect(event!.envelope).toMatchObject({ payload: { source: '3d', results: [4, 5, 17] } });
    expect((await h.ok<RollBody>(bob, 'GET', `/v1/dice/rolls/${r.id}`)).type).toBe('Dice Roller');

    // Relance d'explosion et d100 non lancés en 3D : complétés par le serveur (mixed)
    t.dice.force(3, 42);
    const m = await h.roll(alice, {
      notation: '1d6!+1d100',
      campaignId,
      physicalResults: [{ type: 'd6', value: 6 }],
    });
    expect(m).toMatchObject({
      results: [6, 3, 42],
      total: 51,
      source: 'mixed',
      type: 'Dice Roller',
    });

    // Vide : tirage serveur, comme sans physicalResults
    const e = await h.roll(alice, { notation: '1d6', campaignId, physicalResults: [] });
    expect([e.source, e.type]).toEqual(['free', 'Dice Roller/API']);
  });

  it('dés 3D à symboles : tag = sorte du dé (Aptitude et Difficulté, deux d8)', async () => {
    t.services.setSystem(campaignId, 'star-wars-eote');
    t.dice.force(1, 1, 1);
    const r = await h.roll(alice, {
      notation: '2aptitude 1difficulte',
      campaignId,
      physicalResults: [
        { type: 'd8', value: 2, tag: 'difficulte' },
        { type: 'd8', value: 4, tag: 'aptitude' },
        { type: 'd8', value: 2, tag: 'aptitude' },
      ],
    });
    expect(r).toMatchObject({
      symbolResult: '2 Succès',
      output: 'Aptitude [4, 2], Difficulté [2] = 2 Succès',
      results: [4, 2, 2],
      total: 0,
      source: '3d',
      type: 'Dice Roller',
    });
    expect(r.symbols.results.succesNets).toBe(2);
    expect(r.symbols.dice.map((x: RollBody) => x.die)).toEqual([
      'aptitude',
      'aptitude',
      'difficulte',
    ]);

    const p = await h.roll(bob, {
      pool: [{ de: 'fortune', nombre: 1 }],
      systemId: 'star-wars-eote',
      physicalResults: [{ type: 'fortune', value: 3 }],
    });
    expect(p.symbols.dice).toEqual([{ die: 'fortune', face: 3, symbols: { succes: 1 } }]);
    expect(p.source).toBe('3d');
  });

  it('dés 3D : valeur hors bornes, type inconnu, valeur en trop → 400 invalid_physical_result', async () => {
    const cases: Record<string, unknown>[] = [
      { notation: '1d6', physicalResults: [{ type: 'd6', value: 7 }] },
      { notation: '1d6', physicalResults: [{ type: 'd6', value: 0 }] },
      { notation: '1d6', physicalResults: [{ type: 'licorne', value: 1 }] },
      {
        notation: '1d6',
        physicalResults: [
          { type: 'd6', value: 1 },
          { type: 'd6', value: 2 },
        ],
      },
      { notation: '1d6', physicalResults: [{ type: 'd8', value: 2 }] },
      {
        pool: [{ de: 'aptitude', nombre: 1 }],
        systemId: 'star-wars-eote',
        physicalResults: [{ type: 'd8', value: 9, tag: 'aptitude' }],
      },
    ];
    for (const body of cases) {
      const res = await h.request(alice, 'POST', '/v1/dice/rolls', { ...body, campaignId });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().code, JSON.stringify(body)).toBe('invalid_physical_result');
    }
    // Plus de 100 valeurs : 400 validation_failed
    const many = Array.from({ length: 101 }, () => ({ type: 'd6', value: 1 }));
    const res = await h.request(alice, 'POST', '/v1/dice/rolls', {
      notation: '101d6',
      physicalResults: many,
    });
    expect([res.statusCode, res.json().code]).toEqual([400, 'validation_failed']);
    // Aucun jet enregistré
    expect(await history(alice)).toEqual([]);
  });

  it('visibilité : public, privé (isPrivate), caché au MJ (isBlind), personnel', async () => {
    const pub = await h.roll(alice, { notation: '1d6', campaignId });
    const priv = await h.roll(alice, { notation: '1d6', campaignId, isPrivate: true });
    const blind = await h.roll(alice, { notation: '1d6', campaignId, isBlind: true });
    const self = await h.roll(alice, { notation: '1d6', campaignId, visibility: 'self' });
    const perso = await h.roll(alice, { notation: '1d6' });
    expect([priv.isPrivate, priv.isBlind, blind.isBlind, blind.visibility]).toEqual([
      true,
      false,
      true,
      'gm',
    ]);
    expect(perso).toMatchObject({ campaignId: null, visibility: 'self', isPrivate: true });

    // L'auteur voit tout, mais pas le résultat de son jet caché
    const mine = await history(alice);
    expect(mine.map((r) => r.id)).toEqual([self.id, blind.id, priv.id, pub.id]);
    const hidden = mine.find((r) => r.id === blind.id)!;
    expect(hidden).toMatchObject({ hidden: true, results: [], total: null, output: '' });
    expect(blind.hidden).toBe(true);

    // Le MJ voit public, privé et caché (avec son résultat), pas le jet personnel « self »
    const forGm = await history(gm);
    expect(forGm.map((r) => r.id)).toEqual([blind.id, priv.id, pub.id]);
    expect(forGm[0]!.hidden).toBe(false);
    expect(forGm[0]!.results).toHaveLength(1);

    // Un autre joueur ne voit que le jet public
    expect((await history(bob)).map((r) => r.id)).toEqual([pub.id]);
    const res = await h.request(bob, 'GET', `/v1/dice/rolls/${priv.id}`);
    expect([res.statusCode, res.json().code]).toEqual([404, 'roll_not_found']);
    expect((await h.ok<RollBody>(gm, 'GET', `/v1/dice/rolls/${priv.id}`)).id).toBe(priv.id);

    // Jets personnels : sans campaignId, visibles par leur auteur seul
    expect((await history(alice, '')).map((r) => r.id)).toEqual([perso.id]);
    expect(await history(bob, '')).toEqual([]);
    expect((await h.request(gm, 'GET', `/v1/dice/rolls/${perso.id}`)).statusCode).toBe(404);

    // Événements : visibilité de l'enveloppe
    const events = await t
      .db!.select()
      .from(outbox)
      .where(eq(sql`${outbox.envelope}->'actor'->>'userId'`, alice.id));
    const byRoll = new Map(
      events.map((e) => {
        const env = e.envelope as { aggregate: { id: string }; visibility: string };
        return [env.aggregate.id, env.visibility];
      }),
    );
    expect([pub, priv, blind, self, perso].map((r) => byRoll.get(r.id))).toEqual([
      'public',
      'gm_only',
      'gm_only',
      'owner',
      'owner',
    ]);
  });

  it('historique : du plus récent au plus ancien, before pour remonter, after pour le polling', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await h.roll(alice, { notation: '1d4', campaignId })).id);
    const recent = await h.ok<RollBody[]>(
      bob,
      'GET',
      `/v1/dice/rolls?campaignId=${campaignId}&limit=2`,
    );
    expect(recent.map((r) => r.id)).toEqual([ids[4], ids[3]]);
    const older = await h.ok<RollBody[]>(
      bob,
      'GET',
      `/v1/dice/rolls?campaignId=${campaignId}&limit=2&before=${ids[3]}`,
    );
    expect(older.map((r) => r.id)).toEqual([ids[2], ids[1]]);
    const newer = await h.ok<RollBody[]>(
      bob,
      'GET',
      `/v1/dice/rolls?campaignId=${campaignId}&limit=2&after=${ids[1]}`,
    );
    expect(newer.map((r) => r.id)).toEqual([ids[3], ids[2]]);
    const res = await h.request(
      bob,
      'GET',
      `/v1/dice/rolls?campaignId=${campaignId}&before=${ids[1]}&after=${ids[0]}`,
    );
    expect(res.statusCode).toBe(400);
  });

  it('suppression : auteur ou MJ, événement dice.roll_deleted', async () => {
    const a = await h.roll(alice, { notation: '1d6', campaignId });
    const b = await h.roll(alice, { notation: '1d6', campaignId });
    let res = await h.request(bob, 'DELETE', `/v1/dice/rolls/${a.id}`);
    expect([res.statusCode, res.json().code]).toEqual([403, 'not_roll_author']);
    expect((await h.request(alice, 'DELETE', `/v1/dice/rolls/${a.id}`)).statusCode).toBe(204);
    expect((await h.request(gm, 'DELETE', `/v1/dice/rolls/${b.id}`)).statusCode).toBe(204);
    res = await h.request(gm, 'DELETE', `/v1/dice/rolls/${b.id}`);
    expect(res.statusCode).toBe(404);
    expect(await history(alice)).toEqual([]);
    const [deleted] = await t
      .db!.select()
      .from(outbox)
      .where(
        and(
          eq(sql`${outbox.envelope}->>'type'`, 'dice.roll_deleted'),
          eq(sql`${outbox.envelope}->'payload'->>'id'`, b.id),
        ),
      );
    expect(deleted!.envelope).toMatchObject({ actor: { userId: gm.id, role: 'gm' } });
  });

  it('Idempotency-Key : la requête rejouée renvoie le même jet, même avec un autre jeton', async () => {
    const key = { 'idempotency-key': 'jet-unique-0001' };
    const first = await h.request(alice, 'POST', '/v1/dice/rolls', { notation: '1d100' }, key);
    expect(first.statusCode).toBe(201);
    // Même jeton : réponse gardée par la plateforme
    const again = await h.request(alice, 'POST', '/v1/dice/rolls', { notation: '1d100' }, key);
    expect(again.json().id).toBe(first.json().id);
    // Autre session du même utilisateur : retrouvé en base, jamais relancé
    const other = await t.token(alice.id);
    const replay = await h.request(other, 'POST', '/v1/dice/rolls', { notation: '1d100' }, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.json()).toMatchObject({ id: first.json().id, total: first.json().total });
    expect(await history(alice, '')).toHaveLength(1);
    // Même clé, autre utilisateur : un autre jet
    const bobRoll = await h.request(bob, 'POST', '/v1/dice/rolls', { notation: '1d100' }, key);
    expect(bobRoll.json().id).not.toBe(first.json().id);
  });

  it('clé d’API : source api et ancien type « Dice Roller/API »', async () => {
    const api = await t.token(alice.id, ['user', 'api']);
    const r = await h.roll(api, { notation: '1d20', roomId: campaignId });
    expect([r.source, r.type]).toEqual(['api', 'Dice Roller/API']);
  });

  it('limite de débit par utilisateur (429 too_many_rolls)', async () => {
    const limited = await testApp({ RATE_LIMIT_ROLLS_PER_USER: '3' });
    try {
      const lh = helpers(limited);
      const u = await limited.user('Pressé');
      for (let i = 0; i < 3; i++) await lh.roll(u, { notation: '1d6' });
      const res = await lh.request(u, 'POST', '/v1/dice/rolls', { notation: '1d6' });
      expect([res.statusCode, res.json().code]).toEqual([429, 'too_many_rolls']);
      expect(res.headers['retry-after']).toBe('60');
    } finally {
      await limited.close();
    }
  });

  it('catalogue des skins', async () => {
    const skins = await h.ok<{ id: string; free: boolean }[]>(alice, 'GET', '/v1/dice/skins');
    expect(skins).toHaveLength(71);
    expect(skins.filter((s) => s.free).map((s) => s.id)).toContain('gold');
  });

  it('le MJ vide l’historique de la campagne ; un joueur est refusé ; les autres campagnes restent', async () => {
    const other = t.services.campaign({ [gm.id]: 'gm', [alice.id]: 'player' });
    await h.roll(alice, { notation: '1d20', campaignId });
    await h.roll(bob, { notation: '2d6', campaignId, isBlind: true });
    await h.roll(alice, { notation: '1d8', campaignId: other });

    const refused = await h.request(alice, 'DELETE', `/v1/dice/rolls?campaignId=${campaignId}`);
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'gm_required']);
    // Sans campagne : les jets personnels du MJ (aucun ici), jamais ceux de la campagne
    expect(await h.ok(gm, 'DELETE', '/v1/dice/rolls')).toEqual({ deleted: 0 });

    const cleared = await h.ok<{ deleted: number }>(
      gm,
      'DELETE',
      `/v1/dice/rolls?campaignId=${campaignId}`,
    );
    expect(cleared).toEqual({ deleted: 2 });
    expect(await history(gm)).toEqual([]);
    expect(await history(alice, `campaignId=${other}`)).toHaveLength(1);

    const events = await t
      .db!.select()
      .from(outbox)
      .where(sql`${outbox.envelope}->>'type' = 'dice.history_cleared'`);
    expect(events.map((e) => (e.envelope as { payload: unknown }).payload)).toContainEqual({
      campaignId,
      deleted: 2,
      userId: gm.id,
    });

    // Historique déjà vide : rien à supprimer, aucun nouvel événement
    expect(await h.ok(gm, 'DELETE', `/v1/dice/rolls?campaignId=${campaignId}`)).toEqual({
      deleted: 0,
    });
  });

  it('chacun vide ses jets personnels ; ceux des campagnes et des autres restent', async () => {
    await h.roll(alice, { notation: '1d20' });
    await h.roll(alice, { notation: '2d6' });
    await h.roll(alice, { notation: '1d8', campaignId });
    await h.roll(bob, { notation: '1d4' });

    const cleared = await h.ok<{ deleted: number }>(alice, 'DELETE', '/v1/dice/rolls');
    expect(cleared).toEqual({ deleted: 2 });
    expect(await history(alice, '')).toEqual([]);
    expect(await history(alice)).toHaveLength(1);
    expect(await history(bob, '')).toHaveLength(1);

    // Un seul événement, pour Alice seule (pas de campagne)
    const events = await t
      .db!.select()
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->>'type' = 'dice.history_cleared'`,
          sql`${outbox.envelope}->'actor'->>'userId' = ${alice.id}`,
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.subject).toBe('vtt.global.dice.history_cleared');
    expect(events[0]!.envelope).toMatchObject({
      roomId: null,
      visibility: 'owner',
      actor: { userId: alice.id, role: 'user' },
      aggregate: { type: 'user', id: alice.id },
      payload: { campaignId: null, deleted: 2, userId: alice.id },
    });

    // Rien à vider : aucun nouvel événement
    expect(await h.ok(alice, 'DELETE', '/v1/dice/rolls')).toEqual({ deleted: 0 });
    const after = await t
      .db!.select()
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->>'type' = 'dice.history_cleared'`,
          sql`${outbox.envelope}->'actor'->>'userId' = ${alice.id}`,
        ),
      );
    expect(after).toHaveLength(1);
  });
});
