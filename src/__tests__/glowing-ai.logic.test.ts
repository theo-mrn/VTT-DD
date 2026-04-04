/**
 * Tests sur les logiques pures extraites de glowing-ai-chat-assistant.tsx
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface RollableStat {
  key: string;
  label: string;
  rawValue: number;
  hasModifier: boolean;
}

interface FirebaseRoll {
  id: string;
  isPrivate: boolean;
  isBlind?: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number;
  userName: string;
  timestamp: number;
  notation?: string;
  output?: string;
}

// ─── replaceCharacteristics ───────────────────────────────────────────────────

function replaceCharacteristics(
  notation: string,
  rollableStats: RollableStat[],
  totalBonuses: Record<string, number> = {}
): string {
  if (!rollableStats.length) return notation;

  const sortedKeys = [...rollableStats.map(s => s.key)].sort((a, b) => b.length - a.length);
  const escapedKeys = sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

  return notation.replace(regex, (match) => {
    const stat = rollableStats.find(s => s.key.toLowerCase() === match.toLowerCase());
    if (!stat) return match;

    let baseValue = stat.rawValue;
    if (stat.key in totalBonuses) {
      baseValue += totalBonuses[stat.key] || 0;
    }

    const val = stat.hasModifier
      ? Math.floor((baseValue - 10) / 2)
      : baseValue;
    return val.toString();
  });
}

const baseStats: RollableStat[] = [
  { key: 'FOR', label: 'FOR', rawValue: 16, hasModifier: true },   // mod = +3
  { key: 'DEX', label: 'DEX', rawValue: 14, hasModifier: true },   // mod = +2
  { key: 'CON', label: 'CON', rawValue: 10, hasModifier: true },   // mod = 0
  { key: 'Defense', label: 'Déf', rawValue: 15, hasModifier: false },
  { key: 'INIT', label: 'INIT', rawValue: 4, hasModifier: false },
];

describe("replaceCharacteristics", () => {
  it("remplace une stat avec modificateur (FOR 16 → mod +3)", () => {
    expect(replaceCharacteristics("1d20+FOR", baseStats)).toBe("1d20+3");
  });

  it("remplace une stat avec modificateur (DEX 14 → mod +2)", () => {
    expect(replaceCharacteristics("1d20+DEX", baseStats)).toBe("1d20+2");
  });

  it("remplace une stat sans modificateur (Defense → valeur directe)", () => {
    expect(replaceCharacteristics("Defense", baseStats)).toBe("15");
  });

  it("remplace INIT sans modificateur", () => {
    expect(replaceCharacteristics("1d20+INIT", baseStats)).toBe("1d20+4");
  });

  it("est insensible à la casse", () => {
    expect(replaceCharacteristics("1d20+for", baseStats)).toBe("1d20+3");
    expect(replaceCharacteristics("1d20+For", baseStats)).toBe("1d20+3");
  });

  it("remplace plusieurs stats dans la même notation", () => {
    expect(replaceCharacteristics("FOR+DEX", baseStats)).toBe("3+2");
  });

  it("retourne la notation telle quelle si aucune stat ne correspond", () => {
    expect(replaceCharacteristics("1d20+5", baseStats)).toBe("1d20+5");
  });

  it("retourne la notation telle quelle si rollableStats est vide", () => {
    expect(replaceCharacteristics("1d20+FOR", [])).toBe("1d20+FOR");
  });

  it("ajoute le bonus au calcul du modificateur", () => {
    // FOR 16 (mod +3) + bonus FOR +2 → (16+2-10)/2 = 4
    expect(replaceCharacteristics("1d20+FOR", baseStats, { FOR: 2 })).toBe("1d20+4");
  });

  it("ajoute le bonus à une stat sans modificateur", () => {
    // Defense 15 + bonus +3 → 18
    expect(replaceCharacteristics("Defense", baseStats, { Defense: 3 })).toBe("18");
  });

  it("gère un modificateur négatif (CON 10 → mod 0)", () => {
    expect(replaceCharacteristics("1d20+CON", baseStats)).toBe("1d20+0");
  });

  it("gère une valeur faible (stat 8 → mod -1)", () => {
    const weakStats: RollableStat[] = [{ key: 'CHA', label: 'CHA', rawValue: 8, hasModifier: true }];
    expect(replaceCharacteristics("1d20+CHA", weakStats)).toBe("1d20+-1");
  });
});

// ─── parseDiceRequests ────────────────────────────────────────────────────────

function parseDiceRequests(notation: string): { type: string; count: number }[] {
  const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
  const requests: { type: string; count: number }[] = [];
  let match;
  while ((match = diceRegex.exec(notation)) !== null) {
    const count = parseInt(match[1]);
    const faces = parseInt(match[2]);
    requests.push({ type: `d${faces}`, count });
  }
  return requests;
}

describe("parseDiceRequests", () => {
  it("parse un dé simple (1d20)", () => {
    expect(parseDiceRequests("1d20")).toEqual([{ type: "d20", count: 1 }]);
  });

  it("parse plusieurs dés (2d6)", () => {
    expect(parseDiceRequests("2d6")).toEqual([{ type: "d6", count: 2 }]);
  });

  it("parse une notation composite (2d6+1d8)", () => {
    expect(parseDiceRequests("2d6+1d8")).toEqual([
      { type: "d6", count: 2 },
      { type: "d8", count: 1 },
    ]);
  });

  it("parse une notation avec modificateur numérique (ignore le +5)", () => {
    expect(parseDiceRequests("1d20+5")).toEqual([{ type: "d20", count: 1 }]);
  });

  it("parse la notation keep-high (2d20kh1)", () => {
    expect(parseDiceRequests("2d20kh1")).toEqual([{ type: "d20", count: 2 }]);
  });

  it("retourne un tableau vide si pas de dés", () => {
    expect(parseDiceRequests("5")).toEqual([]);
    expect(parseDiceRequests("FOR+3")).toEqual([]);
  });

  it("parse plusieurs groupes de dés différents", () => {
    const result = parseDiceRequests("1d4+2d6+1d12");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "d4", count: 1 });
    expect(result[1]).toEqual({ type: "d6", count: 2 });
    expect(result[2]).toEqual({ type: "d12", count: 1 });
  });
});

// ─── canDisplayRoll ───────────────────────────────────────────────────────────

function canDisplayRoll(roll: FirebaseRoll, isMJ: boolean, userName: string): boolean {
  if (isMJ) return true;
  if (roll.isBlind) return roll.userName === userName;
  if (!roll.isPrivate) return true;
  return roll.userName === userName;
}

const makeRoll = (overrides: Partial<FirebaseRoll> = {}): FirebaseRoll => ({
  id: '1', isPrivate: false, diceCount: 1, diceFaces: 20,
  modifier: 0, results: [12], total: 12, userName: 'Gandalf',
  timestamp: Date.now(), ...overrides,
});

describe("canDisplayRoll", () => {
  it("le MJ voit tous les jets", () => {
    expect(canDisplayRoll(makeRoll({ isPrivate: true }), true, 'MJ')).toBe(true);
    expect(canDisplayRoll(makeRoll({ isBlind: true }), true, 'MJ')).toBe(true);
  });

  it("un jet public est visible par tous", () => {
    expect(canDisplayRoll(makeRoll({ isPrivate: false }), false, 'Aragorn')).toBe(true);
  });

  it("un jet privé n'est visible que par son auteur", () => {
    expect(canDisplayRoll(makeRoll({ isPrivate: true, userName: 'Gandalf' }), false, 'Gandalf')).toBe(true);
    expect(canDisplayRoll(makeRoll({ isPrivate: true, userName: 'Gandalf' }), false, 'Aragorn')).toBe(false);
  });

  it("un jet aveugle n'est visible que par son auteur", () => {
    expect(canDisplayRoll(makeRoll({ isBlind: true, userName: 'Gandalf' }), false, 'Gandalf')).toBe(true);
    expect(canDisplayRoll(makeRoll({ isBlind: true, userName: 'Gandalf' }), false, 'Aragorn')).toBe(false);
  });

  it("un jet aveugle prime sur isPrivate=false", () => {
    // Blind overrides public — only the author should see it
    expect(canDisplayRoll(makeRoll({ isBlind: true, isPrivate: false, userName: 'Gandalf' }), false, 'Aragorn')).toBe(false);
  });
});

// ─── rollableStats — logique de filtrage selon overrides ─────────────────────

interface StatDef { key: string; label: string; hasModifier: boolean }

const DEFAULT_ROLLABLE: Record<string, boolean> = {
  FOR: true, DEX: true, CON: true, SAG: true, INT: true, CHA: true,
  Defense: false, Contact: false, Magie: false, Distance: false, INIT: false,
};

const BUILTIN_DEFS: StatDef[] = [
  { key: 'FOR', label: 'FOR', hasModifier: true },
  { key: 'DEX', label: 'DEX', hasModifier: true },
  { key: 'CON', label: 'CON', hasModifier: true },
  { key: 'SAG', label: 'SAG', hasModifier: true },
  { key: 'INT', label: 'INT', hasModifier: true },
  { key: 'CHA', label: 'CHA', hasModifier: true },
  { key: 'Defense', label: 'Déf', hasModifier: false },
  { key: 'Contact', label: 'Ctt', hasModifier: false },
  { key: 'Magie', label: 'Mag', hasModifier: false },
  { key: 'Distance', label: 'Dst', hasModifier: false },
  { key: 'INIT', label: 'INIT', hasModifier: false },
];

function buildRollableStats(
  statRollableOverrides: Record<string, boolean>,
  characterValues: Record<string, number>
): RollableStat[] {
  return BUILTIN_DEFS
    .filter(s => s.key in statRollableOverrides ? statRollableOverrides[s.key] : DEFAULT_ROLLABLE[s.key] ?? false)
    .map(s => ({
      key: s.key,
      label: s.label,
      rawValue: characterValues[s.key] ?? (s.hasModifier ? 10 : 0),
      hasModifier: s.hasModifier,
    }));
}

describe("buildRollableStats — filtrage selon overrides", () => {
  it("retourne les 6 stats de base par défaut (sans overrides)", () => {
    const result = buildRollableStats({}, {});
    const keys = result.map(s => s.key);
    expect(keys).toEqual(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA']);
  });

  it("peut activer Defense via override", () => {
    const result = buildRollableStats({ Defense: true }, {});
    expect(result.map(s => s.key)).toContain('Defense');
  });

  it("peut désactiver FOR via override", () => {
    const result = buildRollableStats({ FOR: false }, {});
    expect(result.map(s => s.key)).not.toContain('FOR');
  });

  it("applique la valeur du personnage à rawValue", () => {
    const result = buildRollableStats({}, { FOR: 18 });
    const forStat = result.find(s => s.key === 'FOR');
    expect(forStat?.rawValue).toBe(18);
  });

  it("utilise 10 comme rawValue par défaut pour les stats avec modificateur", () => {
    const result = buildRollableStats({}, {});
    const dex = result.find(s => s.key === 'DEX');
    expect(dex?.rawValue).toBe(10);
  });

  it("utilise 0 comme rawValue par défaut pour les stats sans modificateur", () => {
    const result = buildRollableStats({ Defense: true }, {});
    const def = result.find(s => s.key === 'Defense');
    expect(def?.rawValue).toBe(0);
  });

  it("hasModifier est true pour les stats D&D de base", () => {
    const result = buildRollableStats({}, {});
    result.forEach(s => expect(s.hasModifier).toBe(true));
  });

  it("hasModifier est false pour Defense", () => {
    const result = buildRollableStats({ Defense: true }, {});
    const def = result.find(s => s.key === 'Defense');
    expect(def?.hasModifier).toBe(false);
  });
});
