import { buildGameSystemExport, parseGameSystemExport, isRacePackExport, parseRacePackExport, stripUndefinedDeep, type GameSystemExportSource } from '../transfer';
import type { StatDefinition, RaceDefinition, ProfileDefinition, SymbolDieDefinition, SkillDefinition } from '../types';

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
  const profile: ProfileDefinition = { id: 'prof-guerrier', label: 'Guerrier', hitDie: 'd10', careerSkillKeys: ['skill-discretion'] };
  const skill: SkillDefinition = { key: 'skill-discretion', label: 'Discrétion', linkedStatKey: 'AGI', group: 'Combat' };
  const boostDie: SymbolDieDefinition = {
    key: 'boost',
    label: 'Boost',
    faces: [{ values: {} }, { values: {} }, { values: { succesBrut: 1 } }, { values: { succesBrut: 1, avantageBrut: 1 } }, { values: { avantageBrut: 2 } }, { values: { avantageBrut: 1 } }],
  };

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
    symbolDice: [boostDie],
    rules: [{ title: 'Jet de sauvegarde', description: '1d20 + modificateur contre un effet néfaste.' }],
    skills: [skill],
    skillLabel: 'Compétences',
    startingXp: 110,
    diceUpgradeRule: { baseDiceKey: 'ability', upgradedDiceKey: 'proficiency' },
    maps: [{
      id: 'map-galaxie',
      label: 'Carte Galactique',
      image: 'https://example.com/galaxy.jpg',
      markers: [{ id: 'm1', name: 'Coruscant', description: 'Capitale galactique', x: 0.5, y: 0.5 }],
    }],
    typography: {
      bodyFamily: 'Aurebesh',
      titleFamily: 'Aurebesh',
      fonts: [{ family: 'Aurebesh', src: 'https://example.com/aurebesh.woff2', weight: '400' }],
    },
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
    expect(parsed.symbolDice).toEqual(source.symbolDice);
    expect(parsed.rules).toEqual(source.rules);
    expect(parsed.skills).toEqual(source.skills);
    expect(parsed.skillLabel).toBe('Compétences');
    expect(parsed.startingXp).toBe(110);
    expect(parsed.diceUpgradeRule).toEqual(source.diceUpgradeRule);
    expect(parsed.profiles[0].careerSkillKeys).toEqual(['skill-discretion']);
    expect(parsed.maps).toEqual(source.maps);
    expect(parsed.typography).toEqual(source.typography);
  });

  test('typography absent du JSON => clé absente du résultat (jamais undefined explicite)', () => {
    const parsed = parseGameSystemExport(JSON.stringify({ stats: [statDef('FOR')] }));
    expect('typography' in parsed).toBe(false);
  });

  test('carte malformée (id manquant) dans le JSON brut est filtrée du tableau', () => {
    const raw = JSON.stringify({ ...buildGameSystemExport(source), maps: [{ image: 'https://x', markers: [] }, source.maps![0]] });
    const parsed = parseGameSystemExport(raw);
    expect(parsed.maps).toEqual([source.maps![0]]);
  });

  test('rétrocompat : races/profiles/statGroups/groupEntityStats/symbolDice absents du JSON par défaut à []', () => {
    const minimal = { stats: [statDef('FOR')] };
    const parsed = parseGameSystemExport(JSON.stringify(minimal));
    expect(parsed.races).toEqual([]);
    expect(parsed.profiles).toEqual([]);
    expect(parsed.statGroups).toEqual([]);
    expect(parsed.groupEntityStats).toEqual([]);
    expect(parsed.symbolDice).toEqual([]);
    expect(parsed.rules).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect('raceLabel' in parsed).toBe(false);
    expect('profileLabel' in parsed).toBe(false);
    expect('groupEntityLabel' in parsed).toBe(false);
    expect('groupEntityCreation' in parsed).toBe(false);
    expect('skillLabel' in parsed).toBe(false);
    expect('startingXp' in parsed).toBe(false);
    expect('diceUpgradeRule' in parsed).toBe(false);
  });

  test('filtre une compétence malformée (linkedStatKey manquant) plutôt que de planter', () => {
    const raw = { stats: [statDef('FOR')], skills: [{ key: 'a', label: 'A', linkedStatKey: 'FOR' }, { key: 'b', label: 'sans stat liée' }] };
    const parsed = parseGameSystemExport(JSON.stringify(raw));
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].key).toBe('a');
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

describe('isRacePackExport / parseRacePackExport — pack de races seul (ex race_star_wars.json)', () => {
  const packRaces: RaceDefinition[] = [
    { id: 'bothan', label: 'Bothan', modifiers: { ruse: 2 }, abilities: [{ id: 'a1', label: 'Streetwise', description: '1 rang gratuit.' }] },
    { id: 'humain', label: 'Humain', modifiers: { vigueur: 1 }, abilities: [] },
  ];
  const racePack = { exportVersion: 1, raceLabel: 'Espèce', races: packRaces };

  test('détecte un pack de races (races sans stats)', () => {
    expect(isRacePackExport(racePack)).toBe(true);
  });

  test('un export de système complet (avec stats) n\'est JAMAIS confondu avec un pack de races', () => {
    const fullSystem = buildGameSystemExport({ name: 'x', description: '', stats: [statDef('FOR')], races: racePack.races });
    expect(isRacePackExport(fullSystem)).toBe(false);
  });

  test('round-trip stringify → parse redonne les races et le raceLabel', () => {
    const parsed = parseRacePackExport(JSON.stringify(racePack));
    expect(parsed.races).toEqual(racePack.races);
    expect(parsed.raceLabel).toBe('Espèce');
  });

  test('raceLabel absent => clé absente (jamais undefined explicite)', () => {
    const parsed = parseRacePackExport(JSON.stringify({ races: racePack.races }));
    expect('raceLabel' in parsed).toBe(false);
  });

  test('filtre les races malformées et rejette si aucune valide', () => {
    const mixed = { races: [racePack.races[0], { label: 'sans id' }] };
    expect(parseRacePackExport(JSON.stringify(mixed)).races).toHaveLength(1);
    expect(() => parseRacePackExport(JSON.stringify({ races: [{ label: 'sans id' }] }))).toThrow(/race/);
  });

  test('rejette un JSON sans races', () => {
    expect(() => parseRacePackExport(JSON.stringify({ name: 'x' }))).toThrow(/race/);
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
