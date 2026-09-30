/**
 * Attaques, déclaration et résolution (docs/combat.md § 5, § 9, § 10) sur un vrai PostgreSQL,
 * avec le faux character : droits, cibles vues, tour et réglage « hors tour », défense active,
 * jet par cible ou commun, idempotence, refus des règles, et non-fuite (aucune valeur d'un PNJ
 * vers un joueur, ni en REST ni par événement).
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignAttacks } from '../../db/schema.js';
import { attackScene, leaks } from '../../test/attack-scene.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

interface Target {
  characterId: string;
  status: string;
  decision: string;
  reactionParams?: string[];
  reaction?: { params: Record<string, unknown>; skipped: boolean } | null;
  view?: { outcome: { success: boolean; critical: boolean } } | null;
  result?: { variables: Record<string, unknown>; modifications: unknown[] } | null;
  applied?: unknown;
}
interface Attack {
  id: string;
  combatId: string | null;
  round: number | null;
  turn: number | null;
  attackerId: string;
  action: { id: string; name: string };
  params: Record<string, unknown>;
  rollMode: string;
  dice: string;
  visibility: string;
  status: string;
  outOfTurn: boolean;
  selfTarget: boolean;
  targets: Target[];
  actor?: { modifications: unknown[]; decision: string } | null;
  version: number;
  redacted: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('attaques : déclaration et résolution', () => {
  let t: TestContext;
  let s: Awaited<ReturnType<typeof attackScene>>;

  beforeEach(async () => {
    t = await testApp();
    s = await attackScene(t);
  });

  afterEach(async () => {
    await t.close();
  });

  it('hors combat : rapport au MJ, vue de l’attaquant pour le joueur, rien ne fuit', async () => {
    const { h, gm, alice, bob, aria, goblin, attacks } = s;
    t.character.rolls.push(16);
    const res = await h.request(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'attaque',
      params: { bonus: 2, degats: 6 },
      targets: [goblin],
      origin: 'map',
    });
    expect(res.statusCode, res.body).toBe(201);
    const mine = res.json() as Attack;
    expect(mine).toMatchObject({
      combatId: null,
      round: null,
      turn: null,
      attackerId: aria,
      action: { id: 'attaque', name: 'Attaque' },
      rollMode: 'per_target',
      dice: 'server',
      visibility: 'public',
      status: 'pending',
      outOfTurn: false,
      selfTarget: false,
      redacted: true,
    });
    expect(mine.targets).toEqual([
      expect.objectContaining({
        characterId: goblin,
        status: 'resolved',
        decision: 'pending',
        view: expect.objectContaining({
          outcome: { success: true, critical: false, fumble: false },
        }),
      }),
    ]);
    // Ni rapport complet, ni coûts, ni ce qui est appliqué à un PNJ
    expect(mine.targets[0]).not.toHaveProperty('result');
    expect(mine.targets[0]).not.toHaveProperty('applied');
    expect(mine).not.toHaveProperty('actor');
    expect(leaks(mine)).toEqual([]);

    // character : préparé avec l'origine et le jet de l'historique (vue de l'attaquant)
    const [prepare] = s.callsTo('/internal/actions/prepare');
    expect(prepare!.body).toMatchObject({
      actorId: aria,
      action: 'attaque',
      targetIds: [goblin],
      params: { bonus: 2, degats: 6 },
      dice: 'server',
      userId: alice.id,
      campaignId: s.id,
      diceHistory: { campaignId: s.id, authorId: alice.id, visibility: 'public' },
    });
    expect(s.callsTo('/internal/actions/resolve')).toHaveLength(0);

    // Le MJ lit tout ; Bob ne voit pas l'attaque d'Alice
    const full = await h.ok<Attack>(gm, 'GET', `${attacks}/${mine.id}`);
    expect(full.redacted).toBe(false);
    expect(full.targets[0]!.result!.variables).toMatchObject({ defenseCible: 17, degats: 6 });
    expect(full.actor).toEqual({ modifications: [], decision: 'pending', applied: null });
    expect((await h.request(bob, 'GET', `${attacks}/${mine.id}`)).json()).toMatchObject({
      status: 404,
      code: 'attack_not_found',
    });
    expect((await h.ok<{ attacks: Attack[] }>(bob, 'GET', attacks)).attacks).toEqual([]);
    const list = await h.ok<{ attacks: Attack[]; hasMore: boolean }>(alice, 'GET', attacks);
    expect(list.attacks.map((a) => a.id)).toEqual([mine.id]);
    expect(leaks(list)).toEqual([]);

    // Événements : le rapport complet aux MJ seuls ; l'annonce publique ne nomme pas un PNJ
    // hors combat ; rien de secret dans ce que reçoivent les joueurs
    const all = await s.events();
    const resolved = all.find((e) => e.type === 'combat.attack_resolved')!;
    expect(resolved.visibility).toBe('gm_only');
    expect(resolved.payload).not.toHaveProperty('visibleToUsers');
    expect(resolved.actor.characterId).toBe(aria);
    const updated = all.find((e) => e.type === 'combat.attack_updated')!;
    expect(updated).toMatchObject({
      visibility: 'gm_only',
      payload: {
        attackId: mine.id,
        change: 'resolved',
        status: 'pending',
        visibleToUsers: [alice.id],
      },
    });
    const announced = all.find((e) => e.type === 'combat.attack_announced')!;
    expect(announced).toMatchObject({
      visibility: 'public',
      payload: { attackerId: aria, action: { id: 'attaque' }, targets: [] },
    });
    for (const u of [alice, bob]) expect(leaks(await s.receivedBy(u))).toEqual([]);
  });

  it('droits : spectateur, personnage non incarné, cible cachée ou inconnue, décisions du MJ', async () => {
    const { h, gm, alice, bob, aria, brom, goblin, shadow, attacks, id } = s;
    const declare = (u: typeof gm, body: Record<string, unknown>) =>
      h.request(u, 'POST', attacks, { action: 'attaque', ...body });

    expect((await declare(alice, { attackerId: brom, targets: [goblin] })).statusCode).toBe(403);
    expect((await declare(alice, { attackerId: aria, targets: [shadow] })).json()).toMatchObject({
      status: 404,
      code: 'target_not_found',
    });
    expect(
      (await declare(alice, { attackerId: aria, targets: [crypto.randomUUID()] })).json(),
    ).toMatchObject({ status: 404, code: 'target_not_found' });
    expect(
      (await declare(gm, { attackerId: crypto.randomUUID(), targets: [aria] })).json(),
    ).toMatchObject({ status: 422, code: 'character_not_engaged' });
    expect((await declare(alice, { attackerId: aria, targets: [goblin, goblin] })).statusCode).toBe(
      400,
    );
    expect(s.callsTo('/internal/actions/prepare')).toHaveLength(0);

    // Le MJ attaque avec l'ombre : caché par défaut (gmRollsHidden), aucune annonce
    const hidden = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: shadow,
      action: 'attaque',
      targets: [aria],
    });
    expect(hidden).toMatchObject({ visibility: 'gm', redacted: false });
    expect((await s.events()).some((e) => e.type === 'combat.attack_announced')).toBe(false);
    // Alice ne lit pas le rapport du MJ ; Bob, devenu spectateur, n'attaque plus
    expect((await h.request(alice, 'GET', `${attacks}/${hidden.id}`)).statusCode).toBe(404);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'spectator' });
    expect((await declare(bob, { attackerId: brom, targets: [goblin] })).statusCode).toBe(403);
    expect((await h.ok<{ attacks: unknown[] }>(bob, 'GET', attacks)).attacks).toEqual([]);

    // Décider : le MJ seul
    const url = `${attacks}/${hidden.id}`;
    const v = hidden.version;
    expect(
      (
        await h.request(alice, 'POST', `${url}/apply`, {
          version: v,
          targets: [],
          actor: { apply: false },
        })
      ).statusCode,
    ).toBe(403);
    expect((await h.request(alice, 'POST', `${url}/dismiss`, { version: v })).statusCode).toBe(403);
    expect((await h.request(alice, 'POST', `${url}/revert`, { version: v })).statusCode).toBe(403);
    expect(
      (
        await h.request(alice, 'POST', `${attacks}/batch`, {
          attacks: [{ attackerId: aria, action: 'attaque', targets: [goblin] }],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await h.request(alice, 'POST', `${attacks}/apply`, {
          items: [{ attackId: hidden.id, version: v, targets: [], actor: { apply: false } }],
        })
      ).statusCode,
    ).toBe(403);
  });

  it('en combat : tour, attaque hors tour marquée, réglage qui l’interdit aux joueurs', async () => {
    const { h, gm, alice, bob, aria, brom, goblin, attacks, combat } = s;
    await h.ok(gm, 'POST', combat, { participants: [aria, brom, goblin] });
    const c = await h.ok<{ id: string; version: number; turn: number }>(
      gm,
      'POST',
      `${combat}/initiative`,
      {},
    );
    // Tour d'Aria : Brom attaque hors de son tour (réaction), permis et marqué
    const off = await h.ok<Attack>(bob, 'POST', attacks, {
      attackerId: brom,
      action: 'attaque',
      targets: [goblin],
    });
    expect(off).toMatchObject({ combatId: c.id, round: 1, turn: 0, outOfTurn: true });
    const own = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'attaque',
      targets: [goblin],
    });
    expect(own.outOfTurn).toBe(false);
    // Le MJ attaque hors du tour du gobelin : toujours permis, marqué
    const npc = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'attaque',
      targets: [aria],
      visibility: 'public',
    });
    expect(npc).toMatchObject({ outOfTurn: true, visibility: 'public' });

    await h.ok(gm, 'PATCH', `${combat}/settings`, { playersActOutsideTurn: false });
    expect(
      (
        await h.request(bob, 'POST', attacks, {
          attackerId: brom,
          action: 'attaque',
          targets: [goblin],
        })
      ).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    await h.ok(alice, 'POST', attacks, { attackerId: aria, action: 'attaque', targets: [goblin] });

    // En combat, un participant visible est annoncé ; l'attaque d'un PNJ publique aussi
    const announced = (await s.events()).filter((e) => e.type === 'combat.attack_announced');
    expect(announced.map((e) => e.payload.attackerId)).toEqual([brom, aria, goblin, aria]);
    expect((announced[0]!.payload.targets as { characterId: string }[])[0]!.characterId).toBe(
      goblin,
    );
    for (const u of [s.alice, s.bob]) expect(leaks(await s.receivedBy(u))).toEqual([]);
  });

  it('mode slots : la première attaque d’un participant du camp le désigne acteur du créneau', async () => {
    const { h, gm, alice, aria, brom, goblin, attacks, combat } = s;
    await h.ok(gm, 'POST', combat, { participants: [aria, brom, goblin], mode: 'slots' });
    await h.ok(gm, 'POST', `${combat}/initiative`, {});
    const a = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'attaque',
      targets: [goblin],
    });
    expect(a.outOfTurn).toBe(false);
    const state = await h.ok<{ currentActorId: string; turn: number; canGoBack: boolean }>(
      gm,
      'GET',
      combat,
    );
    expect(state).toMatchObject({ currentActorId: aria, turn: 1, canGoBack: true });
    // Brom, du même camp, attaque ensuite : hors tour (Aria a pris le créneau)
    const b = await h.ok<Attack>(s.bob, 'POST', attacks, {
      attackerId: brom,
      action: 'attaque',
      targets: [goblin],
    });
    expect(b.outOfTurn).toBe(true);
    const reasons = (await s.events('combat.turn_changed')).map((e) => e.payload.reason);
    expect(reasons).toContain('slot_actor');
  });

  it('défense active : invite aux joueurs ciblés, résolution à la dernière réponse', async () => {
    const { h, gm, alice, bob, aria, brom, goblin, attacks } = s;
    t.character.actions.set('tir', {
      name: 'Tir',
      reactionParams: (id) => (id === aria || id === brom ? ['esquive'] : []),
    });
    t.character.rolls.push(15, 14);
    const a = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'tir',
      params: { degats: 6 },
      targets: [aria, brom],
    });
    expect(a).toMatchObject({ status: 'awaiting_reactions', visibility: 'gm' });
    expect(a.targets.map((x) => [x.status, x.reactionParams])).toEqual([
      ['awaiting_reaction', ['esquive']],
      ['awaiting_reaction', ['esquive']],
    ]);
    const [requested] = await s.events();
    expect(requested).toMatchObject({
      type: 'combat.attack_updated',
      payload: { change: 'reaction_requested', status: 'awaiting_reactions' },
    });
    expect(requested!.payload.visibleToUsers).toEqual(
      expect.arrayContaining([alice.id, bob.id, gm.id]),
    );

    // Alice voit l'invite de sa cible seulement, sans les paramètres de l'attaquant
    const prompt = await h.ok<Attack>(alice, 'GET', `${attacks}/${a.id}`);
    expect(prompt).toMatchObject({ attackerId: goblin, params: {}, redacted: true });
    expect(prompt.targets).toEqual([
      expect.objectContaining({ characterId: aria, reactionParams: ['esquive'], reaction: null }),
    ]);
    const open = await h.ok<{ attacks: Attack[] }>(alice, 'GET', `${attacks}?status=open`);
    expect(open.attacks.map((x) => x.id)).toEqual([a.id]);

    const react = (u: typeof gm, body: Record<string, unknown>) =>
      h.request(u, 'POST', `${attacks}/${a.id}/reactions`, body);
    expect((await react(bob, { characterId: aria, skip: true })).statusCode).toBe(403);
    expect((await react(alice, { characterId: aria, params: { parade: 1 } })).json()).toMatchObject(
      { status: 400, code: 'unknown_reaction_param' },
    );
    expect((await react(alice, { characterId: aria, params: {}, skip: true })).statusCode).toBe(
      400,
    );
    const answered = (await react(alice, { characterId: aria, params: { esquive: 2 } })).json();
    expect(answered).toMatchObject({ status: 'awaiting_reactions' });
    expect(s.callsTo('/internal/actions/resolve')).toHaveLength(0);

    // Panne de character à la dernière réponse : 502, l'attaque attend de nouveau
    t.character.behaviour.down = new Set(['/internal/actions/resolve']);
    expect((await react(bob, { characterId: brom, skip: true })).json()).toMatchObject({
      status: 502,
      code: 'character_unavailable',
    });
    expect((await h.ok<Attack>(gm, 'GET', `${attacks}/${a.id}`)).status).toBe('awaiting_reactions');
    t.character.behaviour.down = undefined;
    const last = (await react(bob, { characterId: brom, skip: true })).json() as Attack;
    expect(last).toMatchObject({ status: 'pending', redacted: true });
    expect(last.targets.map((x) => x.characterId)).toEqual([brom]);
    expect(leaks(last)).toEqual([]);

    const resolve = s.callsTo('/internal/actions/resolve').at(-1)!;
    // Attaque unique : après les réactions, la première étape (jamais tout d'un coup)
    expect(resolve.body.serverFallback).toBeUndefined();
    expect(resolve.body).toMatchObject({
      rollMode: 'per_target',
      dice: 'server',
      reactions: [
        { characterId: aria, params: { esquive: 2 }, skipped: false },
        { characterId: brom, params: {}, skipped: true },
      ],
      diceHistory: { authorId: gm.id, visibility: 'gm' },
    });
    const full = await h.ok<Attack>(gm, 'GET', `${attacks}/${a.id}`);
    expect(full.targets.map((x) => x.result!.variables.esquive)).toEqual([2, 0]);
    expect(full.targets[0]!.reaction).toMatchObject({ params: { esquive: 2 }, skipped: false });
    // Résolue : l'invite disparaît pour Alice
    expect((await h.request(alice, 'GET', `${attacks}/${a.id}`)).statusCode).toBe(404);
    expect((await react(alice, { characterId: aria, skip: true })).statusCode).toBe(404);
    for (const u of [alice, bob]) expect(leaks(await s.receivedBy(u))).toEqual([]);
  });

  it('jet commun : un dé pour toutes les cibles, coûts de l’attaquant une seule fois', async () => {
    const { h, gm, aria, brom, goblin, attacks } = s;
    t.character.actions.set('boule', { name: 'Boule de feu', rollMode: 'shared' });
    t.character.rolls.push(12, 19);
    const zone = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'boule',
      params: { degats: 8, cout: 2 },
      targets: [aria, brom],
      origin: 'measurement',
    });
    expect(zone).toMatchObject({ rollMode: 'shared', status: 'pending' });
    // Un seul d20 (12) : touche Aria (Défense 12) et Brom (11) ; le 19 n'a pas servi
    expect(zone.targets.map((x) => x.view!.outcome.success)).toEqual([true, true]);
    expect(t.character.rolls).toEqual([19]);
    expect(zone.actor!.modifications).toEqual([
      { kind: 'attribute', entity: 'actor', attribute: 'Stress', operation: 'add', value: 2 },
    ]);
    // Même action en jet par cible, forcé à la déclaration : un dé chacun
    t.character.rolls.splice(0, 1, 11, 11);
    const each = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'boule',
      params: { degats: 8 },
      targets: [aria, brom],
      rollMode: 'per_target',
    });
    expect(each.rollMode).toBe('per_target');
    expect(each.targets.map((x) => x.view!.outcome.success)).toEqual([false, true]);
  });

  it('refus : règles (422), fiche absente, panne de character : rien n’est écrit', async () => {
    const { h, gm, alice, aria, goblin, attacks } = s;
    t.character.actions.set('interdit', { name: 'Interdit', refuse: 'Arme non possédée' });
    expect(
      (
        await h.request(alice, 'POST', attacks, {
          attackerId: aria,
          action: 'interdit',
          targets: [goblin],
        })
      ).json(),
    ).toMatchObject({ status: 422, code: 'action_refused', detail: 'Arme non possédée' });
    t.character.actions.set('portee', {
      name: 'Portée',
      refuseTarget: (id) => (id === goblin ? 'Hors de portée' : null),
    });
    const partial = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'portee',
      targets: [goblin, aria],
    });
    expect(partial.selfTarget).toBe(true);
    expect(partial.targets.map((x) => [x.status, (x as { error?: string }).error])).toEqual([
      ['failed', 'Hors de portée'],
      ['resolved', null],
    ]);
    t.character.characters.get(goblin)!.deleted = true;
    expect(
      (
        await h.request(gm, 'POST', attacks, {
          attackerId: goblin,
          action: 'attaque',
          targets: [aria],
        })
      ).json(),
    ).toMatchObject({ status: 422, code: 'character_not_found' });
    t.character.characters.get(goblin)!.deleted = false;
    t.character.behaviour.down = new Set(['/internal/actions/prepare']);
    expect(
      (
        await h.request(alice, 'POST', attacks, {
          attackerId: aria,
          action: 'attaque',
          targets: [goblin],
        })
      ).json(),
    ).toMatchObject({ status: 502, code: 'character_unavailable' });
    const page = await h.ok<{ attacks: Attack[] }>(gm, 'GET', attacks);
    expect(page.attacks.map((x) => x.id)).toEqual([partial.id]);
  });

  it('idempotence : même clé, même attaque, character appelé une fois', async () => {
    const { h, alice, aria, goblin, attacks } = s;
    const body = { attackerId: aria, action: 'attaque', targets: [goblin] };
    const key = crypto.randomUUID();
    const send = () =>
      t.app.inject({
        method: 'POST',
        url: attacks,
        headers: { ...alice.auth, 'idempotency-key': key },
        payload: body,
      });
    // Double clic : la seconde requête attend la première (409 de la plateforme pendant
    // qu'elle tourne, ou la même attaque) ; jamais une seconde attaque
    const [one, two] = await Promise.all([send(), send()]);
    const ok = [one, two].filter((r) => r.statusCode === 201);
    expect(ok.length, `${one.body} ${two.body}`).toBeGreaterThanOrEqual(1);
    for (const r of [one, two])
      if (r.statusCode !== 201)
        expect(r.json()).toMatchObject({ status: 409, code: 'idempotency_in_progress' });
    const id = ok[0]!.json().id as string;
    for (const r of ok) expect(r.json().id).toBe(id);
    // Reprise réseau : la même réponse
    const again = await send();
    expect(again.statusCode).toBe(201);
    expect(again.json().id).toBe(id);
    expect(s.callsTo('/internal/actions/prepare')).toHaveLength(1);

    // La clé est gardée en base avec l'attaque (au-delà de la réponse mémorisée)
    const [row] = await t
      .db!.select({ key: campaignAttacks.idempotencyKey })
      .from(campaignAttacks)
      .where(eq(campaignAttacks.id, id));
    expect(row!.key).toBe(key);

    // Une autre clé : une autre attaque
    const other = await t.app.inject({
      method: 'POST',
      url: attacks,
      headers: { ...alice.auth, 'idempotency-key': crypto.randomUUID() },
      payload: body,
    });
    expect(other.json().id).not.toBe(id);
    expect((await h.ok<{ attacks: unknown[] }>(alice, 'GET', attacks)).attacks).toHaveLength(2);
  });

  it('lot du MJ, abandon, liste filtrée', async () => {
    const { h, gm, alice, aria, brom, goblin, shadow, attacks } = s;
    const batch = await h.ok<{ attacks: Attack[] }>(gm, 'POST', `${attacks}/batch`, {
      attacks: [
        { attackerId: goblin, action: 'attaque', targets: [aria] },
        { attackerId: shadow, action: 'attaque', targets: [brom] },
      ],
    });
    expect(batch.attacks.map((x) => [x.attackerId, x.status])).toEqual([
      [goblin, 'pending'],
      [shadow, 'pending'],
    ]);

    t.character.actions.set('tir', { name: 'Tir', reactionParams: () => ['esquive'] });
    const open = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'tir',
      targets: [goblin],
    });
    expect(open.status).toBe('awaiting_reactions');
    // Bob ne l'abandonne pas (il ne la voit pas) ; Alice, si ; ensuite plus rien à abandonner
    expect((await h.request(s.bob, 'POST', `${attacks}/${open.id}/cancel`, {})).statusCode).toBe(
      404,
    );
    const cancelled = await h.ok<Attack>(alice, 'POST', `${attacks}/${open.id}/cancel`, {});
    expect(cancelled.status).toBe('cancelled');
    expect(
      (await h.request(alice, 'POST', `${attacks}/${open.id}/cancel`, {})).json(),
    ).toMatchObject({ status: 409, code: 'already_resolved' });
    expect(
      (await h.request(gm, 'POST', `${attacks}/${batch.attacks[0]!.id}/cancel`, {})).json(),
    ).toMatchObject({ status: 409, code: 'already_resolved' });

    const pending = await h.ok<{ attacks: Attack[]; hasMore: boolean }>(
      gm,
      'GET',
      `${attacks}?status=pending&limit=1`,
    );
    expect(pending.attacks.map((x) => x.id)).toEqual([batch.attacks[1]!.id]);
    expect(pending.hasMore).toBe(true);
    const next = await h.ok<{ attacks: Attack[]; hasMore: boolean }>(
      gm,
      'GET',
      `${attacks}?status=pending&before=${batch.attacks[1]!.id}`,
    );
    expect(next.attacks.map((x) => x.id)).toEqual([batch.attacks[0]!.id]);
    expect(next.hasMore).toBe(false);
    const byGoblin = await h.ok<{ attacks: Attack[] }>(
      gm,
      'GET',
      `${attacks}?attackerId=${goblin}`,
    );
    expect(byGoblin.attacks).toHaveLength(1);
    const mine = await h.ok<{ attacks: Attack[] }>(alice, 'GET', attacks);
    expect(mine.attacks.map((x) => x.id)).toEqual([open.id]);
  });
});
