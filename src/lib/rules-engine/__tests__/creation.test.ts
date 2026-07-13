import { rollAbilities, rollCharacterStats, evaluateRollConstraintAggregate, RollConstraintUnsatisfiableError } from '../creation';
import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { StatDefinition, RollConstraintRule } from '@/modules/game-system/types';

function mod(v: number) {
  return Math.floor((v - 10) / 2);
}

function abilityStat(key: string, extra: Partial<StatDefinition> = {}): StatDefinition {
  return { key, label: key, category: 'ability', dataType: 'number', origin: 'module', ...extra };
}

describe('rollAbilities — mécanisme partagé (formule + contraintes au niveau du système, dnd-classic)', () => {
  const abilities = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((k) => abilityStat(k));

  test('respecte les deux contraintes rollConstraints (3 pairs, somme des modificateurs = +6)', () => {
    const rule = dndClassicModule.gameSystem.creation!;
    const rolled = rollAbilities(rule, abilities);
    const values = Object.values(rolled);

    const evenCount = values.filter((v) => v % 2 === 0).length;
    const totalMod = values.reduce((sum, v) => sum + mod(v), 0);

    expect(evenCount).toBe(3);
    expect(totalMod).toBe(6);
  });

  test('chaque ability est dans la plage plausible d\'un 3d6 (3 à 18)', () => {
    const rule = dndClassicModule.gameSystem.creation!;
    const rolled = rollAbilities(rule, abilities);
    for (const v of Object.values(rolled)) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(18);
    }
  });

  test('BUG RÉEL corrigé : une formule composée (pas un simple noeud dice) est bien évaluée en entier, '
    + 'pas silencieusement remplacée par un fallback 3d6 codé en dur', () => {
    // "2d10 + 5" -> plage réelle [7, 25], ex. concret pour une stat "aléatoire entre 6 et 20"
    const rule = {
      method: 'roll' as const,
      rollFormula: { type: 'add' as const, args: [{ type: 'dice' as const, notation: '2d10' }, { type: 'const' as const, value: 5 }] },
    };
    const rolled = rollAbilities(rule, [abilityStat('FOR'), abilityStat('DEX')]);
    for (const v of Object.values(rolled)) {
      expect(v).toBeGreaterThanOrEqual(7);
      expect(v).toBeLessThanOrEqual(25);
    }
  });
});

describe('rollAbilities — mécanisme par stat (StatDefinition.rollFormula, systèmes custom)', () => {
  test('une stat avec sa propre rollFormula "aléatoire entre 6 et 20" est tirée dans cette plage précise', () => {
    // Équivalent de "aléatoire entre 6 et 20" tel que produit par l'éditeur de règles : 1d15 + 5.
    const forStat = abilityStat('FOR', {
      rollFormula: { type: 'add', args: [{ type: 'dice', notation: '1d15' }, { type: 'const', value: 5 }] },
    });
    const rule = { method: 'manual' as const }; // pas de règle partagée : chaque stat gère son propre tirage
    for (let i = 0; i < 20; i++) {
      const rolled = rollAbilities(rule, [forStat]);
      expect(rolled.FOR).toBeGreaterThanOrEqual(6);
      expect(rolled.FOR).toBeLessThanOrEqual(20);
    }
  });

  test('deux stats avec des plages différentes sont tirées indépendamment, sans contrainte partagée', () => {
    const forStat = abilityStat('FOR', { rollFormula: { type: 'const', value: 20 } }); // toujours 20
    const dexStat = abilityStat('DEX', { rollFormula: { type: 'const', value: 3 } }); // toujours 3
    const rule = { method: 'manual' as const };
    const rolled = rollAbilities(rule, [forStat, dexStat]);
    expect(rolled.FOR).toBe(20);
    expect(rolled.DEX).toBe(3);
  });

  test('une stat sans rollFormula ni règle partagée garde sa defaultValue (saisie libre)', () => {
    const stat = abilityStat('Corps', { defaultValue: 5 });
    const rule = { method: 'manual' as const };
    const rolled = rollAbilities(rule, [stat]);
    expect(rolled.Corps).toBe(5);
  });

  test('une stat avec rollFormula prime sur la règle partagée du système, même si les deux existent', () => {
    const forStat = abilityStat('FOR', { rollFormula: { type: 'const', value: 42 } });
    const dexStat = abilityStat('DEX'); // pas de rollFormula -> suit la règle partagée
    const rule = { method: 'roll' as const, rollFormula: { type: 'const', value: 15 } as const };
    const rolled = rollAbilities(rule, [forStat, dexStat]);
    expect(rolled.FOR).toBe(42);
    expect(rolled.DEX).toBe(15);
  });

  test('BUG RÉEL corrigé : une rollFormula référençant une autre ability (valeur ET modificateur) '
    + 'utilise bien la valeur déjà tirée de cette dernière, peu importe l\'ordre de définition', () => {
    // FORM = FOR + mod(FOR) + 1, définie AVANT FOR dans le tableau -> doit quand même utiliser
    // la vraie valeur de FOR (tri topologique par dépendances), pas 0 (contexte vide).
    const formStat = abilityStat('FORM', {
      rollFormula: {
        type: 'add',
        args: [
          { type: 'stat', key: 'FOR' },
          { type: 'modifier', key: 'FOR' },
          { type: 'const', value: 1 },
        ],
      },
    });
    const forStat = abilityStat('FOR', {
      rollFormula: { type: 'const', value: 14 },
      modifierFormula: { type: 'floor', arg: { type: 'div', args: [{ type: 'sub', args: [{ type: 'stat', key: 'FOR' }, { type: 'const', value: 10 }] }, { type: 'const', value: 2 }] } },
    });
    const rule = { method: 'manual' as const };
    const rolled = rollAbilities(rule, [formStat, forStat]);
    expect(rolled.FOR).toBe(14);
    expect(rolled.FORM).toBe(14 + mod(14) + 1);
  });

  test('BUG RÉEL corrigé (cas exact signalé) : une rollFormula référençant une ability SANS rollFormula '
    + 'propre (valeur fixe/saisie libre) utilise bien sa valeur résolue, pas 0', () => {
    // Cas réel : FOR est une ability "libre" (pas de rollFormula, juste une defaultValue) — elle était
    // résolue APRÈS les stats à rollFormula (donc absente du contexte au moment du tirage de FORM),
    // produisant FORM = 0 + mod(0) + 1 = -4 au lieu de 10 + mod(10) + 1 = 11.
    const forStat = abilityStat('FOR', {
      defaultValue: 10,
      modifierFormula: { type: 'floor', arg: { type: 'div', args: [{ type: 'sub', args: [{ type: 'stat', key: 'FOR' }, { type: 'const', value: 10 }] }, { type: 'const', value: 2 }] } },
    });
    const formStat = abilityStat('FORM', {
      rollFormula: {
        type: 'add',
        args: [
          { type: 'stat', key: 'FOR' },
          { type: 'modifier', key: 'FOR' },
          { type: 'const', value: 1 },
        ],
      },
    });
    const rule = { method: 'manual' as const };
    const rolled = rollAbilities(rule, [forStat, formStat]);
    expect(rolled.FOR).toBe(10);
    expect(rolled.FORM).toBe(10 + mod(10) + 1);
  });

  test('BUG RÉEL corrigé (cas exact signalé, sans case "a un modificateur" cochée) : FORM = FOR + '
    + 'mod(FOR) + 1 fonctionne même si FOR n\'a AUCUNE modifierFormula explicite — mod() est '
    + 'calculable par défaut pour toute ability, indépendamment de son affichage (rollUsesModifier)', () => {
    const forStat = abilityStat('FOR', {
      rollFormula: { type: 'const', value: 14 },
      // Pas de modifierFormula ici : le MJ ne veut PAS que FOR s'affiche comme un modificateur
      // ailleurs dans le jeu, seulement que mod(FOR) soit utilisable dans la formule de FORM.
    });
    const formStat = abilityStat('FORM', {
      rollFormula: {
        type: 'add',
        args: [
          { type: 'stat', key: 'FOR' },
          { type: 'modifier', key: 'FOR' },
          { type: 'const', value: 1 },
        ],
      },
    });
    const rule = { method: 'manual' as const };
    const rolled = rollAbilities(rule, [forStat, formStat]);
    expect(rolled.FOR).toBe(14);
    expect(rolled.FORM).toBe(14 + mod(14) + 1); // 17
  });
});

describe('rollCharacterStats — génération complète d\'un personnage dnd-classic', () => {
  test('applique les modificateurs raciaux aux abilities, distincts du tirage brut (rolledAbilities)', () => {
    const raceModifiers = { FOR: -2, CHA: 2 }; // ex: modificateurs "elfe"
    const result = rollCharacterStats(dndClassicModule.gameSystem, raceModifiers);

    expect(result.abilities.FOR).toBe(result.rolledAbilities.FOR - 2);
    expect(result.abilities.CHA).toBe(result.rolledAbilities.CHA + 2);
    expect(result.abilities.DEX).toBe(result.rolledAbilities.DEX); // pas de modificateur racial sur DEX ici
  });

  test('calcule Defense = 18 + mod(DEX), Contact = 1 + mod(FOR), etc. de façon cohérente', () => {
    const result = rollCharacterStats(dndClassicModule.gameSystem, {});
    const { FOR, DEX, CHA } = result.abilities;

    expect(result.derived.Defense).toBe(18 + mod(DEX));
    expect(result.derived.Contact).toBe(1 + mod(FOR));
    expect(result.derived.Distance).toBe(1 + mod(DEX));
    expect(result.derived.Magie).toBe(1 + mod(CHA));
    expect(result.derived.INIT).toBe(DEX);
  });

  test('PV_Max est calculé à partir du dé de vie (deVie) fourni en extraFields', () => {
    const result = rollCharacterStats(dndClassicModule.gameSystem, {}, [], { deVie: 'd12' });
    const conMod = mod(result.abilities.CON);
    const pvMax = Number(result.derived.PV_Max);
    expect(pvMax).toBeGreaterThanOrEqual(1 + conMod + 1);
    expect(pvMax).toBeLessThanOrEqual(1 + conMod + 12);
  });

  test('sans deVie fourni, PV_Max = 1+mod(CON)+0 (diceField sur notation absente)', () => {
    const result = rollCharacterStats(dndClassicModule.gameSystem, {});
    const conMod = mod(result.abilities.CON);
    expect(result.derived.PV_Max).toBe(1 + conMod);
  });

  test('génère toutes les 6 abilities dnd-classic', () => {
    const result = rollCharacterStats(dndClassicModule.gameSystem, {});
    expect(Object.keys(result.abilities).sort()).toEqual(['CHA', 'CON', 'DEX', 'FOR', 'INT', 'SAG'].sort());
  });
});

describe('rollCharacterStats — stat vital avec sa propre rollFormula (ex PV = Variable→PV_Max)', () => {
  test('BUG RÉEL corrigé : une stat vital SANS rollFormula reste bornée à 0 au lieu de démarrer '
    + 'à sa valeur maximale — corrigé en ajoutant explicitement une rollFormula "Variable→Maximum"', () => {
    const gameSystem = {
      systemId: 'test-vital-roll',
      stats: [
        abilityStat('Corps', { defaultValue: 10 }),
        {
          key: 'PV_Max', label: 'PV Max', category: 'derived' as const, dataType: 'number' as const, origin: 'module' as const,
          valueFormula: { type: 'const' as const, value: 20 },
        },
        {
          key: 'PV', label: 'PV', category: 'vital' as const, dataType: 'number' as const, origin: 'module' as const,
          minFormula: { type: 'const' as const, value: 0 },
          maxFormula: { type: 'stat' as const, key: 'PV_Max' },
          rollFormula: { type: 'stat' as const, key: 'PV_Max' },
        },
      ],
    };
    const result = rollCharacterStats(gameSystem, {}, [], {});
    expect(result.derived.PV_Max).toBe(20);
    expect(result.derived.PV).toBe(20); // démarre à pleine vie, pas à 0
  });

  test('la rollFormula de la stat vital peut être une formule composée (pas juste une référence '
    + 'directe), évaluée avec les stats dérivées déjà résolues disponibles', () => {
    const gameSystem = {
      systemId: 'test-vital-roll-composed',
      stats: [
        abilityStat('Corps', { defaultValue: 10 }),
        {
          key: 'Endurance_Max', label: 'Endurance Max', category: 'derived' as const, dataType: 'number' as const, origin: 'module' as const,
          valueFormula: { type: 'const' as const, value: 30 },
        },
        {
          key: 'Endurance', label: 'Endurance', category: 'vital' as const, dataType: 'number' as const, origin: 'module' as const,
          maxFormula: { type: 'stat' as const, key: 'Endurance_Max' },
          // Démarre à la moitié du maximum, pas à sa pleine valeur — formule composée, pas une simple référence.
          rollFormula: { type: 'div' as const, args: [{ type: 'stat' as const, key: 'Endurance_Max' }, { type: 'const' as const, value: 2 }] },
        },
      ],
    };
    const result = rollCharacterStats(gameSystem, {}, [], {});
    expect(result.derived.Endurance_Max).toBe(30);
    expect(result.derived.Endurance).toBe(15);
  });

  test('BUG RÉEL corrigé : une stat DERIVED (pas seulement vital) avec sa propre rollFormula '
    + '(ex PV_Max = aléatoire entre 1 et 20) est bien tirée UNE FOIS et sa valeur figée est ensuite '
    + 'utilisée par une stat vital qui la référence (ex PV = Variable→PV_Max) — avant ce correctif, '
    + 'le moteur ignorait la rollFormula des stats derived, donc PV_Max restait à 0 et PV divergeait', () => {
    const gameSystem = {
      systemId: 'test-derived-roll',
      stats: [
        abilityStat('Corps', { defaultValue: 10 }),
        {
          key: 'PV_Max', label: 'PV Max', category: 'derived' as const, dataType: 'number' as const, origin: 'module' as const,
          rollFormula: { type: 'add' as const, args: [{ type: 'dice' as const, notation: '1d20' }, { type: 'const' as const, value: 0 }] },
        },
        {
          key: 'PV', label: 'PV', category: 'vital' as const, dataType: 'number' as const, origin: 'module' as const,
          minFormula: { type: 'const' as const, value: 0 },
          maxFormula: { type: 'stat' as const, key: 'PV_Max' },
          rollFormula: { type: 'stat' as const, key: 'PV_Max' },
        },
      ],
    };
    for (let i = 0; i < 20; i++) {
      const result = rollCharacterStats(gameSystem, {}, [], {});
      const pvMax = Number(result.derived.PV_Max);
      expect(pvMax).toBeGreaterThanOrEqual(1);
      expect(pvMax).toBeLessThanOrEqual(20);
      // PV doit refléter la VRAIE valeur tirée pour PV_Max, jamais une valeur différente ou 0.
      expect(result.derived.PV).toBe(pvMax);
    }
  });

  test('BUG RÉEL corrigé (cas exact signalé) : une stat DERIVED qui a À LA FOIS une valueFormula '
    + '(valeur par défaut/protégée, ex PV_Max = const 10) ET une rollFormula (ex aléatoire entre 7 et '
    + '20) doit utiliser la rollFormula UNE SEULE FOIS à la création, jamais recalculer valueFormula à '
    + 'chaque appel — sinon PV_Max change à chaque résolution et diverge de PV qui la référence', () => {
    const gameSystem = {
      systemId: 'test-derived-both-formulas',
      stats: [
        abilityStat('Corps', { defaultValue: 10 }),
        {
          key: 'PV_Max', label: 'PV Max', category: 'derived' as const, dataType: 'number' as const, origin: 'module' as const,
          valueFormula: { type: 'const' as const, value: 10 }, // valeur par défaut historique (protégée)
          rollFormula: { type: 'add' as const, args: [{ type: 'dice' as const, notation: '1d14' }, { type: 'const' as const, value: 6 }] }, // aléatoire 7-20
        },
        {
          key: 'PV', label: 'PV', category: 'vital' as const, dataType: 'number' as const, origin: 'module' as const,
          minFormula: { type: 'const' as const, value: 0 },
          maxFormula: { type: 'stat' as const, key: 'PV_Max' },
          rollFormula: { type: 'stat' as const, key: 'PV_Max' },
        },
      ],
    };
    for (let i = 0; i < 20; i++) {
      const result = rollCharacterStats(gameSystem, {}, [], {});
      const pvMax = Number(result.derived.PV_Max);
      expect(pvMax).toBeGreaterThanOrEqual(7);
      expect(pvMax).toBeLessThanOrEqual(20);
      expect(result.derived.PV).toBe(pvMax);
    }
  });
});

describe('evaluateRollConstraintAggregate — fonction pure (agrégat + opérateur + cible)', () => {
  const modifierOf = (_key: string, v: number) => mod(v);

  test('evenCount = : compte les valeurs paires parmi les clés données', () => {
    const values = { A: 4, B: 5, C: 6 };
    expect(evaluateRollConstraintAggregate('evenCount', '=', 2, ['A', 'B', 'C'], values, modifierOf)).toBe(true);
    expect(evaluateRollConstraintAggregate('evenCount', '=', 3, ['A', 'B', 'C'], values, modifierOf)).toBe(false);
  });

  test('oddCount = : compte les valeurs impaires', () => {
    const values = { A: 3, B: 5, C: 6 };
    expect(evaluateRollConstraintAggregate('oddCount', '=', 2, ['A', 'B', 'C'], values, modifierOf)).toBe(true);
  });

  test('sumValues avec opérateur >= : somme des valeurs brutes', () => {
    const values = { A: 10, B: 12 };
    expect(evaluateRollConstraintAggregate('sumValues', '>=', 20, ['A', 'B'], values, modifierOf)).toBe(true);
    expect(evaluateRollConstraintAggregate('sumValues', '>=', 23, ['A', 'B'], values, modifierOf)).toBe(false);
  });

  test('sumModifiers avec opérateur < : somme des mod() de chaque stat', () => {
    const values = { A: 14, B: 16 }; // mod(14)=2, mod(16)=3 -> somme 5
    expect(evaluateRollConstraintAggregate('sumModifiers', '<', 6, ['A', 'B'], values, modifierOf)).toBe(true);
    expect(evaluateRollConstraintAggregate('sumModifiers', '<', 5, ['A', 'B'], values, modifierOf)).toBe(false);
  });

  test('n\'évalue que les clés fournies, ignore les autres valeurs présentes dans le record', () => {
    const values = { A: 4, B: 5, C: 4 }; // C pair mais hors du périmètre de la contrainte
    expect(evaluateRollConstraintAggregate('evenCount', '=', 1, ['A', 'B'], values, modifierOf)).toBe(true);
  });
});

describe('rollAbilities — contraintes de tirage multiples (rollConstraints[], façon Nooblies)', () => {
  // Équivalent de "aléatoire entre 6 et 20" tel que produit par l'éditeur de règles.
  const randomFormula = (min: number, max: number) => ({
    type: 'add' as const,
    args: [{ type: 'dice' as const, notation: `1d${max - min + 1}` }, { type: 'const' as const, value: min - 1 }],
  });

  test('une seule contrainte "nombre de valeurs paires = 3" sur un groupe de 6 stats à rollFormula individuelle', () => {
    const abilities = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((k) =>
      abilityStat(k, { rollFormula: randomFormula(6, 20) }),
    );
    const rule = {
      method: 'manual' as const,
      rollConstraints: [
        { id: 'c1', statKeys: ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'], aggregate: 'evenCount', operator: '=', target: 3, maxAttempts: 5000 } as RollConstraintRule,
      ],
    };
    const rolled = rollAbilities(rule, abilities);
    const values = Object.values(rolled);
    const evenCount = values.filter((v) => v % 2 === 0).length;
    expect(evenCount).toBe(3);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(6);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  test('deux contraintes indépendantes sur des sous-ensembles DIFFÉRENTS de stats sont vérifiées simultanément', () => {
    const abilities = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((k) =>
      abilityStat(k, { rollFormula: randomFormula(6, 20) }),
    );
    const rule = {
      method: 'manual' as const,
      rollConstraints: [
        { id: 'c1', statKeys: ['FOR', 'DEX'], aggregate: 'evenCount', operator: '=', target: 1, maxAttempts: 5000 } as RollConstraintRule,
        { id: 'c2', statKeys: ['SAG', 'INT', 'CHA'], aggregate: 'sumValues', operator: '>=', target: 30, maxAttempts: 5000 } as RollConstraintRule,
      ],
    };
    const rolled = rollAbilities(rule, abilities);
    const evenAmongForDex = [rolled.FOR, rolled.DEX].filter((v) => v % 2 === 0).length;
    const sumSagIntCha = rolled.SAG + rolled.INT + rolled.CHA;
    expect(evenAmongForDex).toBe(1);
    expect(sumSagIntCha).toBeGreaterThanOrEqual(30);
    // CON n'est couverte par aucune contrainte : toujours dans la plage de sa rollFormula.
    expect(rolled.CON).toBeGreaterThanOrEqual(6);
    expect(rolled.CON).toBeLessThanOrEqual(20);
  });

  test('agrégat sumModifiers avec opérateur >= (pas seulement =)', () => {
    const abilities = ['FOR', 'DEX', 'CON'].map((k) => abilityStat(k, { rollFormula: randomFormula(6, 20) }));
    const rule = {
      method: 'manual' as const,
      rollConstraints: [
        { id: 'c1', statKeys: ['FOR', 'DEX', 'CON'], aggregate: 'sumModifiers', operator: '>=', target: 3, maxAttempts: 5000 } as RollConstraintRule,
      ],
    };
    const rolled = rollAbilities(rule, abilities);
    const totalMod = ['FOR', 'DEX', 'CON'].reduce((sum, k) => sum + mod(rolled[k]), 0);
    expect(totalMod).toBeGreaterThanOrEqual(3);
  });

  test('contrainte IMPÉRATIVE : si elle n\'est jamais satisfaite après maxAttempts, le tirage lève '
    + 'une erreur explicite au lieu de retomber sur une valeur inventée', () => {
    const constrained = ['FOR', 'DEX', 'CON'].map((k) => abilityStat(k, { rollFormula: randomFormula(6, 20) }));
    // Contrainte volontairement impossible (cible absurde) pour garantir l'échec après maxAttempts.
    const rule = {
      method: 'manual' as const,
      rollConstraints: [
        { id: 'c1', label: 'Impossible', statKeys: ['FOR', 'DEX', 'CON'], aggregate: 'sumModifiers', operator: '=', target: 999, maxAttempts: 50 } as RollConstraintRule,
      ],
    };
    expect(() => rollAbilities(rule, constrained)).toThrow(RollConstraintUnsatisfiableError);
    expect(() => rollAbilities(rule, constrained)).toThrow(/Impossible/);
  });

  test('BUG RÉEL évité : une stat dépendante (ex FORM = FOR + mod(FOR) + 1) NON incluse dans les statKeys '
    + 'd\'une contrainte est quand même retirée dans l\'ordre de ses dépendances à CHAQUE tentative, '
    + 'et n\'est pas comptée dans l\'agrégat', () => {
    const forStat = abilityStat('FOR', { rollFormula: randomFormula(6, 20) });
    const formStat = abilityStat('FORM', {
      rollFormula: { type: 'add', args: [{ type: 'stat', key: 'FOR' }, { type: 'modifier', key: 'FOR' }, { type: 'const', value: 1 }] },
    });
    const rule = {
      method: 'manual' as const,
      rollConstraints: [
        { id: 'c1', statKeys: ['FOR'], aggregate: 'evenCount', operator: '=', target: 1 } as RollConstraintRule,
      ],
    };
    for (let i = 0; i < 10; i++) {
      const rolled = rollAbilities(rule, [forStat, formStat]);
      expect(rolled.FOR).toBeGreaterThanOrEqual(6);
      expect(rolled.FOR).toBeLessThanOrEqual(20);
      expect(rolled.FOR % 2).toBe(0);
      // FORM doit toujours refléter la VRAIE valeur de FOR de cette tentative, jamais 0/désynchronisée.
      expect(rolled.FORM).toBe(rolled.FOR + mod(rolled.FOR) + 1);
    }
  });
});
