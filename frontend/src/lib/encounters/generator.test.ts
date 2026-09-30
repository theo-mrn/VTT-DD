import type { Rencontres } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import {
  addCreature,
  alternativesFor,
  budgetOf,
  costOf,
  encounterCost,
  filterPool,
  generate,
  multiplierOf,
  readDifficulty,
  replaceCreature,
  reroll,
  setCount,
  toggleLock,
  type EncounterCreature,
  type PartyMember,
} from './generator';

const rules: Rencontres = {
  niveau: 'niveau',
  puissance: 'niveau',
  nomPuissance: 'Niveau',
  unite: 'XP',
  cout: [
    { puissance: 0, valeur: 10 },
    { puissance: 0.25, valeur: 50 },
    { puissance: 1, valeur: 200 },
    { puissance: 2, valeur: 450 },
    { puissance: 3, valeur: 700 },
    { puissance: 5, valeur: 1800 },
  ],
  difficultes: [
    { id: 'facile', nom: 'Facile', parNiveau: [25, 50, 75] },
    { id: 'moyenne', nom: 'Moyenne', parNiveau: [50, 100, 150] },
    { id: 'difficile', nom: 'Difficile', parNiveau: [75, 150, 225] },
  ],
  multiplicateurs: [
    { nombre: 1, facteur: 1 },
    { nombre: 2, facteur: 1.5 },
    { nombre: 3, facteur: 2 },
  ],
  scenarios: [
    {
      id: 'restreint',
      nom: 'Restreint',
      description: '',
      min: 1,
      max: 2,
      puissanceMax: 1.1,
      chef: false,
    },
    { id: 'horde', nom: 'Horde', description: '', min: 4, max: 8, puissanceMax: 0.4, chef: false },
    {
      id: 'chef',
      nom: 'Chef',
      description: '',
      min: 3,
      max: 6,
      puissanceMax: 1.3,
      chef: true,
      puissanceSbires: 0.4,
    },
  ],
  filtres: ['PV_Max'],
  categories: [],
};

const creature = (id: string, power: number, category = 'Bête', pv = 10): EncounterCreature => ({
  key: `bestiary:${id}`,
  name: id,
  category,
  image: null,
  power,
  values: { PV_Max: pv, niveau: power },
  source: { bestiary: id },
});

const pool = [
  creature('rat', 0, 'Bête', 2),
  creature('loup', 0.25, 'Bête', 11),
  creature('gobelin', 0.25, 'Humanoïde', 7),
  creature('orque', 1, 'Humanoïde', 15),
  creature('ogre', 2, 'Géant', 59),
  creature('troll', 3, 'Géant', 84),
];

const party: PartyMember[] = [
  { id: 'a', name: 'Aria', level: 2 },
  { id: 'b', name: 'Brom', level: 2 },
  { id: 'c', name: 'Cael', level: 3 },
];

/** Aléa rejouable. */
const seeded = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

describe('coûts et budget', () => {
  it('palier de coût, facteur du nombre, budget par personnage', () => {
    expect(costOf(rules, 0.125)).toBe(10);
    expect(costOf(rules, 0.5)).toBe(50);
    expect(costOf(rules, 4)).toBe(700);
    expect(multiplierOf(rules, 1)).toBe(1);
    expect(multiplierOf(rules, 2)).toBe(1.5);
    expect(multiplierOf(rules, 9)).toBe(2);
    // 100 + 100 + 150 : chacun selon son niveau
    expect(budgetOf(rules, party, 'moyenne')).toBe(350);
  });

  it('coût pondéré et jauge de difficulté', () => {
    const groups = [{ creature: pool[1]!, count: 3 }];
    expect(encounterCost(rules, groups)).toEqual({ count: 3, raw: 150, adjusted: 300 });
    const r = readDifficulty(rules, party, groups);
    expect(r.reached?.id).toBe('facile');
    expect(r.thresholds.map((t) => t.budget)).toEqual([175, 350, 525]);
  });
});

describe('vivier', () => {
  it('catégories, puissance, intervalles de valeurs', () => {
    expect(filterPool(pool, { categories: ['Géant'] }).map((c) => c.name)).toEqual([
      'ogre',
      'troll',
    ]);
    expect(filterPool(pool, { maxPower: 0.25 }).length).toBe(3);
    expect(
      filterPool(pool, { ranges: { PV_Max: { min: 10, max: 60 } } }).map((c) => c.name),
    ).toEqual(['loup', 'orque', 'ogre']);
  });
});

describe('génération', () => {
  it('propositions différentes, dans les bornes du scénario, proches du budget', () => {
    const list = generate({
      rules,
      pool,
      party,
      difficultyId: 'moyenne',
      scenarioId: 'horde',
      rng: seeded(7),
    });
    expect(list.length).toBeGreaterThan(1);
    const sigs = new Set(
      list.map((e) => e.groups.map((g) => `${g.creature.key}${g.count}`).join()),
    );
    expect(sigs.size).toBe(list.length);
    for (const e of list) {
      const n = e.groups.reduce((s, g) => s + g.count, 0);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(8);
      // Horde : rien au-delà de 0,4 × niveau moyen (≈ 2,3) : pas d'ogre ni de troll
      expect(e.groups.every((g) => g.creature.power <= 0.4 * (7 / 3))).toBe(true);
    }
  });

  it('chef et sbires : un chef plus puissant, des sbires faibles', () => {
    const [e] = generate({
      rules,
      pool,
      party,
      difficultyId: 'difficile',
      scenarioId: 'chef',
      count: 1,
      rng: seeded(3),
    });
    expect(e).toBeDefined();
    const [leader, ...minions] = e!.groups;
    expect(leader!.count).toBe(1);
    expect(minions.every((g) => g.creature.power < leader!.creature.power)).toBe(true);
  });

  it('catégorie pondérée : les humanoïdes l’emportent malgré le nombre de bêtes', () => {
    const beasts = Array.from({ length: 30 }, (_, i) => creature(`bete${i}`, 0.25, 'Bête'));
    const humans = Array.from({ length: 3 }, (_, i) => creature(`humain${i}`, 0.25, 'Humanoïde'));
    const weightedRules = {
      ...rules,
      categories: [
        { nom: 'Humanoïde', poids: 6 },
        { nom: 'Bête', poids: 1 },
      ],
    };
    let human = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const [e] = generate({
        rules: weightedRules,
        pool: [...beasts, ...humans],
        party,
        difficultyId: 'moyenne',
        scenarioId: 'horde',
        count: 1,
        rng: seeded(seed),
      });
      if (!e) continue;
      total += 1;
      const main = e.groups[0]!.creature.category;
      if (main === 'Humanoïde') human += 1;
    }
    // Poids 6 contre 1 : bien plus d'une rencontre sur deux, malgré 30 bêtes pour 3 humains
    expect(human / total).toBeGreaterThan(0.6);
  });

  it('vivier vide ou scénario inconnu : rien', () => {
    expect(
      generate({ rules, pool: [], party, difficultyId: 'moyenne', scenarioId: 'horde' }),
    ).toEqual([]);
    expect(generate({ rules, pool, party, difficultyId: 'moyenne', scenarioId: 'x' })).toEqual([]);
  });
});

describe('édition', () => {
  const base = {
    id: 'e',
    scenario: 'restreint',
    groups: [
      { creature: pool[3]!, count: 1 },
      { creature: pool[1]!, count: 2 },
    ],
  };

  it('nombre (0 retire), ajout, verrou', () => {
    expect(setCount(base, 'bestiary:loup', 0).groups.length).toBe(1);
    expect(addCreature(base, pool[1]!).groups[1]!.count).toBe(3);
    expect(addCreature(base, pool[4]!).groups.length).toBe(3);
    expect(toggleLock(base, 'bestiary:orque').groups[0]!.locked).toBe(true);
  });

  it('remplacer : voisins de puissance d’abord ; fusion si déjà présente', () => {
    expect(alternativesFor(pool, pool[1]!, 2).map((c) => c.name)).toEqual(['rat', 'gobelin']);
    expect(replaceCreature(base, 'bestiary:orque', pool[4]!).groups[0]!.creature.name).toBe('ogre');
    const merged = replaceCreature(base, 'bestiary:orque', pool[1]!);
    expect(merged.groups).toEqual([{ creature: pool[1]!, count: 3 }]);
  });

  it('relancer garde les groupes verrouillés', () => {
    const locked = toggleLock(base, 'bestiary:orque');
    const next = reroll({
      rules,
      pool,
      party,
      difficultyId: 'moyenne',
      encounter: locked,
      rng: seeded(11),
    });
    expect(next.groups.some((g) => g.creature.key === 'bestiary:orque' && g.locked)).toBe(true);
  });
});
