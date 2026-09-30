import type { Attack, AttackModification, AttackTarget } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import {
  actorDraftOf,
  addEntry,
  adjust,
  adjustSelected,
  applyToValue,
  buildApply,
  buildApplyAll,
  bulkRows,
  canRevert,
  decidableTargets,
  defeatedBy,
  diceOrigin,
  double,
  draftOf,
  filterReports,
  halve,
  isAsProposed,
  outcomeTone,
  pendingCount,
  reduceBy,
  revertConflictOf,
  setAmount,
  setDamageType,
  setDuration,
  targetDecision,
  zero,
} from './model';

const damage = (value: number, extra: Partial<AttackModification> = {}): AttackModification =>
  ({
    kind: 'attribute',
    entity: 'target',
    attribute: 'hp',
    operation: 'subtract',
    value,
    damageType: 'fire',
    raw: value + 2,
    resistances: [
      { source: 'ring', name: 'Anneau', operation: 'reduce', value: 2, ignored: false },
    ],
    ...extra,
  }) as AttackModification;

const target = (characterId: string, extra: Partial<AttackTarget> = {}): AttackTarget => ({
  characterId,
  status: 'resolved',
  decision: 'pending',
  result: {
    outcome: { success: true, critical: false, fumble: false },
    roll: {
      kind: 'numeric',
      formula: '1d20 + 5',
      dice: [{ faces: 20, values: [{ value: 14, kept: true, exploded: false, source: 'server' }] }],
      value: 19,
      bonuses: [],
      total: 19,
      natural: 14,
    },
    variables: {},
    modifications: [
      damage(7),
      {
        kind: 'entry',
        entity: 'target',
        entry: 'burning',
        operation: 'give',
        ranks: 1,
        duration: 2,
      },
    ],
    tables: [],
    explanations: [],
    errors: [],
  },
  ...extra,
});

const attack = (id: string, extra: Partial<Attack> = {}): Attack => ({
  id,
  campaignId: 'camp',
  combatId: 'c1',
  round: 1,
  turn: 1,
  attackerId: 'orc',
  action: { id: 'attaque', name: 'Attaque' },
  params: {},
  rollMode: 'per_target',
  dice: 'server',
  visibility: 'gm',
  status: 'pending',
  outOfTurn: false,
  selfTarget: false,
  targets: [target('lyra')],
  actor: null,
  pendingSteps: [],
  createdBy: 'gm',
  createdAt: '2026-09-30T10:00:00Z',
  resolvedAt: '2026-09-30T10:00:01Z',
  decidedAt: null,
  version: 3,
  redacted: false,
  ...extra,
});

describe('filtres et pastille', () => {
  const list = [
    attack('a1'),
    attack('a2', { status: 'applied' }),
    attack('a3', { status: 'awaiting_reactions' }),
    attack('a4', { status: 'dismissed', combatId: null }),
    attack('a5', { status: 'cancelled' }),
  ];

  it('en attente : résolues et en cours ; décidées : appliquées ou écartées', () => {
    expect(filterReports(list, 'pending', 'all', 'c1').map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(filterReports(list, 'decided', 'all', 'c1').map((a) => a.id)).toEqual(['a2', 'a4']);
    expect(filterReports(list, 'all', 'all', 'c1')).toHaveLength(5);
  });

  it('ce combat, hors combat', () => {
    expect(filterReports(list, 'decided', 'combat', 'c1').map((a) => a.id)).toEqual(['a2']);
    expect(filterReports(list, 'all', 'outside', 'c1').map((a) => a.id)).toEqual(['a4']);
    expect(filterReports(list, 'all', 'combat', null)).toEqual([]);
  });

  it('la pastille compte les rapports à décider', () => {
    expect(pendingCount(list)).toBe(1);
  });
});

describe('lecture', () => {
  it('issue', () => {
    expect(outcomeTone({ success: true, critical: true, fumble: false })).toBe('critical');
    expect(outcomeTone({ success: true, critical: false, fumble: false })).toBe('success');
    expect(outcomeTone({ success: false, critical: false, fumble: true })).toBe('fumble');
    expect(outcomeTone({ success: false, critical: false, fumble: false })).toBe('failure');
  });

  it('source des dés : 3D, serveur ou mixte', () => {
    expect(diceOrigin(attack('a'))).toBe('server');
    const mixed = target('kael');
    const roll = mixed.result!.roll;
    if (roll.kind === 'numeric')
      roll.dice[0]!.values.push({ value: 3, kept: false, exploded: false, source: 'physical' });
    expect(diceOrigin(attack('b', { targets: [mixed] }))).toBe('mixed');
    expect(diceOrigin(attack('c', { targets: [], dice: 'physical' }))).toBe('physical');
  });

  it('cibles à décider, annulation possible, hors de combat', () => {
    const a = attack('a', {
      targets: [
        target('lyra'),
        target('kael', { decision: 'applied' }),
        target('mira', { status: 'failed', decision: 'pending' }),
        target('zed', { decision: 'reverted' }),
      ],
    });
    expect(decidableTargets(a).map((t) => t.characterId)).toEqual(['lyra', 'zed']);
    expect(canRevert(a)).toBe(true);
    expect(canRevert(attack('b'))).toBe(false);
    const applied = attack('c', {
      status: 'applied',
      targets: [
        target('lyra', {
          decision: 'applied',
          applied: {
            applicationId: 'app',
            modifications: [],
            tables: [],
            redirectedTo: null,
            defeated: true,
            appliedBy: 'gm',
            appliedAt: '2026-09-30T10:01:00Z',
          },
        }),
      ],
    });
    expect(defeatedBy(applied)).toEqual(['lyra']);
  });
});

describe('décision et modification des dégâts', () => {
  it('appliquer tel quel : rien d’autre que la décision ne part', () => {
    const a = attack('a');
    const t = a.targets[0]!;
    const draft = draftOf(t);
    expect(isAsProposed(draft, t)).toBe(true);
    expect(targetDecision(draft, t)).toEqual({ characterId: 'lyra', apply: true });
    // Les modifications renvoyées au serveur n'ont ni `entity`, ni `raw`, ni résistances
    expect(draft.modifications[0]).toEqual({
      kind: 'attribute',
      attribute: 'hp',
      operation: 'subtract',
      value: 7,
      damageType: 'fire',
    });
  });

  it('ne pas appliquer', () => {
    const t = target('lyra');
    expect(targetDecision({ ...draftOf(t), apply: false }, t)).toEqual({
      characterId: 'lyra',
      apply: false,
    });
  });

  it('moitié, double, résistance, aucun dégât, ±1 et saisie', () => {
    const mods = draftOf(target('lyra')).modifications;
    const value = (m: typeof mods) => (m[0]!.kind === 'attribute' ? m[0]!.value : null);
    expect(value(halve(mods))).toBe(3);
    expect(value(double(mods))).toBe(14);
    expect(value(reduceBy(mods, 5))).toBe(2);
    expect(value(reduceBy(mods, 50))).toBe(0);
    expect(value(zero(mods))).toBe(0);
    expect(value(adjust(mods, 1))).toBe(8);
    expect(value(adjust(mods, -10))).toBe(0);
    expect(value(setAmount(mods, 0, 12))).toBe(12);
    expect(value(setAmount(mods, 0, Number.NaN))).toBe(0);
    // L'état donné n'est pas touché par les raccourcis
    expect(halve(mods)[1]).toEqual(mods[1]);
  });

  it('les valeurs corrigées partent à la place de celles du rapport', () => {
    const a = attack('a');
    const t = a.targets[0]!;
    const draft = { ...draftOf(t), modifications: halve(draftOf(t).modifications) };
    expect(isAsProposed(draft, t)).toBe(false);
    expect(buildApply(a, [draft], null, '  Esquive narrative  ')).toEqual({
      version: 3,
      targets: [
        {
          characterId: 'lyra',
          apply: true,
          modifications: [
            {
              kind: 'attribute',
              attribute: 'hp',
              operation: 'subtract',
              value: 3,
              damageType: 'fire',
            },
            { kind: 'entry', entry: 'burning', operation: 'give', ranks: 1, duration: 2 },
          ],
        },
      ],
      note: 'Esquive narrative',
    });
  });

  it('type de dégâts, durée, état ajouté, réattribution', () => {
    const t = target('lyra');
    let mods = draftOf(t).modifications;
    mods = setDamageType(mods, 0, null);
    expect(mods[0]).not.toHaveProperty('damageType');
    mods = setDamageType(mods, 0, 'cold');
    expect(mods[0]).toMatchObject({ damageType: 'cold' });
    mods = setDuration(mods, 1, null);
    expect(mods[1]).not.toHaveProperty('duration');
    mods = addEntry(mods, 'stunned', 1);
    expect(mods[2]).toEqual({
      kind: 'entry',
      entry: 'stunned',
      operation: 'give',
      ranks: 1,
      duration: 1,
    });
    const decision = targetDecision({ ...draftOf(t), redirectTo: 'kael' }, t);
    expect(decision).toEqual({ characterId: 'lyra', apply: true, redirectTo: 'kael' });
  });

  it('coûts de l’attaquant : tels quels, corrigés, ou non appliqués', () => {
    const a = attack('a', {
      actor: {
        decision: 'pending',
        modifications: [damage(2, { entity: 'actor', attribute: 'strain', damageType: undefined })],
      },
    });
    const draft = actorDraftOf(a)!;
    expect(buildApply(a, [], draft).actor).toEqual({ apply: true });
    expect(
      buildApply(a, [], { ...draft, modifications: adjust(draft.modifications, 1) }).actor,
    ).toEqual({
      apply: true,
      modifications: [{ kind: 'attribute', attribute: 'strain', operation: 'subtract', value: 3 }],
    });
    expect(buildApply(a, [], { ...draft, apply: false }).actor).toEqual({ apply: false });
    expect(actorDraftOf(attack('b'))).toBeNull();
  });

  it('une cible déjà décidée n’est pas renvoyée', () => {
    const a = attack('a', { targets: [target('lyra', { decision: 'applied' })] });
    expect(buildApply(a, [draftOf(a.targets[0]!)], null).targets).toEqual([]);
  });

  it('aperçu de la ressource avant et après', () => {
    expect(
      applyToValue(10, { kind: 'attribute', attribute: 'hp', operation: 'subtract', value: 7 }),
    ).toBe(3);
    expect(
      applyToValue(10, { kind: 'attribute', attribute: 'hp', operation: 'add', value: 4 }),
    ).toBe(14);
    expect(
      applyToValue(10, { kind: 'attribute', attribute: 'hp', operation: 'set', value: 1 }),
    ).toBe(1);
  });
});

describe('revue groupée', () => {
  const attacks = [
    attack('a1', {
      targets: [target('lyra'), target('kael', { decision: 'applied' })],
      actor: { decision: 'pending', modifications: [damage(1, { entity: 'actor' })] },
    }),
    attack('a2', { targets: [target('kael')] }),
    attack('a3', { status: 'applied', targets: [target('mira', { decision: 'applied' })] }),
  ];

  it('une ligne par cible à décider des rapports en attente', () => {
    const rows = bulkRows(attacks);
    expect(rows.map((r) => r.key)).toEqual(['a1:lyra', 'a2:kael']);
    expect(rows.every((r) => r.selected)).toBe(true);
  });

  it('ajustement global des lignes cochées seulement', () => {
    const rows = bulkRows(attacks).map((r) =>
      r.key === 'a2:kael' ? { ...r, selected: false } : r,
    );
    const adjusted = adjustSelected(rows, -2);
    const value = (i: number) => {
      const m = adjusted[i]!.modifications[0]!;
      return m.kind === 'attribute' ? m.value : null;
    };
    expect(value(0)).toBe(5);
    expect(value(1)).toBe(7);
  });

  it('« Tout appliquer » : décochées laissées en attente, valeurs corrigées, coûts compris', () => {
    const rows = adjustSelected(bulkRows(attacks), 1).map((r) =>
      r.key === 'a2:kael' ? { ...r, selected: false } : r,
    );
    expect(buildApplyAll(attacks, rows)).toEqual([
      {
        items: [
          {
            attackId: 'a1',
            version: 3,
            targets: [
              {
                characterId: 'lyra',
                apply: true,
                modifications: [
                  {
                    kind: 'attribute',
                    attribute: 'hp',
                    operation: 'subtract',
                    value: 8,
                    damageType: 'fire',
                  },
                  { kind: 'entry', entry: 'burning', operation: 'give', ranks: 1, duration: 2 },
                ],
              },
            ],
            actor: { apply: true },
          },
        ],
      },
    ]);
  });

  it('valeurs inchangées : la décision seule ; au-delà de 50 rapports, plusieurs appels', () => {
    const many = Array.from({ length: 51 }, (_, i) => attack(`x${i}`));
    const batches = buildApplyAll(many, bulkRows(many));
    expect(batches.map((b) => b.items.length)).toEqual([50, 1]);
    expect(batches[0]!.items[0]!.targets).toEqual([{ characterId: 'lyra', apply: true }]);
  });
});

describe('annulation', () => {
  it('reconnaît le conflit et ses chemins', () => {
    const err = {
      problem: {
        status: 409,
        title: 'Conflict',
        code: 'revert_conflict',
        paths: ['etat.valeurs.hp', { path: 'etat.valeurs.stress' }],
      },
    };
    expect(revertConflictOf(err)).toEqual({ paths: ['etat.valeurs.hp', 'etat.valeurs.stress'] });
    expect(revertConflictOf({ problem: { status: 409, code: 'version_conflict' } })).toBeNull();
    expect(revertConflictOf(new Error('x'))).toBeNull();
  });
});
