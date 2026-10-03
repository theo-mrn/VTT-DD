/**
 * Attaque calculée dans le navigateur de l'attaquant (décision de Théo, 2026-09-30) : la
 * déclaration porte le rapport déjà résolu (`resolved`), rangé tel quel en attente du MJ, sans
 * préparation ni résolution par character. Mêmes contrôles de droits (attaquant incarné, cibles
 * vues, tour), idempotence, mêmes événements ; le joueur ne reçoit que la vue de l'attaquant ;
 * le jet part à l'historique des dés depuis les vues ; le MJ applique comme avant.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attackScene, leaks } from '../../test/attack-scene.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

interface Target {
  characterId: string;
  status: string;
  decision: string;
  view?: { outcome: { success: boolean }; values: { key: string; value: unknown }[] } | null;
  result?: { variables: Record<string, unknown>; modifications: unknown[] } | null;
  error?: string | null;
}
interface Attack {
  id: string;
  attackerId: string;
  action: { id: string; name: string };
  rollMode: string;
  status: string;
  visibility: string;
  outOfTurn: boolean;
  pendingSteps: unknown[];
  targets: Target[];
  actor?: { modifications: unknown[]; decision: string } | null;
  version: number;
  redacted: boolean;
}

const roll = (d20: number, total: number) => ({
  kind: 'numeric',
  formula: '1d20 + 2',
  dice: [{ faces: 20, values: [{ value: d20, kept: true, exploded: false, source: 'server' }] }],
  value: total,
  bonuses: [],
  total,
  natural: d20,
});

/** Rapport d'une cible touchée : 6 dégâts, la Défense de la cible dans les variables. */
function hit(characterId: string) {
  const outcome = { success: true, critical: false, fumble: false };
  return {
    characterId,
    status: 'resolved',
    result: {
      outcome,
      roll: roll(16, 18),
      variables: { defenseCible: 17, degats: 6 },
      modifications: [
        { kind: 'attribute', entity: 'target', attribute: 'PV', operation: 'subtract', value: 6 },
      ],
      tables: [],
      explanations: ['Défense de la cible : 17', 'Touché : 6 dégâts'],
      errors: [],
    },
    view: {
      outcome,
      roll: roll(16, 18),
      values: [{ key: 'degats', name: 'Dégâts', value: 6 }],
      explanations: ['Touché : 6 dégâts'],
    },
  };
}

describe.skipIf(!TEST_DATABASE_URL)('attaques calculées par le navigateur', () => {
  let t: TestContext;
  let s: Awaited<ReturnType<typeof attackScene>>;

  beforeEach(async () => {
    t = await testApp();
    s = await attackScene(t);
  });

  afterEach(async () => {
    await t.close();
  });

  const resolvedBody = (attackerId: string, targets: string[], extra: object = {}) => ({
    attackerId,
    action: 'attaque',
    params: { bonus: 2 },
    targets,
    resolved: { actionName: 'Attaque', targets: targets.map(hit) },
    ...extra,
  });

  it('rapport rangé en attente du MJ, vue expurgée pour le joueur, jet relayé, puis appliqué', async () => {
    const { h, gm, alice, bob, aria, goblin, attacks } = s;
    const res = await h.request(alice, 'POST', attacks, resolvedBody(aria, [goblin]));
    expect(res.statusCode, res.body).toBe(201);
    const mine = res.json() as Attack;
    expect(mine).toMatchObject({
      attackerId: aria,
      action: { id: 'attaque', name: 'Attaque' },
      rollMode: 'per_target',
      status: 'pending',
      visibility: 'public',
      pendingSteps: [],
      redacted: true,
    });
    expect(mine.targets).toEqual([
      expect.objectContaining({
        characterId: goblin,
        status: 'resolved',
        decision: 'pending',
        view: expect.objectContaining({ values: [expect.objectContaining({ value: 6 })] }),
      }),
    ]);
    expect(mine.targets[0]).not.toHaveProperty('result');
    expect(mine).not.toHaveProperty('actor');
    expect(leaks(mine)).toEqual([]);

    // character n'a rien préparé ni résolu ; le jet part à l'historique depuis la vue
    expect(s.callsTo('/internal/actions/prepare')).toHaveLength(0);
    expect(s.callsTo('/internal/actions/resolve')).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 50));
    const [forwarded] = s.callsTo('/internal/actions/rolls');
    expect(forwarded!.body).toMatchObject({
      campaignId: s.id,
      authorId: alice.id,
      characterId: aria,
      visibility: 'public',
      action: 'attaque',
      rollMode: 'per_target',
    });
    expect(leaks(forwarded!.body)).toEqual([]);

    // Le MJ a le rapport complet ; les événements sont ceux d'une attaque résolue
    const full = await h.ok<Attack>(gm, 'GET', `${attacks}/${mine.id}`);
    expect(full.targets[0]!.result!.variables).toMatchObject({ defenseCible: 17 });
    expect(full.actor).toEqual({ modifications: [], decision: 'pending', applied: null });
    const types = (await s.events()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'combat.attack_updated',
        'combat.attack_resolved',
        'combat.attack_announced',
      ]),
    );
    const updated = (await s.events()).find((e) => e.type === 'combat.attack_updated')!;
    expect(updated.payload).toMatchObject({ change: 'resolved', visibleToUsers: [alice.id] });
    for (const u of [alice, bob]) expect(leaks(await s.receivedBy(u))).toEqual([]);

    // Le MJ applique : inchangé (character applique les modifications du rapport)
    const applied = await h.ok<Attack>(gm, 'POST', `${attacks}/${mine.id}/apply`, {
      version: full.version,
      targets: [{ characterId: goblin, apply: true }],
    });
    expect(applied.status).toBe('applied');
    const [apply] = s.callsTo('/internal/modifications/apply');
    expect(apply!.body).toMatchObject({
      applications: [
        {
          items: [
            {
              characterId: goblin,
              modifications: [expect.objectContaining({ attribute: 'PV', value: 6 })],
            },
          ],
        },
      ],
    });
  });

  it('droits : personnage non incarné, cible cachée, tour ; rapport incohérent refusé', async () => {
    const { h, gm, alice, aria, brom, goblin, shadow, attacks, combat } = s;
    expect((await h.request(alice, 'POST', attacks, resolvedBody(brom, [goblin]))).statusCode).toBe(
      403,
    );
    expect(
      (await h.request(alice, 'POST', attacks, resolvedBody(aria, [shadow]))).json(),
    ).toMatchObject({ status: 404, code: 'target_not_found' });

    // Cibles du rapport différentes de la déclaration : 400
    const mismatch = await h.request(alice, 'POST', attacks, {
      ...resolvedBody(aria, [goblin]),
      resolved: { actionName: 'Attaque', targets: [hit(brom)] },
    });
    expect(mismatch.json()).toMatchObject({ status: 400, code: 'invalid_resolution' });
    // Cible résolue sans sa vue : 400
    const { view: _view, ...noView } = hit(goblin);
    const incomplete = await h.request(alice, 'POST', attacks, {
      ...resolvedBody(aria, [goblin]),
      resolved: { actionName: 'Attaque', targets: [noView] },
    });
    expect(incomplete.json()).toMatchObject({ status: 400, code: 'invalid_resolution' });

    // En combat, hors tour interdit par le réglage : 409, rien d'écrit
    await h.ok(gm, 'POST', combat, {
      participants: [aria, brom, goblin],
      settings: { playersActOutsideTurn: false },
    });
    const state = await h.ok<{ order: { characterId: string }[]; currentIndex: number }>(
      gm,
      'GET',
      combat,
    );
    // Le héros dont ce n'est pas le tour (Aria ou Brom, selon l'ordre)
    const current = state.order[state.currentIndex]?.characterId;
    const [who, as] = current === aria ? ([s.bob, brom] as const) : ([alice, aria] as const);
    expect(
      (await h.request(who, 'POST', attacks, resolvedBody(as, [goblin]))).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    expect(s.callsTo('/internal/actions/prepare')).toHaveLength(0);
  });

  it('idempotence : même clé, même attaque, un seul jet relayé', async () => {
    const { h, alice, aria, goblin, attacks } = s;
    const key = crypto.randomUUID();
    const send = () =>
      t.app.inject({
        method: 'POST',
        url: attacks,
        headers: { ...alice.auth, 'idempotency-key': key },
        payload: resolvedBody(aria, [goblin]),
      });
    const first = await send();
    expect(first.statusCode, first.body).toBe(201);
    const again = await send();
    expect(again.json().id).toBe(first.json().id);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.callsTo('/internal/actions/rolls')).toHaveLength(1);
    expect((await h.ok<{ attacks: unknown[] }>(alice, 'GET', attacks)).attacks).toHaveLength(1);
  });

  it('une cible refusée par les règles : les autres restent, le MJ attaque caché par défaut', async () => {
    const { h, gm, aria, brom, goblin, attacks } = s;
    const a = await h.ok<Attack>(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'attaque',
      targets: [aria, brom],
      rollMode: 'shared',
      resolved: {
        actionName: 'Attaque',
        targets: [hit(aria), { characterId: brom, status: 'failed', error: 'Hors de portée' }],
        actor: {
          modifications: [
            { kind: 'attribute', entity: 'actor', attribute: 'Stress', operation: 'add', value: 1 },
          ],
        },
      },
    });
    expect(a).toMatchObject({ status: 'pending', visibility: 'gm', rollMode: 'shared' });
    expect(a.targets.map((x) => [x.characterId, x.status, x.error ?? null])).toEqual([
      [aria, 'resolved', null],
      [brom, 'failed', 'Hors de portée'],
    ]);
    expect(a.actor).toMatchObject({ decision: 'pending', modifications: [expect.anything()] });
    await new Promise((r) => setTimeout(r, 50));
    const [forwarded] = s.callsTo('/internal/actions/rolls');
    expect(forwarded!.body).toMatchObject({ visibility: 'gm', rollMode: 'shared' });
    expect(forwarded!.body.views as unknown[]).toHaveLength(1);
  });
});
