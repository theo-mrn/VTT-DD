import { resolveCharacterStats, buildDiceVariables, applyVariablesToNotation, getRollableStats, getLegacyCustomFieldVariables } from '../resolver';
import type { GameSystemDefinition, StatDefinition } from '@/modules/game-system/types';

function mod(key: string) {
  return {
    type: 'floor' as const,
    arg: { type: 'div' as const, args: [{ type: 'sub' as const, args: [{ type: 'stat' as const, key }, { type: 'const' as const, value: 10 }] }, { type: 'const' as const, value: 2 }] },
  };
}

const ABILITIES = (['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'] as const).map(
  (key, i): StatDefinition => ({
    key, label: key, category: 'ability', dataType: 'number',
    modifierFormula: mod(key), isRollable: true, rollUsesModifier: true,
    origin: 'module', order: i,
  }),
);

const DND_LIKE: GameSystemDefinition = {
  systemId: 'test-dnd',
  stats: [
    ...ABILITIES,
    { key: 'Defense', label: 'Défense', category: 'derived', dataType: 'number', origin: 'module',
      valueFormula: { type: 'add', args: [{ type: 'const', value: 18 }, { type: 'modifier', key: 'DEX' }] } },
    { key: 'Contact', label: 'Contact', category: 'derived', dataType: 'number', origin: 'module', isRollable: true,
      valueFormula: { type: 'add', args: [{ type: 'const', value: 1 }, { type: 'modifier', key: 'FOR' }] } },
    { key: 'PV_Max', label: 'PV Max', category: 'derived', dataType: 'number', origin: 'module',
      valueFormula: { type: 'add', args: [{ type: 'const', value: 1 }, { type: 'modifier', key: 'CON' }, { type: 'diceField', key: 'deVie' }] } },
    { key: 'PV', label: 'PV', category: 'vital', dataType: 'number', origin: 'module',
      minFormula: { type: 'const', value: 0 }, maxFormula: { type: 'stat', key: 'PV_Max' } },
  ],
  combatDefenseKey: 'Defense',
  combatAttackKeys: ['Contact'],
};

const CHARACTER = { FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13, deVie: 'd12', PV: 20 };

describe('resolveCharacterStats', () => {
  test('calcule les modificateurs des abilities', () => {
    const resolved = resolveCharacterStats(DND_LIKE, [], CHARACTER);
    expect(resolved.modifiers.FOR).toBe(2);
    expect(resolved.modifiers.DEX).toBe(1);
    expect(resolved.modifiers.CON).toBe(3);
  });

  test('calcule les stats dérivées (Defense, Contact)', () => {
    const resolved = resolveCharacterStats(DND_LIKE, [], CHARACTER);
    expect(resolved.values.Defense).toBe(19); // 18 + mod(DEX=12)=1
    expect(resolved.values.Contact).toBe(3); // 1 + mod(FOR=14)=2
  });

  test('applique les bonus agrégés', () => {
    const resolved = resolveCharacterStats(DND_LIKE, [], CHARACTER, { Contact: 5 });
    expect(resolved.values.Contact).toBe(8); // 3 + bonus 5
  });

  test('PV absent démarre à sa valeur maximale (PV_Max fraîchement calculé, nouveau perso) — pas à 0', () => {
    const fresh = { ...CHARACTER, PV: undefined };
    const resolved = resolveCharacterStats(DND_LIKE, [], fresh, undefined);
    const pvMax = Number(resolved.values.PV_Max);
    expect(resolved.values.PV).toBe(pvMax);
    expect(pvMax).toBeGreaterThan(0);
  });

  test('une dérivée avec jet de dé déjà stockée ne relance jamais le dé (comportement figé après création)', () => {
    const stored = { ...CHARACTER, PV_Max: 15 };
    for (let i = 0; i < 20; i++) {
      expect(resolveCharacterStats(DND_LIKE, [], stored).values.PV_Max).toBe(15);
    }
  });

  test('une dérivée avec jet de dé absente est bien évaluée (nouveau personnage)', () => {
    const fresh = { ...CHARACTER };
    const resolved = resolveCharacterStats(DND_LIKE, [], fresh);
    const pvMax = Number(resolved.values.PV_Max);
    expect(pvMax).toBeGreaterThanOrEqual(1 + 3 + 1); // mod(CON=16)=3, d12 min=1
    expect(pvMax).toBeLessThanOrEqual(1 + 3 + 12);
  });

  test('BUG RÉEL : PV stocké (39) mais PV_Max absent en base -> PV ne doit JAMAIS chuter à cause '
    + 'd\'un jet de dé aléatoire sur PV_Max à chaque résolution (personnage créé avant migration)', () => {
    const legacyCharacter = { ...CHARACTER, PV: 39 }; // pas de PV_Max stocké du tout
    for (let i = 0; i < 30; i++) {
      const resolved = resolveCharacterStats(DND_LIKE, [], legacyCharacter);
      expect(resolved.values.PV).toBe(39);
    }
  });

  test('dès que PV_Max est stocké, le clamp reprend normalement', () => {
    const character = { ...CHARACTER, PV: 999, PV_Max: 12 };
    const resolved = resolveCharacterStats(DND_LIKE, [], character);
    expect(resolved.values.PV).toBe(12);
  });

  test('PV sous le plafond stocké reste inchangé (pas de clamp artificiel vers le haut)', () => {
    const character = { ...CHARACTER, PV: 5, PV_Max: 20 };
    const resolved = resolveCharacterStats(DND_LIKE, [], character);
    expect(resolved.values.PV).toBe(5);
  });

  test('minFormula clampe vers le bas (ex bonus négatif qui ferait passer PV sous 0)', () => {
    const character = { ...CHARACTER, PV: 3, PV_Max: 20 };
    const resolved = resolveCharacterStats(DND_LIKE, [], character, { PV: -10 });
    expect(resolved.values.PV).toBe(0); // 3 + (-10) = -7, clampé à minFormula=0
  });

  test('minFormula/maxFormula sont des formules génériques (pas juste une référence à une autre '
    + 'stat) — fonctionne aussi avec une formule composée', () => {
    const gameSystem: GameSystemDefinition = {
      systemId: 'test-composed-bound',
      stats: [
        { key: 'Niveau', label: 'Niveau', category: 'ability', dataType: 'number', origin: 'module' },
        { key: 'Endurance', label: 'Endurance', category: 'vital', dataType: 'number', origin: 'module',
          minFormula: { type: 'const', value: 0 },
          maxFormula: { type: 'mul', args: [{ type: 'stat', key: 'Niveau' }, { type: 'const', value: 10 }] } },
      ],
    };
    const resolved = resolveCharacterStats(gameSystem, [], { Niveau: 3, Endurance: 999 });
    expect(resolved.values.Endurance).toBe(30); // clampé à Niveau(3) * 10
  });
});

describe('buildDiceVariables + applyVariablesToNotation', () => {
  test('1d20+FOR utilise le modificateur (ability)', () => {
    const resolved = resolveCharacterStats(DND_LIKE, [], CHARACTER);
    const vars = buildDiceVariables(resolved, DND_LIKE.stats);
    expect(vars.FOR).toBe(2);
    expect(applyVariablesToNotation('1d20+FOR', vars)).toBe('1d20+2');
  });

  test('1d20+Defense utilise la valeur directe (derived, pas de modificateur)', () => {
    const resolved = resolveCharacterStats(DND_LIKE, [], CHARACTER);
    const vars = buildDiceVariables(resolved, DND_LIKE.stats);
    expect(vars.Defense).toBe(19);
    expect(applyVariablesToNotation('1d20+Defense', vars)).toBe('1d20+19');
  });

  test('longest-key-first évite les faux positifs (INIT avant IN)', () => {
    const vars = { INIT: 5, IN: 1 };
    expect(applyVariablesToNotation('INIT+2', vars)).toBe('5+2');
  });
});

describe('getLegacyCustomFieldVariables + buildDiceVariables — rétrocompat customFields[] par personnage', () => {
  test('un champ custom legacy rollable avec modificateur apparaît dans les variables', () => {
    const character = { ...CHARACTER, customFields: [{ label: 'Honneur', value: 14, isRollable: true, hasModifier: true }] };
    const vars = getLegacyCustomFieldVariables(character);
    expect(vars.Honneur).toBe(2); // floor((14-10)/2)
  });

  test('un champ custom non-rollable est ignoré', () => {
    const character = { ...CHARACTER, customFields: [{ label: 'Notes', value: 'texte', isRollable: false }] };
    expect(getLegacyCustomFieldVariables(character)).toEqual({});
  });

  test('buildDiceVariables fusionne les stats du schéma ET les customFields legacy', () => {
    const character = { ...CHARACTER, customFields: [{ label: 'Chance', value: 5, isRollable: true, hasModifier: false }] };
    const resolved = resolveCharacterStats(DND_LIKE, [], character);
    const vars = buildDiceVariables(resolved, DND_LIKE.stats, character);
    expect(vars.FOR).toBe(2);
    expect(vars.Chance).toBe(5);
  });

  test('absence de customFields ou format non-array -> objet vide, pas d\'erreur', () => {
    expect(getLegacyCustomFieldVariables({})).toEqual({});
    expect(getLegacyCustomFieldVariables({ customFields: { not: 'an array' } })).toEqual({});
  });
});

describe('getRollableStats', () => {
  test('respecte isRollable par défaut et les overrides', () => {
    const rollables = getRollableStats(DND_LIKE, [], CHARACTER);
    const keys = rollables.map((r) => r.key);
    expect(keys).toContain('FOR');
    expect(keys).toContain('Contact');
    expect(keys).not.toContain('Defense');
  });

  test('override statRollable désactive une ability normalement rollable', () => {
    const rollables = getRollableStats(DND_LIKE, [], CHARACTER, { FOR: false });
    expect(rollables.map((r) => r.key)).not.toContain('FOR');
  });

  test('bonus appliqué APRÈS le modificateur : mod(FOR) + bonus, jamais mod(FOR + bonus) (règle confirmée dice-roller)', () => {
    // FOR=14 -> mod=2 ; bonus +2 (objet équipé) -> attendu 2+2=4, PAS mod(16)=3
    const rollables = getRollableStats(DND_LIKE, [], CHARACTER, undefined, { FOR: 2 });
    const forStat = rollables.find((r) => r.key === 'FOR');
    expect(forStat?.rawValue).toBe(4);
  });

  test('champ custom legacy (Character.customFields[]) apparaît aussi comme rollable', () => {
    const withLegacyField = { ...CHARACTER, customFields: [{ label: 'Chance', value: 5, isRollable: true, type: 'number' }] };
    const rollables = getRollableStats(DND_LIKE, [], withLegacyField);
    const chance = rollables.find((r) => r.key === 'Chance');
    expect(chance?.rawValue).toBe(5);
  });
});
