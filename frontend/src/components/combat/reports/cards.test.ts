import type { Attack, AttackModification, AttackTarget } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { attack as baseAttack, loadSystem } from '@/lib/combat/test-kit';
import { situationText } from './labels';
import {
  filterByCharacter,
  pendingTargetIds,
  recentlyDecided,
  reductionDetail,
  reportCharacters,
  reportItems,
  reportProgress,
  targetAmounts,
  targetOthers,
  type AttributeModification,
} from './model';

const damage = (
  value: number,
  extra: Partial<AttributeModification> = {},
): AttributeModification => ({
  kind: 'attribute',
  entity: 'target',
  attribute: 'PV',
  operation: 'subtract',
  value,
  ...extra,
});

const target = (characterId: string, extra: Partial<AttackTarget> = {}): AttackTarget => ({
  characterId,
  status: 'resolved',
  decision: 'pending',
  ...extra,
});

const attack = (id: string, extra: Partial<Attack> = {}): Attack => baseAttack({ id, ...extra });

describe('une carte par cible', () => {
  it('les cibles de chaque attaque, puis ses coûts de l’attaquant à part', () => {
    const items = reportItems([
      attack('a1', {
        targets: [target('gobelin'), target('loup')],
        actor: {
          modifications: [{ ...damage(1), entity: 'actor', operation: 'add' }],
          decision: 'pending',
        },
      }),
      attack('a2'),
    ]);
    expect(items.map((i) => i.key)).toEqual(['a1:gobelin', 'a1:loup', 'a1:actor', 'a2:gobelin']);
    const second = items[1]!;
    expect(second.kind === 'target' && [second.index, second.count]).toEqual([1, 2]);
  });

  it('sans coût de l’attaquant, pas de ligne à part', () => {
    expect(
      reportItems([attack('a1', { actor: { modifications: [], decision: 'pending' } })]),
    ).toHaveLength(1);
  });
});

describe('« x/y appliqués »', () => {
  it('compte les cibles appliquées, écartées, en attente ; hors abandons et refus', () => {
    const p = reportProgress([
      attack('a1', {
        status: 'pending',
        targets: [
          target('gobelin', { decision: 'applied' }),
          target('loup', { decision: 'skipped' }),
          target('orc'),
          target('ombre', { status: 'failed' }),
        ],
      }),
      attack('a2', {
        status: 'awaiting_reactions',
        targets: [target('hero', { status: 'awaiting_reaction' })],
      }),
      attack('a3', { status: 'cancelled', targets: [target('orc')] }),
    ]);
    expect(p).toEqual({ applied: 1, skipped: 1, pending: 2, total: 4 });
  });
});

describe('filtre par personnage et carte « Cibles »', () => {
  const list = [
    attack('a1', { attackerId: 'hero', targets: [target('gobelin')] }),
    attack('a2', {
      attackerId: 'gobelin',
      targets: [target('hero'), target('loup', { decision: 'applied' })],
    }),
    attack('a3', {
      attackerId: 'loup',
      status: 'applied',
      targets: [
        target('orc', {
          decision: 'applied',
          applied: {
            applicationId: 'x',
            modifications: [],
            tables: [],
            redirectedTo: 'ombre',
            defeated: false,
            appliedBy: 'gm',
            appliedAt: '2026-09-30T10:00:00Z',
          },
        }),
      ],
    }),
  ];

  it('attaquant, cible ou personnage réattribué', () => {
    expect(filterByCharacter(list, 'gobelin').map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(filterByCharacter(list, 'ombre').map((a) => a.id)).toEqual(['a3']);
    expect(filterByCharacter(list, null)).toHaveLength(3);
    expect(reportCharacters(list)).toEqual(['hero', 'gobelin', 'loup', 'orc']);
  });

  it('les cibles qui attendent une décision, sans doublon', () => {
    expect(pendingTargetIds(list)).toEqual(['gobelin', 'hero']);
  });
});

describe('valeurs et réductions de la cible', () => {
  const result = (modifications: AttackModification[]) => ({
    outcome: { success: true, critical: false, fumble: false },
    roll: {
      kind: 'numeric' as const,
      formula: '1d20',
      dice: [],
      value: 12,
      bonuses: [],
      total: 12,
      natural: 12,
    },
    variables: {},
    modifications,
    tables: [],
    explanations: [],
    errors: [],
  });

  it('les montants en gros chiffres, les autres conséquences à part', () => {
    const t = target('gobelin', {
      result: result([
        damage(7, { damageType: 'feu' }),
        {
          kind: 'entry',
          entity: 'target',
          entry: 'brule',
          operation: 'give',
          ranks: 1,
          duration: 2,
        },
        { ...damage(1), entity: 'actor' },
        damage(3, { operation: 'set' }),
      ]),
    });
    expect(targetAmounts(t).map((m) => m.value)).toEqual([7]);
    expect(targetOthers(t).map((m) => (m.kind === 'entry' ? m.entry : m.value))).toEqual([
      'brule',
      3,
    ]);
    expect(targetAmounts(target('loup'))).toEqual([]);
  });

  it('brut, type, chaque réduction nommée, résultat', () => {
    expect(
      reductionDetail(
        damage(3, {
          damageType: 'feu',
          raw: 9,
          resistances: [
            {
              source: 'anneau',
              name: 'Anneau de feu',
              operation: 'reduce',
              value: 2,
              ignored: false,
            },
            {
              source: 'sort',
              name: 'Protection',
              operation: 'multiply',
              value: 0.5,
              ignored: false,
            },
            {
              source: 'r',
              name: 'Résistance mineure',
              operation: 'reduce',
              value: 1,
              ignored: true,
            },
            { source: 'i', name: 'Immunité', operation: 'cancel', value: 0, ignored: true },
          ],
        }),
      ),
    ).toEqual({
      raw: 9,
      damageType: 'feu',
      lines: [
        { name: 'Anneau de feu', effect: '−2', ignored: false },
        { name: 'Protection', effect: '×0,5', ignored: false },
        { name: 'Résistance mineure', effect: '−1', ignored: true },
        { name: 'Immunité', effect: 'immunité', ignored: true },
      ],
      result: 3,
    });
  });

  it('encaissement sans résistance nommée : le brut seul ; rien à détailler sinon', () => {
    expect(reductionDetail(damage(4, { raw: 7 }))).toEqual({
      raw: 7,
      damageType: null,
      lines: [],
      result: 4,
    });
    expect(reductionDetail(damage(4))).toBeNull();
    expect(reductionDetail(damage(4, { raw: 4, resistances: [] }))).toBeNull();
  });
});

describe('rapports récemment décidés', () => {
  it('décidés sous les yeux du MJ, jusqu’à ce qu’on les range', () => {
    const decided = [
      attack('a1', { status: 'applied' }),
      attack('a2', { status: 'dismissed' }),
      attack('a3', { status: 'applied' }),
      attack('a4', { status: 'pending' }),
    ];
    expect(
      recentlyDecided(decided, new Set(['a1', 'a2', 'a4']), new Set(['a2'])).map((a) => a.id),
    ).toEqual(['a1']);
  });
});

describe('situation retenue', () => {
  const systeme = loadSystem();
  // Paramètres de situation (section `situation`) ajoutés à l'action, comme un système les
  // déclarerait : puce, bonus, choix nommé
  const frappe = systeme.actions.get('frappe')!;
  (frappe.parametres as unknown[]).push(
    { id: 'avantage', nom: 'Avantage', type: 'booleen', defaut: false, section: 'situation' },
    { id: 'toucher', nom: 'Bonus au toucher', type: 'nombre', defaut: 0, section: 'situation' },
    {
      id: 'couvert',
      nom: 'Couvert',
      type: 'choix',
      defaut: 'aucun',
      section: 'situation',
      options: [
        { valeur: 'aucun', nom: 'aucun' },
        { valeur: 'partiel', nom: 'partiel' },
      ],
    },
  );

  it('les paramètres de situation qui s’écartent du défaut, en mots', () => {
    expect(
      situationText(systeme, 'frappe', {
        arme: 'epee',
        bonus: 2,
        avantage: true,
        toucher: -2,
        couvert: 'partiel',
      }),
    ).toEqual(['Avantage', 'Bonus au toucher −2', 'Couvert : partiel']);
    expect(situationText(systeme, 'frappe', { avantage: false, couvert: 'aucun' })).toEqual([]);
  });

  it('sans paramètre de situation, ou sans système : rien', () => {
    expect(situationText(systeme, 'soin', { avantage: true })).toEqual([]);
    expect(situationText(null, 'frappe', { avantage: true })).toEqual([]);
  });
});
