/**
 * Attaque calculée dans le navigateur (docs/combat.md § 5.4, décision de Théo du 2026-09-30) :
 * D&D en deux écrans (le d20, puis l'arme et ses dégâts), raté sans suite, Star Wars en une
 * étape, défense active renvoyée au serveur, rapport conforme au contrat, vue du joueur sans le
 * rapport complet, contexte `@combat.*` tiré de l'état du combat. Faces imposées.
 */
import { DeclareAttack, type CombatState, type RollStep } from '@vtt/contracts';
import { calculer, EtatEntite, type EtatEntiteSaisi, type SystemeCharge } from '@vtt/rules';
import { systeme as systemeDe } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import {
  combatContextOf,
  continueLocal,
  isFinished,
  isLocalAttack,
  localAttackOf,
  LocalRefusal,
  needsReaction,
  resolvedReport,
  startLocal,
  type DiceRoller,
  type LocalAttackMeta,
} from './local-attack';

function fabrique(systeme: SystemeCharge) {
  const version = { id: systeme.source.id, version: systeme.source.version };
  return (saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>) =>
    calculer(
      systeme,
      EtatEntite.parse({ type: 'personnage', systeme: version, creation: false, ...saisi }),
    );
}

/** Faces imposées dans l'ordre ; `steps` garde chaque étape lancée. */
function imposed(...faces: number[]) {
  const steps: RollStep[] = [];
  const roll: DiceRoller = (step) => {
    steps.push(step);
    return step.dice.map((d) => ({ id: d.id, value: Math.min(faces.shift() ?? 1, d.faces) }));
  };
  return { roll, steps };
}

const A = '00000000-0000-4000-8000-00000000000a';
const T1 = '00000000-0000-4000-8000-0000000000b1';
const T2 = '00000000-0000-4000-8000-0000000000b2';
const CAMPAIGN = '00000000-0000-4000-8000-0000000000c0';

const meta = (gm: boolean): LocalAttackMeta => ({
  id: 'local-essai',
  campaignId: CAMPAIGN,
  combat: null,
  attackerId: A,
  actionName: 'Attaque avec une arme',
  visibility: 'public',
  gm,
  userId: A,
});

describe('D&D : le d20, puis l’arme et les dégâts, sans appel réseau', () => {
  const systeme = systemeDe('dnd-classic');
  const fiche = fabrique(systeme);
  const hero = fiche({
    valeurs: { FOR: 14, DEX: 10, CON: 14, INT: 8, SAG: 10, CHA: 10 },
    possessions: [{ entree: 'epee-longue' }],
  });
  const goblin = () =>
    fiche({ valeurs: { FOR: 8, DEX: 12, CON: 10, INT: 8, SAG: 8, CHA: 8, jetsDeVie: 6 } });
  const input = (targets = [{ id: T1, fiche: goblin() }]) => ({
    systeme,
    actionId: 'attaque',
    actor: hero,
    targets,
    params: { score: 'Contact' },
    rollMode: 'per_target' as const,
  });
  const weapon = { arme: 'epee-longue', capacite: '', nbDes: 1, faces: 6, bonus: 0 };

  it('écran 1 : TOUCHÉ (critique), l’arme demandée ; écran 2 : dégâts doublés, rapport', async () => {
    const dice = imposed(20, 4, 3);
    const s1 = await startLocal(input(), dice.roll);
    expect(dice.steps.map((s) => s.phase)).toEqual(['roll']);
    expect(dice.steps[0]!.dice).toEqual([expect.objectContaining({ targetId: T1, faces: 20 })]);
    expect(isFinished(s1)).toBe(false);
    expect(s1.last.step).toMatchObject({
      phase: 'after',
      dice: [],
      params: ['arme', 'capacite', 'nbDes', 'faces', 'bonus'],
    });
    expect(s1.last.targets[0]).toMatchObject({
      status: 'awaiting_dice',
      view: { outcome: { success: true, critical: true }, values: [] },
    });

    // L'écran du menu : l'attaque en attente de l'arme, vue de l'attaquant seule pour un joueur
    const shown = localAttackOf(s1, meta(false));
    expect(isLocalAttack(shown)).toBe(true);
    expect(shown).toMatchObject({ status: 'awaiting_dice', redacted: true });
    expect(shown.pendingSteps).toEqual([s1.last.step]);
    expect(shown.targets[0]).not.toHaveProperty('result');
    expect(shown).not.toHaveProperty('actor');

    // Paramètres de l'étape : tous, et seulement eux
    expect(() => continueLocal(s1, { arme: 'epee-longue' }, dice.roll)).toThrow(LocalRefusal);

    const s2 = await continueLocal(s1, weapon, dice.roll);
    expect(dice.steps.map((s) => [s.phase, s.dice.map((d) => d.faces)])).toEqual([
      ['roll', [20]],
      ['after', [8, 8]],
    ]);
    expect(isFinished(s2)).toBe(true);
    expect(s2.params).toMatchObject({ score: 'Contact', arme: 'epee-longue' });
    const [t] = s2.last.targets;
    expect(t!.status).toBe('resolved');
    const damage = Number(t!.view!.values.find((v) => v.key === 'degats')?.value);
    expect(damage).toBeGreaterThanOrEqual(7);
    expect(t!.result!.modifications).toEqual([
      expect.objectContaining({ kind: 'attribute', attribute: 'PV', operation: 'subtract' }),
    ]);
    // La vue de l'attaquant ne nomme jamais une valeur de la cible
    expect(JSON.stringify(t!.view)).not.toMatch(/"PV"|jetsDeVie/);

    // Rapport envoyé à la fin : conforme au contrat, cibles dans l'ordre de la déclaration
    const body = DeclareAttack.parse({
      attackerId: A,
      action: 'attaque',
      params: s2.params,
      targets: [T1],
      resolved: resolvedReport(s2, 'Attaque avec une arme'),
    });
    expect(body.resolved!.targets).toEqual([
      expect.objectContaining({ characterId: T1, status: 'resolved' }),
    ]);
  });

  it('mêmes faces, même résultat (le moteur est déterministe)', async () => {
    const a = await continueLocal(
      await startLocal(input(), imposed(18, 5).roll),
      weapon,
      imposed(5).roll,
    );
    const b = await continueLocal(
      await startLocal(input(), imposed(18, 5).roll),
      weapon,
      imposed(5).roll,
    );
    expect(a.last).toEqual(b.last);
  });

  it('raté : pas d’étape de dégâts, rapport tout de suite', async () => {
    const dice = imposed(1);
    const s = await startLocal(input(), dice.roll);
    expect(isFinished(s)).toBe(true);
    expect(dice.steps).toHaveLength(1);
    expect(s.last.targets[0]).toMatchObject({
      status: 'resolved',
      view: { outcome: { success: false } },
    });
  });

  it('deux cibles, jet par cible : les dégâts de la seule touchée', async () => {
    const dice = imposed(20, 1, 6, 6);
    const s1 = await startLocal(
      input([
        { id: T1, fiche: goblin() },
        { id: T2, fiche: goblin() },
      ]),
      dice.roll,
    );
    expect(s1.last.targets.map((t) => [t.status, t.view?.outcome.success])).toEqual([
      ['awaiting_dice', true],
      ['resolved', false],
    ]);
    const s2 = await continueLocal(s1, weapon, dice.roll);
    expect(dice.steps[1]!.dice.every((d) => d.targetId === T1)).toBe(true);
    expect(s2.last.targets.map((t) => t.status)).toEqual(['resolved', 'resolved']);
  });

  it('refus des règles : l’attaque ne part pas', async () => {
    await expect(
      startLocal({ ...input(), params: { score: 'Contact', double: true } }, imposed(20).roll),
    ).rejects.toThrow(LocalRefusal);
  });

  it('la vue du MJ garde le rapport complet et les coûts', async () => {
    const s = await startLocal(input(), imposed(1).roll);
    const shown = localAttackOf(s, meta(true));
    expect(shown).toMatchObject({ status: 'pending', redacted: false, pendingSteps: [] });
    expect(shown.targets[0]!.result).toBeTruthy();
    expect(shown.actor).toEqual({ modifications: [], decision: 'pending' });
  });
});

describe('Star Wars : la réserve en une étape, défense active au serveur', () => {
  const systeme = systemeDe('star-wars-eote');
  const fiche = fabrique(systeme);
  const shooter = fiche({
    possessions: [
      { entree: 'bothan' },
      { entree: 'fusil-blaster' },
      { entree: 'distance-lourde', rang: 2 },
    ],
  });
  const wookiee = (extra: EtatEntiteSaisi['possessions'] = []) =>
    fiche({ possessions: [{ entree: 'wookiee' }, { entree: 'armure-legere' }, ...(extra ?? [])] });

  it('une seule étape de dés à symboles, puis le rapport', async () => {
    const dice = imposed(...Array<number>(20).fill(1));
    const s = await startLocal(
      {
        systeme,
        actionId: 'attaque',
        actor: shooter,
        targets: [{ id: T1, fiche: wookiee() }],
        params: { arme: 'fusil-blaster', portee: 'moyenne' },
        rollMode: 'per_target',
      },
      dice.roll,
    );
    expect(dice.steps).toHaveLength(1);
    expect(dice.steps[0]!.dice.every((d) => d.die)).toBe(true);
    expect(isFinished(s)).toBe(true);
    expect(s.last.targets[0]).toMatchObject({
      status: 'resolved',
      view: { roll: { kind: 'symbols' } },
    });
    expect(() =>
      DeclareAttack.parse({
        attackerId: A,
        action: 'attaque',
        targets: [T1],
        resolved: resolvedReport(s, 'Attaque'),
      }),
    ).not.toThrow();
  });

  it('Esquive : une cible qui la possède renvoie l’attaque au serveur', () => {
    expect(needsReaction(systeme, 'attaque', [{ fiche: wookiee() }])).toBe(false);
    expect(
      needsReaction(systeme, 'attaque', [
        { fiche: wookiee() },
        { fiche: wookiee([{ entree: 'esquive', rang: 2 }]) },
      ]),
    ).toBe(true);
  });
});

describe('contexte du combat (@combat.*) depuis l’état chargé', () => {
  const combat: CombatState = {
    id: '00000000-0000-4000-8000-0000000000d0',
    round: 2,
    mode: 'individual',
    currentIndex: 0,
    initiativeRolled: true,
    version: 3,
    order: [
      {
        characterId: A,
        side: 'players',
        sortKeys: [],
        hasActed: true,
        tally: { attacksMadeRound: 1, attacksMade: 2, targetedRound: 0, targeted: 0 },
      },
      { characterId: T1, side: 'enemies', sortKeys: [], hasActed: false, surprised: true },
    ],
  };

  it('round, décompte, a agi et surpris ; hors combat : absent', () => {
    expect(combatContextOf(null, A, [T1])).toBeUndefined();
    expect(combatContextOf(combat, A, [T1, T2])).toEqual({
      round: 2,
      actor: {
        attacksMadeRound: 1,
        attacksMade: 2,
        targetedRound: 0,
        targeted: 0,
        hasActed: true,
        surprised: false,
      },
      targets: [
        {
          characterId: T1,
          attacksMadeRound: 0,
          attacksMade: 0,
          targetedRound: 0,
          targeted: 0,
          hasActed: false,
          surprised: true,
        },
      ],
    });
  });
});
