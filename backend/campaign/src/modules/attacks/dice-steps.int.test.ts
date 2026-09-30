/**
 * Attaque en étapes (docs/combat.md § 6), avec le faux character : le jet d'abord (TOUCHÉ ou
 * RATÉ par cible, visible de l'attaquant), puis « Lancer les dégâts » pour les seules cibles
 * touchées, puis le rapport. Route `…/dice` : droits (auteur, MJ à sa place), étape périmée,
 * faces invalides, panne de character, résolution déjà en cours ; lot du MJ enchaîné seul.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignAttacks } from '../../db/schema.js';
import { attackScene, leaks } from '../../test/attack-scene.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

interface Step {
  id: string;
  phase: string;
  label?: string;
  dice: { id: string; targetId: string | null; faces: number }[];
}
interface Attack {
  id: string;
  status: string;
  resolving?: boolean;
  pendingSteps: Step[];
  targets: {
    characterId: string;
    status: string;
    view?: { outcome: { success: boolean }; values: unknown[] } | null;
    result?: { modifications: unknown[] } | null;
  }[];
  version: number;
  redacted: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('attaques : étapes de dés', () => {
  let t: TestContext;
  let s: Awaited<ReturnType<typeof attackScene>>;

  beforeEach(async () => {
    t = await testApp();
    s = await attackScene(t);
    t.character.actions.set('epee', { name: 'Épée', steps: true });
  });

  afterEach(async () => {
    await t.close();
  });

  const dice = (u: Parameters<typeof s.h.request>[0], a: Attack, body: object) =>
    s.h.request(u, 'POST', `${s.attacks}/${a.id}/dice`, body);

  it('le jet, TOUCHÉ ou RATÉ par cible, puis les dégâts des seules cibles touchées', async () => {
    const { h, gm, alice, aria, brom, goblin, attacks } = s;
    // Gobelin (Défense 17) : raté ; Brom (Défense 11) : touché
    t.character.rolls.push(12, 12);
    const declared = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'epee',
      targets: [goblin, brom],
    });
    expect(declared).toMatchObject({ status: 'awaiting_dice', redacted: true });
    const [roll] = declared.pendingSteps;
    expect(roll).toMatchObject({ phase: 'roll', label: 'Attaque' });
    expect(roll!.dice.map((d) => d.targetId)).toEqual([goblin, brom]);
    expect(declared.targets.map((x) => [x.status, x.view ?? null])).toEqual([
      ['awaiting_dice', null],
      ['awaiting_dice', null],
    ]);

    // Étape 1 : l'attaquant voit l'issue de chaque cible, sans dégâts ; l'étape des dégâts
    const res = await dice(alice, declared, { stepId: roll!.id, results: [] });
    expect(res.statusCode, res.body).toBe(200);
    const hit = res.json() as Attack;
    expect(hit.status).toBe('awaiting_dice');
    expect(hit.targets.map((x) => [x.characterId, x.status, x.view?.outcome.success])).toEqual([
      [goblin, 'resolved', false],
      [brom, 'awaiting_dice', true],
    ]);
    expect(hit.targets[1]!.view!.values).toEqual([]);
    const [after] = hit.pendingSteps;
    expect(after).toMatchObject({ phase: 'after', label: 'Dégâts' });
    expect(after!.dice.map((d) => d.targetId)).toEqual([brom]);
    expect(leaks(hit)).toEqual([]);
    // Rien au MJ comme rapport pour l'instant : l'attaque est en cours
    const inProgress = await h.ok<Attack>(gm, 'GET', `${attacks}/${declared.id}`);
    expect(inProgress.status).toBe('awaiting_dice');
    const changes = (await s.events())
      .filter((e) => e.type === 'combat.attack_updated')
      .map((e) => e.payload.change);
    expect(changes).toEqual(['dice_requested', 'dice_rolled']);

    // L'étape 1 est passée : 409 ; faces invalides : 400, rien ne bouge
    const outdated = await dice(alice, hit, { stepId: roll!.id, results: [] });
    expect(outdated.statusCode).toBe(409);
    expect(outdated.json()).toMatchObject({ code: 'step_outdated' });
    for (const results of [[{ id: 'x', value: 2 }], [{ id: after!.dice[0]!.id, value: 7 }]]) {
      const bad = await dice(alice, hit, { stepId: after!.id, results });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toMatchObject({ code: 'invalid_physical_result' });
    }

    // Étape 2, la face lue sur le dé 3D : le rapport part au MJ
    const done = (
      await dice(alice, hit, { stepId: after!.id, results: [{ id: after!.dice[0]!.id, value: 4 }] })
    ).json() as Attack;
    expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
    const full = await h.ok<Attack>(gm, 'GET', `${attacks}/${declared.id}`);
    expect(full.targets.map((x) => x.status)).toEqual(['resolved', 'resolved']);
    expect(full.targets[1]!.result!.modifications).toHaveLength(1);
    const [row] = await t
      .db!.select({ faces: campaignAttacks.faces, snapshot: campaignAttacks.snapshot })
      .from(campaignAttacks)
      .where(eq(campaignAttacks.id, declared.id));
    expect(row!.snapshot).toBeNull();
    expect(row!.faces.map((f) => f.source)).toEqual(['server', 'server', 'physical']);
  });

  it('raté partout : pas d’étape de dégâts', async () => {
    const { h, alice, aria, goblin, attacks } = s;
    t.character.rolls.push(3);
    const a = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'epee',
      targets: [goblin],
    });
    const done = (await dice(alice, a, { stepId: a.pendingSteps[0]!.id, results: [] })).json();
    expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
  });

  it('droits : un autre joueur ne lance pas ; le MJ tire la suite à la place de l’auteur', async () => {
    const { h, gm, alice, bob, aria, goblin, attacks } = s;
    t.character.rolls.push(18);
    const a = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'epee',
      targets: [goblin],
    });
    // Bob ne voit pas l'attaque d'Alice
    expect((await dice(bob, a, { stepId: a.pendingSteps[0]!.id, results: [] })).statusCode).toBe(
      404,
    );
    // L'auteur est parti : le MJ tire tout le reste d'un coup
    const res = await dice(gm, a, {
      stepId: a.pendingSteps[0]!.id,
      results: [],
      serverFallback: true,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'pending', pendingSteps: [] });
    const call = s.callsTo('/internal/actions/resolve').at(-1)!;
    expect(call.body).toMatchObject({ serverFallback: true, step: { id: 'roll-0' } });
    // L'auteur retrouve son résultat
    const mine = await h.ok<Attack>(alice, 'GET', `${attacks}/${a.id}`);
    expect(mine.targets[0]!.view!.outcome.success).toBe(true);
  });

  it('panne de character : l’étape reste à lancer ; résolution en cours : 409', async () => {
    const { h, gm, alice, aria, goblin, attacks } = s;
    const a = await h.ok<Attack>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'epee',
      targets: [goblin],
    });
    const stepId = a.pendingSteps[0]!.id;
    t.character.behaviour.down = new Set(['/internal/actions/resolve']);
    const down = await dice(alice, a, { stepId, results: [] });
    expect(down.statusCode).toBe(502);
    t.character.behaviour.down = undefined;
    const after = await h.ok<Attack>(alice, 'GET', `${attacks}/${a.id}`);
    expect(after).toMatchObject({ status: 'awaiting_dice', pendingSteps: [{ id: stepId }] });
    expect(after.resolving).toBeUndefined();

    // Une résolution déjà en cours (depuis moins de 30 s) : 409 ; plus ancienne : relancée
    await t
      .db!.update(campaignAttacks)
      .set({ resolvingSince: new Date() })
      .where(eq(campaignAttacks.id, a.id));
    expect((await h.ok<Attack>(gm, 'GET', `${attacks}/${a.id}`)).resolving).toBe(true);
    const busy = await dice(alice, a, { stepId, results: [] });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ code: 'resolution_in_progress' });
    await t
      .db!.update(campaignAttacks)
      .set({ resolvingSince: new Date(Date.now() - 60_000) })
      .where(eq(campaignAttacks.id, a.id));
    expect((await dice(alice, a, { stepId, results: [] })).statusCode).toBe(200);
  });

  it('lot du MJ : les étapes s’enchaînent seules, rapports prêts', async () => {
    const { h, gm, goblin, aria, brom, attacks } = s;
    t.character.rolls.push(15, 15);
    const { attacks: batch } = await h.ok<{ attacks: Attack[] }>(gm, 'POST', `${attacks}/batch`, {
      attacks: [
        { attackerId: goblin, action: 'epee', targets: [aria] },
        { attackerId: goblin, action: 'epee', targets: [brom] },
      ],
    });
    expect(batch.map((a) => [a.status, a.pendingSteps.length])).toEqual([
      ['pending', 0],
      ['pending', 0],
    ]);
  });

  it('défense active puis étapes : la première étape suit la dernière réaction', async () => {
    const { h, gm, bob, aria, brom, attacks } = s;
    t.character.actions.set('epee', {
      name: 'Épée',
      steps: true,
      reactionParams: (id) => (id === brom ? ['esquive'] : []),
    });
    const a = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: aria,
      action: 'epee',
      targets: [brom],
    });
    expect(a).toMatchObject({ status: 'awaiting_reactions', pendingSteps: [] });
    const reacted = await h.ok<Attack>(gm, 'POST', `${attacks}/${a.id}/reactions`, {
      characterId: brom,
      skip: true,
    });
    expect(reacted).toMatchObject({ status: 'awaiting_dice', pendingSteps: [{ phase: 'roll' }] });
    expect(reacted.resolving).toBeUndefined();
    // Bob (la cible) ne lance pas les dés de l'attaquant
    expect(
      (await dice(bob, reacted, { stepId: reacted.pendingSteps[0]!.id, results: [] })).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });
});
