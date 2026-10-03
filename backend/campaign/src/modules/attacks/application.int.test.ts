/**
 * Rapports et décisions du MJ (docs/combat.md § 7) sur un vrai PostgreSQL, avec le faux
 * character : appliquer (tel quel, corrigé, réattribué, tables), ne pas appliquer, écarter,
 * coûts de l'attaquant, hors de combat, annuler (conflit, forçage), revue groupée tout ou
 * rien, idempotence et reprise d'une application interrompue, fin de combat.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignAttackApplications } from '../../db/schema.js';
import { attackScene, leaks } from '../../test/attack-scene.js';
import { SECRET, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

interface Applied {
  applicationId: string;
  modifications: Record<string, unknown>[];
  tables: { table: string; entry: string | null }[];
  redirectedTo: string | null;
  defeated: boolean;
}
interface Target {
  characterId: string;
  status: string;
  decision: string;
  applied?: Applied | null;
}
interface Attack {
  id: string;
  status: string;
  targets: Target[];
  actor?: { modifications: unknown[]; decision: string; applied: Applied | null } | null;
  note?: string | null;
  decidedAt: string | null;
  version: number;
}

describe.skipIf(!TEST_DATABASE_URL)('attaques : rapports et décisions du MJ', () => {
  let t: TestContext;
  let s: Awaited<ReturnType<typeof attackScene>>;

  beforeEach(async () => {
    t = await testApp();
    s = await attackScene(t);
  });

  afterEach(async () => {
    await t.close();
  });

  const values = (id: string) => t.character.characters.get(id)!.values!;

  /** Attaque résolue du gobelin (ou d'un autre) contre ces cibles, d20 imposés. */
  async function strike(
    targets: string[],
    opts: { rolls?: number[]; params?: Record<string, unknown>; attackerId?: string } = {},
  ) {
    t.character.rolls.push(...(opts.rolls ?? targets.map(() => 18)));
    return s.h.ok<Attack>(s.gm, 'POST', s.attacks, {
      attackerId: opts.attackerId ?? s.goblin,
      action: 'attaque',
      params: { degats: 4, ...opts.params },
      targets,
      visibility: 'public',
    });
  }
  const apply = (a: Attack, body: Record<string, unknown>) =>
    s.h.request(s.gm, 'POST', `${s.attacks}/${a.id}/apply`, { version: a.version, ...body });

  it('appliquer sans relancer : une cible, puis l’autre ; décisions et événements', async () => {
    const { h, gm, alice, bob, aria, brom, attacks } = s;
    const a = await strike([aria, brom]);
    const resolves = s.callsTo('/internal/actions/resolve').length;

    let res = await apply(a, { targets: [{ characterId: aria, apply: true }], note: 'Touché net' });
    expect(res.statusCode, res.body).toBe(200);
    let r = res.json() as Attack;
    expect(r.status).toBe('pending');
    expect(r.targets[0]).toMatchObject({
      decision: 'applied',
      applied: {
        modifications: [
          expect.objectContaining({ attribute: 'PV', operation: 'subtract', value: 4 }),
        ],
        tables: [],
        redirectedTo: null,
        defeated: false,
      },
    });
    expect(r.targets[1]!.decision).toBe('pending');
    expect(values(aria).PV).toBe(16);
    // Aucun dé : pas de nouvelle résolution ; une seule application, sans `entity`
    expect(s.callsTo('/internal/actions/resolve')).toHaveLength(resolves);
    const [call] = s.callsTo('/internal/modifications/apply');
    expect(call!.body).toEqual({
      applications: [
        {
          applicationId: r.targets[0]!.applied!.applicationId,
          userId: gm.id,
          campaignId: s.id,
          items: [
            {
              characterId: aria,
              modifications: [
                { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 4 },
              ],
            },
          ],
        },
      ],
    });

    // Déjà décidée ; version périmée
    expect(
      (await apply(r, { targets: [{ characterId: aria, apply: true }] })).json(),
    ).toMatchObject({ status: 409, code: 'already_decided' });
    expect(
      (await apply(a, { targets: [{ characterId: brom, apply: true }] })).json(),
    ).toMatchObject({ status: 409, code: 'version_conflict' });
    // Ne pas appliquer la seconde : tout est décidé, au moins une appliquée
    r = (await apply(r, { targets: [{ characterId: brom, apply: false }] })).json() as Attack;
    expect(r).toMatchObject({ status: 'applied', note: 'Touché net' });
    expect(r.decidedAt).toBeTruthy();
    expect(r.targets[1]).toMatchObject({ decision: 'skipped', applied: null });
    expect(values(brom).PV).toBe(18);
    expect(s.callsTo('/internal/modifications/apply')).toHaveLength(1);

    // Événements : décision complète aux MJ ; conclusion publique avec les montants du camp
    // des joueurs ; l'auteur (MJ) et les joueurs ciblés ne reçoivent rien de secret
    const decided = (await s.events()).filter((e) => e.type === 'combat.attack_decided');
    expect(decided.map((e) => e.visibility)).toEqual(['gm_only', 'gm_only']);
    const concluded = (await s.events()).filter((e) => e.type === 'combat.attack_concluded');
    expect(concluded[0]!.payload.targets).toEqual([
      {
        characterId: aria,
        decision: 'applied',
        amounts: [{ attribute: 'PV', value: -4 }],
      },
    ]);
    for (const u of [alice, bob]) expect(leaks(await s.receivedBy(u))).toEqual([]);
    // Le joueur de la cible ne lit pas le rapport du MJ
    expect((await h.request(alice, 'GET', `${attacks}/${a.id}`)).statusCode).toBe(404);
  });

  it('corriger, réattribuer, tables, coûts de l’attaquant, modification refusée', async () => {
    const { aria, brom, goblin } = s;
    // Un 20 : critique, table des blessures tirée ; coût de 2 en Stress pour le gobelin
    const a = await strike([aria, brom], { rolls: [20, 20], params: { cout: 2 } });

    // Attribut inconnu : 422, rien n'est écrit, la réservation disparaît
    const bad = await apply(a, {
      targets: [
        {
          characterId: aria,
          apply: true,
          modifications: [{ kind: 'attribute', attribute: 'Inconnu', operation: 'add', value: 1 }],
        },
      ],
    });
    expect(bad.json()).toMatchObject({
      status: 422,
      code: 'invalid_modification',
      errors: [{ path: aria, message: 'attribut inconnu' }],
    });
    expect(values(aria).PV).toBe(20);
    expect(
      await t
        .db!.select()
        .from(campaignAttackApplications)
        .where(eq(campaignAttackApplications.attackId, a.id)),
    ).toEqual([]);

    // Moitié des dégâts pour Aria, sans la blessure ; Brom : réattribué à Aria, autre entrée
    const res = await apply(a, {
      targets: [
        {
          characterId: aria,
          apply: true,
          modifications: [{ kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 2 }],
          tables: [{ table: 'critiques', apply: false }],
        },
        {
          characterId: brom,
          apply: true,
          redirectTo: goblin,
          tables: [{ table: 'critiques', apply: true, entry: 'oeil-creve' }],
        },
      ],
      actor: { apply: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    const r = res.json() as Attack;
    expect(r.status).toBe('applied');
    expect(values(aria).PV).toBe(18);
    expect(values(brom).PV).toBe(18);
    expect(values(goblin)).toMatchObject({ PV: 3, Stress: 2 });
    expect(t.character.characters.get(goblin)!.entries).toEqual(['oeil-creve']);
    expect(r.targets[1]!.applied).toMatchObject({
      redirectedTo: goblin,
      tables: [{ table: 'critiques', entry: 'oeil-creve' }],
    });
    expect(r.actor).toMatchObject({ decision: 'applied', applied: { redirectedTo: null } });
    const [, call] = s.callsTo('/internal/modifications/apply');
    const items = (call!.body.applications as { items: Record<string, unknown>[] }[])[0]!.items;
    expect(items).toEqual([
      {
        characterId: aria,
        modifications: [{ kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 2 }],
      },
      {
        characterId: goblin,
        modifications: [
          { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 4 },
          { kind: 'attribute', attribute: 'Stress', operation: 'add', value: 2 },
        ],
        tables: [{ table: 'critiques', entry: 'oeil-creve' }],
      },
    ]);
    // Table non tirée, réattribution hors campagne
    const b = await strike([aria]);
    expect(
      (
        await apply(b, {
          targets: [{ characterId: aria, apply: true, tables: [{ table: 'autre', apply: true }] }],
        })
      ).json(),
    ).toMatchObject({ status: 400, code: 'unknown_table' });
    expect(
      (
        await apply(b, {
          targets: [{ characterId: aria, apply: true, redirectTo: crypto.randomUUID() }],
        })
      ).json(),
    ).toMatchObject({ status: 422, code: 'character_not_engaged' });
  });

  it('hors de combat : participant grisé, événement au MJ ; écarter le reste', async () => {
    const { h, gm, alice, aria, brom, goblin, combat } = s;
    await h.ok(gm, 'POST', combat, { participants: [aria, brom, goblin] });
    await h.ok(gm, 'POST', `${combat}/initiative`, {});
    t.character.rolls.push(19);
    const a = await h.ok<Attack>(alice, 'POST', s.attacks, {
      attackerId: aria,
      action: 'attaque',
      params: { degats: 9 },
      targets: [goblin],
    });
    const full = await h.ok<Attack>(gm, 'GET', `${s.attacks}/${a.id}`);
    const r = (
      await apply(full, { targets: [{ characterId: goblin, apply: true }] })
    ).json() as Attack;
    expect(r.targets[0]!.applied!.defeated).toBe(true);
    const state = await h.ok<{ order: { characterId: string; defeated: boolean }[] }>(
      gm,
      'GET',
      combat,
    );
    expect(state.order.find((p) => p.characterId === goblin)!.defeated).toBe(true);
    const defeated = await s.events('combat.participant_defeated');
    expect(defeated).toEqual([
      expect.objectContaining({
        visibility: 'gm_only',
        payload: expect.objectContaining({ characterId: goblin, attackId: a.id }),
      }),
    ]);
    // Alice (auteur) voit la décision, sans les montants appliqués au PNJ
    const mine = await h.ok<Attack>(alice, 'GET', `${s.attacks}/${a.id}`);
    expect(mine.targets[0]).toMatchObject({ decision: 'applied' });
    expect(mine.targets[0]).not.toHaveProperty('applied');

    // Écarter : rien d'appliqué, toutes les cibles décidées
    const b = await strike([aria, brom]);
    expect(
      (await h.request(alice, 'POST', `${s.attacks}/${b.id}/dismiss`, { version: b.version }))
        .statusCode,
    ).toBe(403);
    const dismissed = await h.ok<Attack>(gm, 'POST', `${s.attacks}/${b.id}/dismiss`, {
      version: b.version,
      note: 'Raté narratif',
    });
    expect(dismissed).toMatchObject({ status: 'dismissed', note: 'Raté narratif' });
    expect(dismissed.targets.map((x) => x.decision)).toEqual(['skipped', 'skipped']);
    expect(
      (
        await h.request(gm, 'POST', `${s.attacks}/${b.id}/dismiss`, { version: dismissed.version })
      ).json(),
    ).toMatchObject({ status: 409, code: 'already_decided' });
    const decided = (await s.events()).filter(
      (e) => e.type === 'combat.attack_decided' && e.payload.attackId === b.id,
    );
    expect(decided[0]!.payload.applicationId).toBeNull();

    // Fin du combat en écartant les rapports en attente
    const c = await strike([aria]);
    await h.ok(gm, 'POST', `${combat}/end`, { pendingAttacks: 'dismiss' });
    expect((await h.ok<Attack>(gm, 'GET', `${s.attacks}/${c.id}`)).status).toBe('dismissed');
  });

  it('annuler : valeurs rendues, décision à refaire ; conflit si la fiche a changé, forçage', async () => {
    const { h, aria, brom } = s;
    const a = await strike([aria, brom], { params: { cout: 1 } });
    let r = (
      await apply(a, {
        targets: [
          { characterId: aria, apply: true },
          { characterId: brom, apply: true },
        ],
        actor: { apply: true },
      })
    ).json() as Attack;
    expect(values(aria).PV).toBe(16);
    expect(values(brom).PV).toBe(14);
    expect(values(s.goblin).Stress).toBe(1);
    const url = `${s.attacks}/${a.id}/revert`;
    expect((await h.request(s.gm, 'POST', url, { version: a.version })).json()).toMatchObject({
      status: 409,
      code: 'version_conflict',
    });

    // Aria seule : Brom et les coûts restent appliqués
    r = await h.ok<Attack>(s.gm, 'POST', url, { version: r.version, targets: [aria] });
    expect(r.status).toBe('pending');
    expect(r.targets.map((x) => x.decision)).toEqual(['reverted', 'applied']);
    expect(r.targets[0]!.applied).toBeNull();
    expect(values(aria).PV).toBe(20);
    expect(values(brom).PV).toBe(14);
    const [revert] = s.callsTo('/internal/modifications/revert');
    expect(revert!.body).toMatchObject({ characterIds: [aria], userId: s.gm.id });
    expect(revert!.secret).toBe(SECRET);

    // La fiche de Brom a changé depuis : 409 avec les chemins en cause, rien n'est rendu
    values(brom).PV = 10;
    const conflict = await h.request(s.gm, 'POST', url, { version: r.version, targets: [brom] });
    expect(conflict.json()).toMatchObject({
      status: 409,
      code: 'revert_conflict',
      conflicts: [{ characterId: brom, paths: ['etat.valeurs.PV'] }],
    });
    expect(values(brom).PV).toBe(10);
    // Forcé : rendu quand même ; puis tout le reste (les coûts)
    r = await h.ok<Attack>(s.gm, 'POST', url, { version: r.version, targets: [brom], force: true });
    expect(values(brom).PV).toBe(18);
    r = await h.ok<Attack>(s.gm, 'POST', url, { version: r.version });
    expect(r.actor).toMatchObject({ decision: 'reverted', applied: null });
    expect(values(s.goblin).Stress).toBe(0);
    expect((await h.request(s.gm, 'POST', url, { version: r.version })).json()).toMatchObject({
      status: 409,
      code: 'nothing_to_revert',
    });
    const reverted = await s.events('combat.attack_reverted');
    expect(reverted.map((e) => [e.visibility, e.payload.forced])).toEqual([
      ['gm_only', false],
      ['gm_only', true],
      ['gm_only', false],
    ]);

    // Décider de nouveau, sans relancer : les valeurs du rapport
    r = (
      await apply(r, {
        targets: [
          { characterId: aria, apply: true },
          { characterId: brom, apply: false },
        ],
        actor: { apply: false },
      })
    ).json() as Attack;
    expect(r.status).toBe('applied');
    expect(values(aria).PV).toBe(16);
  });

  it('revue groupée : une application par rapport, un seul appel, tout ou rien', async () => {
    const { h, aria, brom } = s;
    const a = await strike([aria]);
    const b = await strike([brom]);
    const bulk = `${s.attacks}/apply`;
    // Une version périmée : rien n'est appliqué
    expect(
      (
        await h.request(s.gm, 'POST', bulk, {
          items: [
            { attackId: a.id, version: a.version, targets: [{ characterId: aria, apply: true }] },
            { attackId: b.id, version: 99, targets: [{ characterId: brom, apply: true }] },
          ],
        })
      ).json(),
    ).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(s.callsTo('/internal/modifications/apply')).toHaveLength(0);
    // Panne de character : 502, rien n'est décidé, on peut recommencer
    t.character.behaviour.down = new Set(['/internal/modifications/apply']);
    const items = [
      { attackId: a.id, version: a.version, targets: [{ characterId: aria, apply: true }] },
      { attackId: b.id, version: b.version, targets: [{ characterId: brom, apply: true }] },
    ];
    expect((await h.request(s.gm, 'POST', bulk, { items })).json()).toMatchObject({
      status: 502,
      code: 'character_unavailable',
    });
    t.character.behaviour.down = undefined;
    const done = await h.ok<{ attacks: Attack[] }>(s.gm, 'POST', bulk, { items });
    expect(done.attacks.map((x) => x.status)).toEqual(['applied', 'applied']);
    const calls = s.callsTo('/internal/modifications/apply');
    expect(calls.at(-1)!.body.applications as unknown[]).toHaveLength(2);
    expect(values(aria).PV).toBe(16);
    expect(values(brom).PV).toBe(14);
  });

  it('application interrompue (panne entre character et campaign) : reprise sans double effet', async () => {
    const { h, aria } = s;
    const a = await strike([aria]);
    const full = await h.ok<Attack & { targets: { result: { modifications: unknown[] } }[] }>(
      s.gm,
      'GET',
      `${s.attacks}/${a.id}`,
    );
    // character a appliqué, campaign est tombé avant d'enregistrer : réservation restée ouverte
    const applicationId = '01900000-0000-7000-8000-000000000001';
    const item = {
      characterId: aria,
      modifications: [{ kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 4 }],
    };
    const res = await fetch(new URL('/internal/modifications/apply', t.character.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({
        applications: [{ applicationId, campaignId: s.id, items: [item] }],
      }),
    });
    expect(res.status).toBe(200);
    expect(values(aria).PV).toBe(16);
    await t.db!.insert(campaignAttackApplications).values({
      id: applicationId,
      attackId: a.id,
      campaignId: s.id,
      status: 'applying',
      decisions: [
        {
          targetId: aria,
          apply: true,
          characterIds: [aria],
          applied: {
            applicationId,
            modifications: full.targets[0]!.result.modifications as never,
            tables: [],
            redirectedTo: null,
            defeated: false,
            appliedBy: s.gm.id,
            appliedAt: new Date().toISOString(),
          },
          reverted: false,
        },
      ],
      items: [item],
      createdBy: s.gm.id,
      createdAt: new Date(Date.now() - 60_000),
    });
    // Décision suivante : la réservation est reprise (même identifiant, rejoué par character),
    // puis la nouvelle décision est refusée car le rapport a changé
    expect(
      (await apply(a, { targets: [{ characterId: aria, apply: false }] })).json(),
    ).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(values(aria).PV).toBe(16);
    const r = await h.ok<Attack>(s.gm, 'GET', `${s.attacks}/${a.id}`);
    expect(r).toMatchObject({ status: 'applied' });
    expect(r.targets[0]!.applied!.applicationId).toBe(applicationId);
    const [row] = await t
      .db!.select()
      .from(campaignAttackApplications)
      .where(eq(campaignAttackApplications.id, applicationId));
    expect(row!.status).toBe('applied');
  });
});
