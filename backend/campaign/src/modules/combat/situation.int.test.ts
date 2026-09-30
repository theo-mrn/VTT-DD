/**
 * Situation du combat (docs/combat.md § 5.7) sur un vrai PostgreSQL, avec le faux character :
 * participant surpris (démarrage, `PATCH`), décompte des attaques (`tally` : ce round et en
 * tout, attaques annulées écartées), vue d'un joueur (attaques publiques d'un attaquant vu
 * seulement, rien sur un participant caché), contexte `@combat.*` figé à la déclaration et
 * envoyé à character (sans l'attaque en cours, lot du MJ compris).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attackScene } from '../../test/attack-scene.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

interface Tally {
  attacksMadeRound: number;
  attacksMade: number;
  targetedRound: number;
  targeted: number;
}
interface Combat {
  round: number;
  version: number;
  redacted: boolean;
  order: { characterId: string; surprised?: boolean; hasActed: boolean; tally?: Tally }[];
}
interface Context {
  round: number;
  actor?: Tally & { hasActed: boolean; surprised: boolean };
  targets: (Tally & { characterId: string; hasActed: boolean; surprised: boolean })[];
}

const zero: Tally = { attacksMadeRound: 0, attacksMade: 0, targetedRound: 0, targeted: 0 };

describe.skipIf(!TEST_DATABASE_URL)('combat : situation', () => {
  let t: TestContext;
  let s: Awaited<ReturnType<typeof attackScene>>;

  beforeEach(async () => {
    t = await testApp();
    s = await attackScene(t);
  });

  afterEach(async () => {
    await t.close();
  });

  const of = (c: Combat, id: string) => c.order.find((p) => p.characterId === id);
  /** Contexte `combat` du dernier appel à la préparation. */
  const lastContext = () => {
    const calls = t.character.calls.filter((c) => c.path === '/internal/actions/prepare');
    return calls.at(-1)!.body.combat as Context | undefined;
  };

  it('surpris : au démarrage, puis corrigé par le MJ ; refusé hors du combat', async () => {
    const { h, gm, alice, aria, brom, goblin, shadow, combat } = s;
    const refus = await h.request(gm, 'POST', combat, {
      participants: [aria, goblin],
      surprised: [brom],
    });
    expect(refus.statusCode).toBe(400);
    const c = await h.ok<Combat>(gm, 'POST', combat, {
      participants: [aria, brom, goblin, shadow],
      hidden: [shadow],
      surprised: [goblin, shadow],
    });
    expect(c.order.map((p) => [p.characterId, p.surprised, p.tally])).toEqual([
      [aria, false, zero],
      [brom, false, zero],
      [goblin, true, zero],
      [shadow, true, zero],
    ]);
    const patched = await h.ok<Combat>(gm, 'PATCH', `${combat}/participants/${goblin}`, {
      surprised: false,
    });
    expect(of(patched, goblin)?.surprised).toBe(false);
    // Un joueur voit qui est surpris parmi ceux qu'il voit ; jamais le participant caché
    const vue = await h.ok<Combat>(alice, 'GET', combat);
    expect(vue.redacted).toBe(true);
    expect(of(vue, shadow)).toBeUndefined();
    expect(of(vue, goblin)?.surprised).toBe(false);
    expect(
      (await h.request(alice, 'PATCH', `${combat}/participants/${goblin}`, { surprised: true }))
        .statusCode,
    ).toBe(403);
  });

  it('décompte : ce round et en tout, annulées écartées ; vue d’un joueur ; round suivant', async () => {
    const { h, gm, alice, aria, brom, goblin, shadow, attacks, combat } = s;
    await h.ok(gm, 'POST', combat, {
      participants: [aria, brom, goblin, shadow],
      hidden: [shadow],
    });
    await h.ok(gm, 'POST', `${combat}/initiative`, {});
    // Aria attaque deux fois le gobelin (publiques)
    await h.ok(alice, 'POST', attacks, { attackerId: aria, action: 'attaque', targets: [goblin] });
    await h.ok(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'attaque',
      targets: [goblin, brom],
    });
    // Le MJ : le gobelin vise Brom en secret, l'ombre (cachée) vise Aria en public
    await h.ok(gm, 'POST', attacks, {
      attackerId: goblin,
      action: 'attaque',
      targets: [brom],
      visibility: 'gm',
    });
    await h.ok(gm, 'POST', attacks, {
      attackerId: shadow,
      action: 'attaque',
      targets: [aria],
      visibility: 'public',
    });
    // Une attaque annulée ne compte pas
    t.character.actions.set('tir', { name: 'Tir', reactionParams: () => ['esquive'] });
    const open = await h.ok<{ id: string }>(alice, 'POST', attacks, {
      attackerId: aria,
      action: 'tir',
      targets: [goblin],
    });
    await h.ok(alice, 'POST', `${attacks}/${open.id}/cancel`, {});

    const mj = await h.ok<Combat>(gm, 'GET', combat);
    expect(of(mj, aria)?.tally).toEqual({
      attacksMadeRound: 2,
      attacksMade: 2,
      targetedRound: 1,
      targeted: 1,
    });
    expect(of(mj, goblin)?.tally).toEqual({
      attacksMadeRound: 1,
      attacksMade: 1,
      targetedRound: 2,
      targeted: 2,
    });
    expect(of(mj, brom)?.tally).toMatchObject({ targeted: 2 });
    expect(of(mj, shadow)?.tally).toMatchObject({ attacksMade: 1 });

    // Un joueur : attaques publiques d'un attaquant qu'il voit (ni le secret du gobelin, ni l'ombre)
    const joueur = await h.ok<Combat>(alice, 'GET', combat);
    expect(of(joueur, aria)?.tally).toEqual({
      attacksMadeRound: 2,
      attacksMade: 2,
      targetedRound: 0,
      targeted: 0,
    });
    expect(of(joueur, goblin)?.tally).toMatchObject({ attacksMade: 0, targeted: 2 });
    expect(of(joueur, brom)?.tally).toMatchObject({ targeted: 1 });
    // Le détail de la campagne donne la même vue
    const detail = await h.ok<{ combat: Combat }>(alice, 'GET', `/v1/campaigns/${s.id}`);
    expect(of(detail.combat, brom)?.tally).toMatchObject({ targeted: 1 });

    // Round suivant : « ce round » repart de zéro, le total reste
    let c = mj;
    while (c.round === 1) c = await h.ok<Combat>(gm, 'POST', `${combat}/next`, {});
    expect(of(c, aria)?.tally).toEqual({ ...zero, attacksMade: 2, targeted: 1 });
  });

  it('contexte @combat figé à la déclaration, sans l’attaque en cours, lot compris', async () => {
    const { h, gm, alice, aria, brom, goblin, shadow, attacks, combat } = s;
    // Hors combat : aucun contexte
    await h.ok(alice, 'POST', attacks, { attackerId: aria, action: 'attaque', targets: [goblin] });
    expect(lastContext()).toBeUndefined();

    await h.ok(gm, 'POST', combat, {
      participants: [aria, brom, goblin],
      surprised: [goblin],
    });
    await h.ok(gm, 'POST', `${combat}/initiative`, {});
    await h.ok(alice, 'POST', attacks, { attackerId: aria, action: 'attaque', targets: [goblin] });
    const premier = lastContext()!;
    expect(premier.round).toBe(1);
    expect(premier.actor).toEqual({ ...zero, hasActed: false, surprised: false });
    expect(premier.targets).toEqual([
      { characterId: goblin, ...zero, hasActed: false, surprised: true },
    ]);

    // Deuxième attaque : la première compte, pas celle en cours ; une cible hors du combat
    // (l'ombre n'y participe pas) n'a pas de contexte ; le MJ attaque avec Aria
    await h.ok(gm, 'POST', attacks, {
      attackerId: aria,
      action: 'attaque',
      targets: [goblin, shadow],
    });
    const second = lastContext()!;
    expect(second.actor).toMatchObject({ attacksMade: 1, attacksMadeRound: 1 });
    expect(second.targets.map((x) => [x.characterId, x.targeted])).toEqual([[goblin, 1]]);

    // Lot du MJ : chaque attaque compte les précédentes du lot
    await h.ok(gm, 'POST', `${attacks}/batch`, {
      attacks: [
        { attackerId: goblin, action: 'attaque', targets: [aria] },
        { attackerId: goblin, action: 'attaque', targets: [brom] },
      ],
    });
    const lot = t.character.calls
      .filter((c) => c.path === '/internal/actions/prepare')
      .slice(-2)
      .map((c) => c.body.combat as Context);
    expect(lot.map((x) => x.actor?.attacksMade)).toEqual([0, 1]);
    expect(lot[0]!.targets[0]).toMatchObject({ characterId: aria, targeted: 0 });

    // A agi ce round : après son tour
    let c = await h.ok<Combat>(gm, 'GET', combat);
    const first = c.order[0]!.characterId;
    c = await h.ok<Combat>(gm, 'POST', `${combat}/next`, {});
    await h.ok(gm, 'POST', attacks, { attackerId: goblin, action: 'attaque', targets: [first] });
    expect(lastContext()!.targets[0]).toMatchObject({ characterId: first, hasActed: true });
  });
});
