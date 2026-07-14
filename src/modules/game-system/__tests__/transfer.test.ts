import { buildGameSystemExport, parseGameSystemExport, stripUndefinedDeep, type GameSystemExportSource } from '../transfer';
import type { StatDefinition, RaceDefinition, ProfileDefinition } from '../types';

function statDef(key: string, extra: Partial<StatDefinition> = {}): StatDefinition {
  return { key, label: key, category: 'ability', dataType: 'number', origin: 'module', ...extra };
}

describe('buildGameSystemExport / parseGameSystemExport — round-trip', () => {
  const race: RaceDefinition = {
    id: 'race-elfe',
    label: 'Elfe',
    description: 'Agile et gracieux',
    modifiers: { FOR: -2, CHA: 2 },
    abilities: [{ id: 'ab-1', label: 'Lumière des étoiles', description: 'Voit dans la pénombre.' }],
    avgHeight: 175,
    avgWeight: 60,
  };
  const profile: ProfileDefinition = { id: 'prof-guerrier', label: 'Guerrier', hitDie: 'd10' };

  const source: GameSystemExportSource = {
    name: 'Mon système',
    description: 'Un système custom complet',
    stats: [
      statDef('FOR'),
      statDef('PV_Max', { category: 'derived', dataType: 'number', valueFormula: { type: 'const', value: 10 } }),
    ],
    creation: {
      method: 'manual',
      rollConstraints: [
        { id: 'c1', label: 'Parité', statKeys: ['FOR'], aggregate: 'evenCount', operator: '=', target: 1 },
      ],
    },
    combatDefenseKey: 'Defense',
    combatAttackKeys: ['FOR'],
    statGroups: ['Caractéristiques'],
    races: [race],
    profiles: [profile],
    raceLabel: 'Espèce',
    profileLabel: 'Classe',
    groupEntityLabel: 'Vaisseau',
    groupEntityStats: [statDef('Vitesse'), statDef('Blindage', { category: 'derived', valueFormula: { type: 'const', value: 5 } })],
    groupEntityCreation: { method: 'roll', rollFormula: { type: 'const', value: 5 } },
  };

  test('build() produit un export complet avec version/date, sans systemId', () => {
    const exported = buildGameSystemExport(source);
    expect(exported.exportVersion).toBe(1);
    expect(typeof exported.exportedAt).toBe('string');
    expect(exported.name).toBe('Mon système');
    expect(exported.stats).toHaveLength(2);
    expect(exported.races).toEqual([race]);
    expect(exported.profiles).toEqual([profile]);
    expect((exported as any).systemId).toBeUndefined();
  });

  test('round-trip build → JSON.stringify → parse redonne des données équivalentes', () => {
    const exported = buildGameSystemExport(source);
    const raw = JSON.stringify(exported);
    const parsed = parseGameSystemExport(raw);

    expect(parsed.name).toBe(source.name);
    expect(parsed.description).toBe(source.description);
    expect(parsed.stats).toEqual(source.stats);
    expect(parsed.creation).toEqual(source.creation);
    expect(parsed.combatDefenseKey).toBe('Defense');
    expect(parsed.combatAttackKeys).toEqual(['FOR']);
    expect(parsed.statGroups).toEqual(['Caractéristiques']);
    expect(parsed.races).toEqual([race]);
    expect(parsed.races[0].abilities).toEqual(race.abilities);
    expect(parsed.profiles).toEqual([profile]);
    expect(parsed.raceLabel).toBe('Espèce');
    expect(parsed.profileLabel).toBe('Classe');
    expect(parsed.groupEntityLabel).toBe('Vaisseau');
    expect(parsed.groupEntityStats).toEqual(source.groupEntityStats);
    expect(parsed.groupEntityCreation).toEqual(source.groupEntityCreation);
  });

  test('rétrocompat : races/profiles/statGroups/groupEntityStats absents du JSON par défaut à []', () => {
    const minimal = { stats: [statDef('FOR')] };
    const parsed = parseGameSystemExport(JSON.stringify(minimal));
    expect(parsed.races).toEqual([]);
    expect(parsed.profiles).toEqual([]);
    expect(parsed.statGroups).toEqual([]);
    expect(parsed.groupEntityStats).toEqual([]);
    expect('raceLabel' in parsed).toBe(false);
    expect('profileLabel' in parsed).toBe(false);
    expect('groupEntityLabel' in parsed).toBe(false);
    expect('groupEntityCreation' in parsed).toBe(false);
  });

  test('rejette un JSON sans stats', () => {
    expect(() => parseGameSystemExport(JSON.stringify({ name: 'x' }))).toThrow(/caractéristique/);
  });

  test('rejette un JSON avec stats vide', () => {
    expect(() => parseGameSystemExport(JSON.stringify({ stats: [] }))).toThrow(/caractéristique/);
  });

  test('rejette un JSON avec une stat malformée (clé manquante)', () => {
    const invalid = { stats: [{ label: 'FOR', category: 'ability', dataType: 'number' }] };
    expect(() => parseGameSystemExport(JSON.stringify(invalid))).toThrow(/caractéristique/);
  });

  test('rejette un JSON qui n\'est pas un objet', () => {
    expect(() => parseGameSystemExport(JSON.stringify([1, 2, 3]))).toThrow();
  });

  test('rejette un texte qui n\'est pas du JSON valide', () => {
    expect(() => parseGameSystemExport('pas du json')).toThrow();
  });

  test('BUG RÉEL corrigé : un fichier bundle (export du panneau Export/Import global, sans stats à la '
    + 'racine mais avec .gameSystem) est déroulé automatiquement au lieu d\'être rejeté avec '
    + '"aucune caractéristique valide trouvée" — piège si l\'utilisateur se trompe de bouton d\'import', () => {
    const bundle = { exportVersion: 1, exportedAt: 'x', gameSystem: { name: 'Sys', description: '', stats: [statDef('FOR')] } };
    const parsed = parseGameSystemExport(JSON.stringify(bundle));
    expect(parsed.name).toBe('Sys');
    expect(parsed.stats).toEqual([statDef('FOR')]);
  });

  test('BUG RÉEL corrigé : un fichier sans modifierFormula/creation/combatDefenseKey ne produit '
    + 'jamais de clé undefined explicite (Firestore rejette WriteBatch.set() avec une valeur undefined, '
    + 'même nichée, ex "Unsupported field value: undefined (found in field modifierFormula)")', () => {
    const minimal = { stats: [statDef('FOR')] };
    const parsed = parseGameSystemExport(JSON.stringify(minimal));
    expect('modifierFormula' in parsed).toBe(false);
    expect('creation' in parsed).toBe(false);
    expect('combatDefenseKey' in parsed).toBe(false);
    expect('combatAttackKeys' in parsed).toBe(false);
  });

  test('build() ne produit pas non plus de clé undefined explicite quand ces champs sont absents', () => {
    const built = buildGameSystemExport({ name: 'x', description: '', stats: [statDef('FOR')] });
    expect('modifierFormula' in built).toBe(false);
    expect('creation' in built).toBe(false);
    expect('combatDefenseKey' in built).toBe(false);
    expect('combatAttackKeys' in built).toBe(false);
  });
});

describe('stripUndefinedDeep', () => {
  test('retire les clés undefined au premier niveau', () => {
    expect(stripUndefinedDeep({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  test('retire les clés undefined imbriquées (objets et tableaux, ex stats[].valueFormula)', () => {
    const input = {
      stats: [
        { key: 'FOR', valueFormula: undefined, modifierFormula: { type: 'const', value: 1, extra: undefined } },
      ],
    };
    expect(stripUndefinedDeep(input)).toEqual({
      stats: [{ key: 'FOR', modifierFormula: { type: 'const', value: 1 } }],
    });
  });

  test('conserve null, 0, false et chaîne vide (seul undefined est retiré)', () => {
    expect(stripUndefinedDeep({ a: null, b: 0, c: false, d: '' })).toEqual({ a: null, b: 0, c: false, d: '' });
  });
});
