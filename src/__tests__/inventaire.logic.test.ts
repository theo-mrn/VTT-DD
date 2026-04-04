/**
 * Tests sur les logiques pures extraites de inventaire2.tsx
 */

// ─── Données statiques ────────────────────────────────────────────────────────

const predefinedItems: Record<string, string[]> = {
  'armes-contact': ['Épée à une main', 'Épée à deux mains', 'Épée longue', 'Katana', 'Rapière', 'Hache', 'Marteau'],
  'armes-distance': ['Arc léger', 'Arc lourd', 'Arbalète', 'Couteaux de lancer'],
  'armures': ['Armure légère', 'Armure de cuir', 'Armure lourde', 'Côte de maille'],
  'potions': ['Petite potion de vie', 'Grande potion de vie', 'Fortifiant', 'Potion de dégat'],
  'bourse': ["pièce d'OR", "pièce d'argent", "pièce de cuivre"],
  'nourriture': ['Pomme', 'Pain', 'Fromage', 'Champignon', 'Pomme de terre', 'viande', 'Minotaure'],
  'autre': []
};

const statAttributes = ["CON", "SAG", "DEX", "FOR", "CHA", "INT", "PV", "Defense", "INIT", "Contact", "Distance", "Magie"];

// ─── Logique filteredInventory (extraite du useMemo) ───────────────────────��─

interface InventoryItem {
  id: string;
  message: string;
  category: string;
  quantity: number;
}

function filterAndSort(inventory: InventoryItem[], searchTerm: string, sortBy: string): InventoryItem[] {
  return inventory
    .filter(item => item.message && item.message.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.message.localeCompare(b.message);
        case 'quantity-desc':
          return b.quantity - a.quantity;
        case 'quantity-asc':
          return a.quantity - b.quantity;
        case 'category':
        default:
          const categoryOrder = Object.keys(predefinedItems);
          const categoryCompare = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
          return categoryCompare !== 0 ? categoryCompare : a.message.localeCompare(b.message);
      }
    });
}

const sampleInventory: InventoryItem[] = [
  { id: '1', message: 'Épée longue', category: 'armes-contact', quantity: 1 },
  { id: '2', message: 'Arc lourd', category: 'armes-distance', quantity: 2 },
  { id: '3', message: 'Petite potion de vie', category: 'potions', quantity: 5 },
  { id: '4', message: 'Armure lourde', category: 'armures', quantity: 1 },
  { id: '5', message: 'Pomme', category: 'nourriture', quantity: 10 },
];

describe("filteredInventory — recherche", () => {
  it("retourne tous les items si searchTerm est vide", () => {
    expect(filterAndSort(sampleInventory, '', 'category')).toHaveLength(5);
  });

  it("filtre par nom (insensible à la casse)", () => {
    const result = filterAndSort(sampleInventory, 'épée', 'category');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Épée longue');
  });

  it("filtre par terme partiel", () => {
    const result = filterAndSort(sampleInventory, 'potion', 'category');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Petite potion de vie');
  });

  it("retourne un tableau vide si aucun item ne correspond", () => {
    expect(filterAndSort(sampleInventory, 'dragon', 'category')).toHaveLength(0);
  });
});

describe("filteredInventory — tri alphabétique", () => {
  it("trie par ordre alphabétique croissant", () => {
    const result = filterAndSort(sampleInventory, '', 'alphabetical');
    const names = result.map(i => i.message);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("filteredInventory — tri par quantité", () => {
  it("trie par quantité décroissante", () => {
    const result = filterAndSort(sampleInventory, '', 'quantity-desc');
    const quantities = result.map(i => i.quantity);
    for (let i = 1; i < quantities.length; i++) {
      expect(quantities[i]).toBeLessThanOrEqual(quantities[i - 1]);
    }
  });

  it("trie par quantité croissante", () => {
    const result = filterAndSort(sampleInventory, '', 'quantity-asc');
    const quantities = result.map(i => i.quantity);
    for (let i = 1; i < quantities.length; i++) {
      expect(quantities[i]).toBeGreaterThanOrEqual(quantities[i - 1]);
    }
  });
});

describe("filteredInventory — tri par catégorie", () => {
  it("trie selon l'ordre des catégories prédéfinies", () => {
    const result = filterAndSort(sampleInventory, '', 'category');
    const categoryOrder = Object.keys(predefinedItems);
    const categoryIndices = result.map(i => categoryOrder.indexOf(i.category));
    for (let i = 1; i < categoryIndices.length; i++) {
      expect(categoryIndices[i]).toBeGreaterThanOrEqual(categoryIndices[i - 1]);
    }
  });
});

// ─── Validation du don d'objet ────────────────────────────────────────────────

function canGiveItem(giveQuantity: number, itemQuantity: number, targetPlayer: string): boolean {
  return !!targetPlayer && giveQuantity > 0 && giveQuantity <= itemQuantity;
}

describe("canGiveItem — validation avant le don", () => {
  it("autorise le don si tout est valide", () => {
    expect(canGiveItem(1, 5, 'Gandalf')).toBe(true);
  });

  it("autorise de donner la totalité des items", () => {
    expect(canGiveItem(5, 5, 'Gandalf')).toBe(true);
  });

  it("refuse si la quantité à donner dépasse le stock", () => {
    expect(canGiveItem(6, 5, 'Gandalf')).toBe(false);
  });

  it("refuse si la quantité à donner est 0", () => {
    expect(canGiveItem(0, 5, 'Gandalf')).toBe(false);
  });

  it("refuse si la quantité à donner est négative", () => {
    expect(canGiveItem(-1, 5, 'Gandalf')).toBe(false);
  });

  it("refuse si aucun joueur cible n'est sélectionné", () => {
    expect(canGiveItem(1, 5, '')).toBe(false);
  });
});

// ─── Cohérence des données statiques ─────────────────────────────────────────

describe("predefinedItems", () => {
  it("contient les 7 catégories attendues", () => {
    const expected = ['armes-contact', 'armes-distance', 'armures', 'potions', 'bourse', 'nourriture', 'autre'];
    expect(Object.keys(predefinedItems)).toEqual(expected);
  });

  it("chaque catégorie est un tableau", () => {
    Object.values(predefinedItems).forEach(items => {
      expect(Array.isArray(items)).toBe(true);
    });
  });

  it("pas de doublons dans les items d'une même catégorie", () => {
    Object.entries(predefinedItems).forEach(([category, items]) => {
      const unique = new Set(items);
      expect(unique.size).toBe(items.length);
    });
  });
});

describe("statAttributes", () => {
  it("contient les 12 stats attendues", () => {
    expect(statAttributes).toHaveLength(12);
  });

  it("contient les 6 stats D&D de base", () => {
    ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].forEach(stat => {
      expect(statAttributes).toContain(stat);
    });
  });

  it("contient les stats de combat", () => {
    ['Contact', 'Distance', 'Magie', 'Defense', 'INIT'].forEach(stat => {
      expect(statAttributes).toContain(stat);
    });
  });

  it("pas de doublons", () => {
    expect(new Set(statAttributes).size).toBe(statAttributes.length);
  });
});
