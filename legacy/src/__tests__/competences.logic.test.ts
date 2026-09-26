/**
 * Tests sur les logiques pures extraites de competences.tsx et competencesD.tsx
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface Character {
  id: string;
  Nomperso: string;
  niveau: number;
  type: string;
  [key: string]: string | number | undefined;
}

interface VoieData {
  Voie: string;
  Affichage1: string; Affichage2: string; Affichage3: string; Affichage4: string; Affichage5: string;
  rang1: string; rang2: string; rang3: string; rang4: string; rang5: string;
}

interface CustomCompetence {
  slotIndex: number;
  voieIndex: number;
  sourceVoie: string;
  sourceRank: number;
  competenceName: string;
  competenceDescription: string;
  competenceType: string;
}

// ─── calculateTotalPoints ─────────────────────────────────────────────────────

// Coût d'un rang : 1→1pt, 2→2pts, 3→4pts, 4→6pts, 5→8pts
const RANK_COST: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8 };

function calculateTotalPoints(character: Character): number {
  const pointsFromLevel = 2 * (character.niveau ?? 0);

  const totalPointsLost = Object.entries(character)
    .filter(([key]) => key.startsWith('v') && key.match(/^v\d+$/))
    .reduce((total, [, value]) => {
      const voieValue = Number(value ?? 0);
      return total + (RANK_COST[voieValue] ?? 0);
    }, 0);

  return pointsFromLevel - totalPointsLost;
}

describe("calculateTotalPoints", () => {
  it("un personnage niveau 1 sans compétences a 2 points", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 1, type: 'joueurs' })).toBe(2);
  });

  it("un personnage niveau 5 sans compétences a 10 points", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 5, type: 'joueurs' })).toBe(10);
  });

  it("déduit 1 point pour un rang 1", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 3, type: 'joueurs', v1: 1 })).toBe(5); // 6 - 1
  });

  it("déduit 2 points pour un rang 2", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 3, type: 'joueurs', v1: 2 })).toBe(4); // 6 - 2
  });

  it("déduit 4 points pour un rang 3", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 5, type: 'joueurs', v1: 3 })).toBe(6); // 10 - 4
  });

  it("déduit 6 points pour un rang 4", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 5, type: 'joueurs', v1: 4 })).toBe(4); // 10 - 6
  });

  it("déduit 8 points pour un rang 5", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 5, type: 'joueurs', v1: 5 })).toBe(2); // 10 - 8
  });

  it("accumule les coûts de plusieurs voies", () => {
    // niveau 5 = 10pts, v1=2 (-2pts), v2=1 (-1pt) → 7pts
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 5, type: 'joueurs', v1: 2, v2: 1 })).toBe(7);
  });

  it("ignore les propriétés qui ne sont pas des voies (ex: 'version')", () => {
    const char = { id: '1', Nomperso: 'Test', niveau: 3, type: 'joueurs', v1: 1, version: 99 };
    expect(calculateTotalPoints(char)).toBe(5); // 'version' ne commence pas par v\d+
  });

  it("gère un niveau 0", () => {
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 0, type: 'joueurs' })).toBe(0);
  });

  it("peut retourner des points négatifs si les voies dépassent le niveau", () => {
    // niveau 1 = 2pts, v1=5 (-8pts) → -6
    expect(calculateTotalPoints({ id: '1', Nomperso: 'Test', niveau: 1, type: 'joueurs', v1: 5 })).toBe(-6);
  });
});

// ─── applyCustomCompetences ───────────────────────────────────────────────────

function applyCustomCompetences(
  voieData: Record<string, VoieData>,
  customComps: CustomCompetence[]
): Record<string, VoieData> {
  const updatedVoieData = { ...voieData };

  customComps.forEach((customComp) => {
    const voieKey = `Voie${customComp.voieIndex + 1}`;
    if (updatedVoieData[voieKey]) {
      const affichageKey = `Affichage${customComp.slotIndex + 1}` as keyof VoieData;
      const rangKey = `rang${customComp.slotIndex + 1}` as keyof VoieData;

      updatedVoieData[voieKey] = {
        ...updatedVoieData[voieKey],
        [affichageKey]: `🔄 ${customComp.competenceName}`,
        [rangKey]: `${customComp.competenceDescription}<br><br><em>📍 Depuis: ${customComp.sourceVoie} (rang ${customComp.sourceRank})</em>`,
      };
    }
  });

  return updatedVoieData;
}

const baseVoieData: Record<string, VoieData> = {
  Voie1: {
    Voie: 'Voie du Guerrier',
    Affichage1: 'Coup de poing', Affichage2: 'Parade', Affichage3: 'Frappe puissante', Affichage4: 'Défense totale', Affichage5: 'Maîtrise du combat',
    rang1: 'desc1', rang2: 'desc2', rang3: 'desc3', rang4: 'desc4', rang5: 'desc5',
  },
};

describe("applyCustomCompetences", () => {
  it("remplace le nom et la description du slot ciblé", () => {
    const custom: CustomCompetence[] = [{
      slotIndex: 0,       // Affichage1 / rang1
      voieIndex: 0,       // Voie1
      sourceVoie: 'Voie du Mage',
      sourceRank: 2,
      competenceName: 'Boule de feu',
      competenceDescription: 'Lance une boule de feu',
      competenceType: 'active',
    }];

    const result = applyCustomCompetences(baseVoieData, custom);
    expect(result['Voie1'].Affichage1).toBe('🔄 Boule de feu');
    expect(result['Voie1'].rang1).toContain('Lance une boule de feu');
    expect(result['Voie1'].rang1).toContain('Voie du Mage (rang 2)');
  });

  it("n'affecte pas les autres slots de la voie", () => {
    const custom: CustomCompetence[] = [{
      slotIndex: 0, voieIndex: 0, sourceVoie: 'X', sourceRank: 1,
      competenceName: 'Nouveau', competenceDescription: '', competenceType: 'passive',
    }];

    const result = applyCustomCompetences(baseVoieData, custom);
    expect(result['Voie1'].Affichage2).toBe('Parade'); // inchangé
    expect(result['Voie1'].Affichage3).toBe('Frappe puissante'); // inchangé
  });

  it("n'affecte pas les voies non ciblées", () => {
    const data = {
      ...baseVoieData,
      Voie2: { ...baseVoieData['Voie1'], Voie: 'Voie du Mage' },
    };
    const custom: CustomCompetence[] = [{
      slotIndex: 0, voieIndex: 0, sourceVoie: 'X', sourceRank: 1,
      competenceName: 'Nouveau', competenceDescription: '', competenceType: 'passive',
    }];

    const result = applyCustomCompetences(data, custom);
    expect(result['Voie2'].Affichage1).toBe('Coup de poing'); // inchangé
  });

  it("ignore un custom dont la voieIndex ne correspond à aucune voie", () => {
    const custom: CustomCompetence[] = [{
      slotIndex: 0, voieIndex: 9, // Voie10 — n'existe pas
      sourceVoie: 'X', sourceRank: 1,
      competenceName: 'Fantôme', competenceDescription: '', competenceType: 'passive',
    }];

    const result = applyCustomCompetences(baseVoieData, custom);
    expect(result['Voie1'].Affichage1).toBe('Coup de poing'); // inchangé
    expect(result['Voie10']).toBeUndefined();
  });

  it("ne mute pas l'objet voieData original", () => {
    const original = JSON.stringify(baseVoieData);
    const custom: CustomCompetence[] = [{
      slotIndex: 0, voieIndex: 0, sourceVoie: 'X', sourceRank: 1,
      competenceName: 'Nouveau', competenceDescription: '', competenceType: 'passive',
    }];

    applyCustomCompetences(baseVoieData, custom);
    expect(JSON.stringify(baseVoieData)).toBe(original);
  });

  it("applique plusieurs custom competences en une passe", () => {
    const custom: CustomCompetence[] = [
      { slotIndex: 0, voieIndex: 0, sourceVoie: 'A', sourceRank: 1, competenceName: 'Comp A', competenceDescription: 'desc A', competenceType: 'passive' },
      { slotIndex: 2, voieIndex: 0, sourceVoie: 'B', sourceRank: 3, competenceName: 'Comp B', competenceDescription: 'desc B', competenceType: 'active' },
    ];

    const result = applyCustomCompetences(baseVoieData, custom);
    expect(result['Voie1'].Affichage1).toBe('🔄 Comp A');
    expect(result['Voie1'].Affichage3).toBe('🔄 Comp B');
  });
});

// ─── handleSkillClick — logique canUnlock ─────────────────────────────────────

function computeCanUnlock(
  currentRank: number,
  targetRank: number,
  isOwnCharacter: boolean
): boolean {
  const isAlreadyUnlocked = currentRank >= targetRank;
  const canUnlock = (targetRank === 1 || currentRank >= targetRank - 1) && !isAlreadyUnlocked;
  return canUnlock && isOwnCharacter;
}

describe("computeCanUnlock (handleSkillClick)", () => {
  it("peut débloquer le rang 1 depuis rang 0", () => {
    expect(computeCanUnlock(0, 1, true)).toBe(true);
  });

  it("peut débloquer le rang 2 si rang 1 est atteint", () => {
    expect(computeCanUnlock(1, 2, true)).toBe(true);
  });

  it("ne peut pas débloquer le rang 3 si on est au rang 1 (rang intermédiaire manquant)", () => {
    expect(computeCanUnlock(1, 3, true)).toBe(false);
  });

  it("ne peut pas débloquer un rang déjà acquis", () => {
    expect(computeCanUnlock(3, 3, true)).toBe(false);
    expect(computeCanUnlock(4, 3, true)).toBe(false);
  });

  it("ne peut pas débloquer même si éligible si ce n'est pas son personnage", () => {
    expect(computeCanUnlock(0, 1, false)).toBe(false);
    expect(computeCanUnlock(2, 3, false)).toBe(false);
  });

  it("peut débloquer le rang 5 si rang 4 atteint et personnage à soi", () => {
    expect(computeCanUnlock(4, 5, true)).toBe(true);
  });
});

// ─── renderCompetences — logique de filtrage ──────────────────────────────────

interface Competence {
  id: string;
  name: string;
  description: string;
  type: 'passive' | 'limitée';
  isActive: boolean;
}

function filterCompetences(
  competences: Competence[],
  type: 'all' | 'passive' | 'limitée',
  searchQuery: string
): Competence[] {
  let filtered = type === 'all' ? competences : competences.filter(c => c.type === type);

  if (searchQuery.trim() !== '') {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query)
    );
  }

  return filtered;
}

const sampleCompetences: Competence[] = [
  { id: '1', name: 'Frappe Mortelle', description: 'Une attaque dévastatrice', type: 'passive', isActive: true },
  { id: '2', name: 'Esquive', description: 'Evite une attaque', type: 'passive', isActive: false },
  { id: '3', name: 'Fureur Barbare', description: 'Rage incontrôlable', type: 'limitée', isActive: true },
  { id: '4', name: 'Soin Limité', description: 'Soigne quelques PV', type: 'limitée', isActive: false },
];

describe("filterCompetences (renderCompetences)", () => {
  it("retourne toutes les compétences avec type 'all' et sans recherche", () => {
    expect(filterCompetences(sampleCompetences, 'all', '')).toHaveLength(4);
  });

  it("filtre par type 'passive'", () => {
    const result = filterCompetences(sampleCompetences, 'passive', '');
    expect(result).toHaveLength(2);
    result.forEach(c => expect(c.type).toBe('passive'));
  });

  it("filtre par type 'limitée'", () => {
    const result = filterCompetences(sampleCompetences, 'limitée', '');
    expect(result).toHaveLength(2);
    result.forEach(c => expect(c.type).toBe('limitée'));
  });

  it("filtre par nom (insensible à la casse)", () => {
    const result = filterCompetences(sampleCompetences, 'all', 'frappe');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Frappe Mortelle');
  });

  it("filtre par description", () => {
    const result = filterCompetences(sampleCompetences, 'all', 'incontrolable');
    // Pas de résultat car 'incontrôlable' avec accent ne correspond pas
    expect(result).toHaveLength(0);
  });

  it("filtre par description sans accent", () => {
    const result = filterCompetences(sampleCompetences, 'all', 'rage');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it("combine filtre type + recherche", () => {
    const result = filterCompetences(sampleCompetences, 'passive', 'esquive');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Esquive');
  });

  it("retourne vide si aucune correspondance", () => {
    expect(filterCompetences(sampleCompetences, 'all', 'dragon')).toHaveLength(0);
  });

  it("une recherche sur espace seul retourne tout (trim)", () => {
    expect(filterCompetences(sampleCompetences, 'all', '   ')).toHaveLength(4);
  });
});

// ─── Parsing diceSelection ────────────────────────────────────────────────────

function parseDiceSelection(diceSelection: string): { count: number; faces: number } {
  const [count, faces] = diceSelection.split('d').map(Number);
  return { count: count || 1, faces: faces || 6 };
}

describe("parseDiceSelection", () => {
  it("parse '1d6'", () => {
    expect(parseDiceSelection('1d6')).toEqual({ count: 1, faces: 6 });
  });

  it("parse '2d8'", () => {
    expect(parseDiceSelection('2d8')).toEqual({ count: 2, faces: 8 });
  });

  it("parse '3d20'", () => {
    expect(parseDiceSelection('3d20')).toEqual({ count: 3, faces: 20 });
  });

  it("utilise 1 comme count par défaut si invalide", () => {
    expect(parseDiceSelection('d6')).toEqual({ count: 1, faces: 6 });
  });

  it("utilise 6 comme faces par défaut si invalide", () => {
    expect(parseDiceSelection('2d')).toEqual({ count: 2, faces: 6 });
  });
});

// ─── statOptions — cohérence des données (competencesD.tsx) ──────────────────

const statOptions = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "PV", "PV_Max", "Contact", "Distance", "Magie", "Defense"];

describe("statOptions (competencesD)", () => {
  it("contient 12 options", () => {
    expect(statOptions).toHaveLength(12);
  });

  it("contient les 6 stats D&D de base", () => {
    ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].forEach(s => expect(statOptions).toContain(s));
  });

  it("contient PV et PV_Max", () => {
    expect(statOptions).toContain('PV');
    expect(statOptions).toContain('PV_Max');
  });

  it("contient les stats de combat", () => {
    ['Contact', 'Distance', 'Magie', 'Defense'].forEach(s => expect(statOptions).toContain(s));
  });

  it("pas de doublons", () => {
    expect(new Set(statOptions).size).toBe(statOptions.length);
  });
});
