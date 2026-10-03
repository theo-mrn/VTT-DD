/**
 * Tests sur les logiques pures extraites de MJcombat.tsx
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type CharacterType = 'joueurs' | 'allié' | 'pnj';

interface Character {
  id: string;
  name: string;
  pv: number;
  init: number;
  type: CharacterType;
  currentInit?: number;
  initDetails?: string;
  Defense: number;
  cityId?: string;
  currentSceneId?: string;
  conditions?: string[];
}

// ─── filterCharacters — visibilité par scène ──────────────────────────────────

function filterCharacters(chars: Character[], currentCityId: string | null): Character[] {
  return chars.filter(char => {
    if (char.type === 'joueurs') {
      if (!char.currentSceneId) return true;
      if (char.currentSceneId === currentCityId) return true;
      return false;
    }

    if (char.type === 'allié') {
      if (!char.currentSceneId) return true;
      if (char.currentSceneId === currentCityId) return true;
      return false;
    }

    // PNJ : uniquement si explicitement dans cette scène
    if (currentCityId) {
      return char.currentSceneId === currentCityId || char.cityId === currentCityId;
    }
    return false;
  });
}

const player = (id: string, sceneId?: string): Character => ({
  id, name: `Joueur ${id}`, pv: 20, init: 3, type: 'joueurs',
  Defense: 12, currentSceneId: sceneId,
});

const ally = (id: string, sceneId?: string): Character => ({
  id, name: `Allié ${id}`, pv: 15, init: 2, type: 'allié',
  Defense: 10, currentSceneId: sceneId,
});

const npc = (id: string, sceneId?: string, cityId?: string): Character => ({
  id, name: `PNJ ${id}`, pv: 10, init: 1, type: 'pnj',
  Defense: 10, currentSceneId: sceneId, cityId,
});

describe("filterCharacters — joueurs", () => {
  it("affiche un joueur sans scène assignée (suit le groupe)", () => {
    expect(filterCharacters([player('1')], 'city-A')).toHaveLength(1);
  });

  it("affiche un joueur explicitement dans la scène courante", () => {
    expect(filterCharacters([player('1', 'city-A')], 'city-A')).toHaveLength(1);
  });

  it("masque un joueur assigné à une autre scène", () => {
    expect(filterCharacters([player('1', 'city-B')], 'city-A')).toHaveLength(0);
  });

  it("affiche un joueur sans scène même si currentCityId est null", () => {
    expect(filterCharacters([player('1')], null)).toHaveLength(1);
  });
});

describe("filterCharacters — alliés", () => {
  it("affiche un allié sans scène assignée", () => {
    expect(filterCharacters([ally('1')], 'city-A')).toHaveLength(1);
  });

  it("affiche un allié dans la bonne scène", () => {
    expect(filterCharacters([ally('1', 'city-A')], 'city-A')).toHaveLength(1);
  });

  it("masque un allié dans une autre scène", () => {
    expect(filterCharacters([ally('1', 'city-B')], 'city-A')).toHaveLength(0);
  });
});

describe("filterCharacters — PNJ", () => {
  it("affiche un PNJ avec currentSceneId correspondant", () => {
    expect(filterCharacters([npc('1', 'city-A')], 'city-A')).toHaveLength(1);
  });

  it("affiche un PNJ avec cityId correspondant (legacy)", () => {
    expect(filterCharacters([npc('1', undefined, 'city-A')], 'city-A')).toHaveLength(1);
  });

  it("masque un PNJ dans une autre scène", () => {
    expect(filterCharacters([npc('1', 'city-B')], 'city-A')).toHaveLength(0);
  });

  it("masque tous les PNJ si currentCityId est null (World Map)", () => {
    expect(filterCharacters([npc('1', 'city-A'), npc('2')], null)).toHaveLength(0);
  });
});

// ─── sortByInitiative + rotation autour du joueur actif ──────────────────────

function sortAndRotate(chars: Character[], activePlayerId: string | null): Character[] {
  const sorted = [...chars].sort((a, b) => (b.currentInit ?? 0) - (a.currentInit ?? 0));

  if (!activePlayerId) return sorted;

  const activeIndex = sorted.findIndex(c => c.id === activePlayerId);
  if (activeIndex <= 0) return sorted;

  return [...sorted.slice(activeIndex), ...sorted.slice(0, activeIndex)];
}

const withInit = (id: string, init: number): Character => ({
  id, name: id, pv: 10, init, type: 'joueurs', Defense: 10, currentInit: init,
});

describe("sortAndRotate — tri par initiative", () => {
  it("trie par initiative décroissante", () => {
    const chars = [withInit('A', 5), withInit('B', 15), withInit('C', 10)];
    const result = sortAndRotate(chars, null);
    expect(result.map(c => c.id)).toEqual(['B', 'C', 'A']);
  });

  it("ne modifie pas l'ordre si activePlayerId est null", () => {
    const chars = [withInit('A', 20), withInit('B', 10)];
    expect(sortAndRotate(chars, null)[0].id).toBe('A');
  });

  it("met le joueur actif en première position", () => {
    const chars = [withInit('A', 20), withInit('B', 15), withInit('C', 10)];
    const result = sortAndRotate(chars, 'B');
    expect(result[0].id).toBe('B');
    expect(result[1].id).toBe('C');
    expect(result[2].id).toBe('A');
  });

  it("ne tourne pas si le joueur actif est déjà premier", () => {
    const chars = [withInit('A', 20), withInit('B', 10)];
    const result = sortAndRotate(chars, 'A');
    expect(result[0].id).toBe('A');
  });

  it("préserve tous les personnages après rotation", () => {
    const chars = [withInit('A', 20), withInit('B', 15), withInit('C', 10), withInit('D', 5)];
    const result = sortAndRotate(chars, 'C');
    expect(result).toHaveLength(4);
    expect(result.map(c => c.id).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ─── applyDamage — calcul des PV ─────────────────────────────────────────────

function computeNewPv(currentPv: number, damage: number): number {
  return Math.max(0, currentPv - damage);
}

describe("computeNewPv (applyDamage)", () => {
  it("soustrait les dégâts des PV", () => {
    expect(computeNewPv(20, 5)).toBe(15);
  });

  it("ne descend pas en dessous de 0", () => {
    expect(computeNewPv(5, 10)).toBe(0);
    expect(computeNewPv(0, 5)).toBe(0);
  });

  it("gère des dégâts nuls", () => {
    expect(computeNewPv(20, 0)).toBe(20);
  });

  it("gère des dégâts exacts (PV → 0)", () => {
    expect(computeNewPv(10, 10)).toBe(0);
  });
});

// ─── rerollInitiative — calcul totalInit ─────────────────────────────────────

function computeInitiative(initStat: number, diceRoll: number): { currentInit: number; initDetails: string } {
  const totalInit = initStat + diceRoll;
  return {
    currentInit: totalInit,
    initDetails: `${initStat}+${diceRoll}=${totalInit}`,
  };
}

describe("computeInitiative (rerollInitiative)", () => {
  it("additionne la stat INIT et le dé", () => {
    expect(computeInitiative(3, 15)).toEqual({ currentInit: 18, initDetails: "3+15=18" });
  });

  it("formate le détail correctement", () => {
    expect(computeInitiative(0, 7)).toEqual({ currentInit: 7, initDetails: "0+7=7" });
  });

  it("gère une stat INIT négative", () => {
    expect(computeInitiative(-1, 12)).toEqual({ currentInit: 11, initDetails: "-1+12=11" });
  });

  it("gère un dé au maximum (20)", () => {
    expect(computeInitiative(5, 20)).toEqual({ currentInit: 25, initDetails: "5+20=25" });
  });

  it("gère un 1 naturel", () => {
    expect(computeInitiative(3, 1)).toEqual({ currentInit: 4, initDetails: "3+1=4" });
  });
});

// ─── isSuccess — parsing du rapport d'attaque ────────────────────────────────

function parseIsSuccess(data: { réussite?: boolean; resultat?: string }): boolean {
  return data.réussite === true || data.resultat === "Success" || data.resultat === "success";
}

describe("parseIsSuccess (rapport d'attaque)", () => {
  it("retourne true si réussite = true", () => {
    expect(parseIsSuccess({ réussite: true })).toBe(true);
  });

  it("retourne false si réussite = false", () => {
    expect(parseIsSuccess({ réussite: false })).toBe(false);
  });

  it("retourne true si resultat = 'Success'", () => {
    expect(parseIsSuccess({ resultat: 'Success' })).toBe(true);
  });

  it("retourne true si resultat = 'success' (minuscule)", () => {
    expect(parseIsSuccess({ resultat: 'success' })).toBe(true);
  });

  it("retourne false si resultat = 'Failure'", () => {
    expect(parseIsSuccess({ resultat: 'Failure' })).toBe(false);
  });

  it("retourne false si aucune propriété n'est définie", () => {
    expect(parseIsSuccess({})).toBe(false);
  });
});

// ─── CONDITIONS — cohérence des données ──────────────────────────────────────

const CONDITIONS = [
  { id: 'poisoned', label: 'Empoisonné' },
  { id: 'stunned', label: 'Etourdi' },
  { id: 'blinded', label: 'Aveuglé' },
];

describe("CONDITIONS", () => {
  it("contient 3 conditions prédéfinies", () => {
    expect(CONDITIONS).toHaveLength(3);
  });

  it("chaque condition a un id et un label", () => {
    CONDITIONS.forEach(c => {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
    });
  });

  it("les ids sont uniques", () => {
    const ids = CONDITIONS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contient poisoned, stunned, blinded", () => {
    const ids = CONDITIONS.map(c => c.id);
    expect(ids).toContain('poisoned');
    expect(ids).toContain('stunned');
    expect(ids).toContain('blinded');
  });
});
