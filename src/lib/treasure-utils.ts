import { GeneratedEncounter } from "@/components/(encounter)/encounter-types";

// Hiérarchie monétaire : 1 pp = 10 po = 100 pa = 1000 pc (pa = monnaie de référence)
export type Coins = { pp: number; po: number; pa: number; pc: number };

// Valeur d'une pièce exprimée en pa (pièce d'argent, monnaie de référence)
// 1 pp = 10 pa, 1 po = 10 pa (or), 1 pa = 1, 1 pc = 0.1
const COIN_VALUE_IN_PA: Record<keyof Coins, number> = {
    pp: 10,
    po: 10,
    pa: 1,
    pc: 0.1,
};

// XP par Challenge Rating (aligné sur encounter-utils)
const CR_TO_XP: Record<string, number> = {
    "0": 10, "0.125": 25, "0.25": 50, "0.5": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
    "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
    "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "30": 155000
};

const parseCR = (cr: string | undefined): number => {
    if (!cr) return 0;
    if (cr.includes('/')) {
        const [num, den] = cr.split('/');
        return parseInt(num) / parseInt(den);
    }
    return parseFloat(cr) || 0;
};

export type TreasureItem = {
    nom: string;
    category: string;
    /** Valeur unitaire estimée en pa (pour info / tri) */
    valuePa: number;
    quantity: number;
};

export type Treasure = {
    coins: Coins;
    items: TreasureItem[];
    /** Budget total utilisé pour générer ce trésor (en pa), pour debug/affichage */
    budgetPa: number;
};

export type EquipmentItem = { nom: string; prix?: string; [k: string]: unknown };
export type EquipmentData = Record<string, EquipmentItem[]>;

// Extrait (valeur en pa, ok?) d'une chaîne de prix de data.json.
// Gère "10 pa", "10-100 pa", "de 2 à 20 pa", "150 000 po", "10 pa/jour".
const parsePricePa = (prix?: string): number | null => {
    if (!prix) return null;
    const cleaned = prix.replace(/\s+/g, ' ').trim();
    // Premier nombre (en retirant les espaces de milliers)
    const numMatch = cleaned.match(/\d[\d\s]*/);
    if (!numMatch) return null;
    const value = parseInt(numMatch[0].replace(/\s/g, ''), 10);
    if (isNaN(value)) return null;
    // Unité
    const unitMatch = cleaned.match(/p[pcoa]/);
    const unit = (unitMatch ? unitMatch[0] : 'pa') as keyof Coins;
    return value * (COIN_VALUE_IN_PA[unit] ?? 1);
};

// Convertit un montant en pa vers un mix de pièces (pp/po/pa/pc),
// en gardant ~la moitié en argent pour rester lisible/jouable.
const distributeCoins = (totalPa: number): Coins => {
    const coins: Coins = { pp: 0, po: 0, pa: 0, pc: 0 };
    let remaining = Math.max(0, Math.round(totalPa));

    // Convertit une partie en platine (grosses sommes uniquement)
    if (remaining >= 100) {
        const ppValue = Math.floor((remaining * 0.3) / 10); // 30% en pp
        coins.pp = ppValue;
        remaining -= ppValue * 10;
    }

    // Le reste majoritairement en pa, avec un peu de cuivre pour le réalisme
    coins.pa = remaining;

    // Saupoudre quelques pièces de cuivre (butin de petites créatures)
    coins.pc = Math.floor(Math.random() * 8);

    return coins;
};

// Butin de combat : uniquement des consommables (potions). On exclut volontairement
// les objets génériques (silex, torches, sac de couchage…), armes, armures, etc.
const LOOT_CATEGORIES = ['potions'];

// Poids de tirage par catégorie
const CATEGORY_WEIGHT: Record<string, number> = {
    potions: 5,
};

type PricedItem = { nom: string; category: string; valuePa: number };

const buildPricedPool = (data: EquipmentData): PricedItem[] => {
    const pool: PricedItem[] = [];
    for (const category of LOOT_CATEGORIES) {
        const list = data[category];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const valuePa = parsePricePa(item.prix);
            if (valuePa == null || valuePa <= 0) continue;
            pool.push({ nom: item.nom, category, valuePa });
        }
    }
    return pool;
};

// Tirage pondéré (potions priorisées), borné par le budget restant.
const pickItem = (pool: PricedItem[], maxValuePa: number): PricedItem | null => {
    const affordable = pool.filter(p => p.valuePa <= maxValuePa);
    if (affordable.length === 0) return null;

    const weighted = affordable.map(p => ({
        item: p,
        weight: CATEGORY_WEIGHT[p.category] ?? 1,
    }));
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * totalWeight;
    for (const w of weighted) {
        r -= w.weight;
        if (r <= 0) return w.item;
    }
    return weighted[weighted.length - 1].item;
};

export type TreasureOptions = {
    /** Multiplicateur global de générosité (1 = normal) */
    richness?: number;
};

/**
 * Génère un trésor cohérent avec une rencontre :
 * - le budget dépend du CR total ET du nombre de créatures
 * - une partie va en pièces, le reste en objets (potions/consommables priorisés)
 */
export const generateTreasure = (
    encounter: GeneratedEncounter,
    data: EquipmentData,
    options: TreasureOptions = {}
): Treasure => {
    const richness = options.richness ?? 1;

    // 1) Budget basé sur le CR total + nombre de créatures
    let crXpSum = 0;
    let monsterCount = 0;
    for (const m of encounter.monsters) {
        const xp = CR_TO_XP[m.creature.Challenge || "0"] || parseCR(m.creature.Challenge) * 100 || 10;
        crXpSum += xp * m.count;
        monsterCount += m.count;
    }

    // Conversion XP -> pa : volontairement modeste (~1 pa pour 40 XP), avec un léger
    // bonus selon le nombre de créatures (petit butin cumulé).
    const baseBudgetPa = (crXpSum / 40) * (1 + monsterCount * 0.03) * richness;
    // Aléa ±25 %
    const budgetPa = Math.max(1, Math.round(baseBudgetPa * (0.75 + Math.random() * 0.5)));

    // 2) Répartition : ~35 % pièces, le reste pour les objets
    const coinBudget = Math.round(budgetPa * 0.35);
    let itemBudget = budgetPa - coinBudget;

    const coins = distributeCoins(coinBudget);

    // 3) Objets : on dépense itemBudget en piochant dans le pool,
    // avec un plafond strict du nombre total d'objets pour rester sobre.
    const pool = buildPricedPool(data);
    const itemsMap = new Map<string, TreasureItem>();

    // Plafond : 0 si budget minuscule, sinon 1 à 4 objets selon le budget
    const maxItems = budgetPa < 8 ? 1 : Math.min(4, 1 + Math.floor(budgetPa / 60));
    let itemCount = 0;

    let safety = 0;
    while (itemBudget > 0 && itemCount < maxItems && pool.length > 0 && safety < 50) {
        safety++;
        const picked = pickItem(pool, itemBudget);
        if (!picked) break;

        const key = picked.nom;
        const existing = itemsMap.get(key);
        if (existing) {
            existing.quantity++;
        } else {
            itemsMap.set(key, {
                nom: picked.nom,
                category: picked.category,
                valuePa: picked.valuePa,
                quantity: 1,
            });
            itemCount++;
        }
        itemBudget -= picked.valuePa;
    }

    return {
        coins,
        items: Array.from(itemsMap.values()).sort((a, b) => b.valuePa - a.valuePa),
        budgetPa,
    };
};
