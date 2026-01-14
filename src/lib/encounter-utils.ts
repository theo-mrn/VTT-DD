import { BestiaryData, EncounterDifficulty, EncounterSettings, GeneratedEncounter } from "@/components/(encounter)/encounter-types";

// XP Thresholds per character level (D&D 5e DMG)
const XP_THRESHOLDS: Record<number, Record<EncounterDifficulty, number>> = {
    1: { Easy: 25, Medium: 50, Hard: 75, Deadly: 100 },
    2: { Easy: 50, Medium: 100, Hard: 150, Deadly: 200 },
    3: { Easy: 75, Medium: 150, Hard: 225, Deadly: 400 },
    4: { Easy: 125, Medium: 250, Hard: 375, Deadly: 500 },
    5: { Easy: 250, Medium: 500, Hard: 750, Deadly: 1100 },
    6: { Easy: 300, Medium: 600, Hard: 900, Deadly: 1400 },
    7: { Easy: 350, Medium: 750, Hard: 1100, Deadly: 1700 },
    8: { Easy: 450, Medium: 900, Hard: 1400, Deadly: 2100 },
    9: { Easy: 550, Medium: 1100, Hard: 1600, Deadly: 2400 },
    10: { Easy: 600, Medium: 1200, Hard: 1900, Deadly: 2800 },
    11: { Easy: 800, Medium: 1600, Hard: 2400, Deadly: 3600 },
    12: { Easy: 1000, Medium: 2000, Hard: 3000, Deadly: 4500 },
    13: { Easy: 1100, Medium: 2200, Hard: 3400, Deadly: 5100 },
    14: { Easy: 1250, Medium: 2500, Hard: 3800, Deadly: 5700 },
    15: { Easy: 1400, Medium: 2800, Hard: 4300, Deadly: 6400 },
    16: { Easy: 1600, Medium: 3200, Hard: 4800, Deadly: 7200 },
    17: { Easy: 2000, Medium: 3900, Hard: 5900, Deadly: 8800 },
    18: { Easy: 2100, Medium: 4200, Hard: 6300, Deadly: 9500 },
    19: { Easy: 2400, Medium: 4900, Hard: 7300, Deadly: 10900 },
    20: { Easy: 2800, Medium: 5700, Hard: 8500, Deadly: 12700 },
};

// Challenge Rating to XP mapping
const CR_TO_XP: Record<string, number> = {
    "0": 10, "0.125": 25, "0.25": 50, "0.5": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
    "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
    "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "30": 155000
};

// Multipliers for number of monsters
const MONSTER_MULTIPLIERS = [
    { count: 1, multiplier: 1 },
    { count: 2, multiplier: 1.5 },
    { count: 3, multiplier: 2 }, // 3-6
    { count: 7, multiplier: 2.5 }, // 7-10
    { count: 11, multiplier: 3 }, // 11-14
    { count: 15, multiplier: 4 }, // 15+
];

export const getEncounterMultiplier = (count: number): number => {
    if (count <= 1) return 1;
    if (count === 2) return 1.5;
    if (count >= 3 && count <= 6) return 2;
    if (count >= 7 && count <= 10) return 2.5;
    if (count >= 11 && count <= 14) return 3;
    return 4;
};

export const fetchBestiary = async (): Promise<Record<string, BestiaryData>> => {
    try {
        const response = await fetch('/tabs/bestiairy.json');
        if (!response.ok) {
            throw new Error('Failed to fetch bestiary');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching bestiary:', error);
        return {};
    }
};

export const calculateEncounterBudget = (
    partySize: number,
    partyLevel: number,
    difficulty: EncounterDifficulty
): number => {
    const levelThresholds = XP_THRESHOLDS[Math.max(1, Math.min(20, partyLevel))];
    return levelThresholds[difficulty] * partySize;
};

// Helper to safely parse CR
const parseCR = (cr: string | undefined): number => {
    if (!cr) return 0;
    if (cr.includes('/')) {
        const [num, den] = cr.split('/');
        return parseInt(num) / parseInt(den);
    }
    return parseFloat(cr);
};

export type EncounterScenarioType = 'Balanced' | 'Horde' | 'Boss';

export const SCENARIO_TYPES: Record<EncounterScenarioType, { label: string, description: string, maxCRRatio: number, minCount: number, maxCount: number }> = {
    'Balanced': { label: 'Groupe Restreint', description: '1 ou 2 créatures solides.', maxCRRatio: 1.1, minCount: 1, maxCount: 2 },
    'Horde': { label: 'Horde', description: 'Beaucoup de créatures plus faibles.', maxCRRatio: 0.4, minCount: 4, maxCount: 15 },
    'Boss': { label: 'Boss Solitaire', description: 'Une créature très puissante.', maxCRRatio: 1.6, minCount: 1, maxCount: 1 }
};

/**
 * Filter monsters that are appropriate for the target CR range.
 */
const filterCandidates = (
    bestiary: BestiaryData[],
    targetBudget: number,
    partyLevel: number,
    monsterTypes?: string[],
    maxCRRatio: number = 1.0
): BestiaryData[] => {
    return bestiary.filter(monster => {
        const crValue = parseCR(monster.Challenge);

        // Filter by types if specified
        if (monsterTypes && monsterTypes.length > 0 && !monsterTypes.includes('Any')) {
            const monsterTypeStr = monster.Type.toLowerCase();
            // Check if ANY selected type matches
            const hasMatch = monsterTypes.some(t => monsterTypeStr.includes(t.toLowerCase()));
            if (!hasMatch) return false;
        }

        // Logic 1: Max CR based on Party Level and Scenario
        const maxCR = Math.max(0.25, partyLevel * maxCRRatio + (maxCRRatio > 1.2 ? 3 : 0));

        if (crValue > maxCR) return false;

        // Logic 2: Min CR to avoid pests at high levels, unless Horde
        if (maxCRRatio >= 0.9 && crValue < partyLevel * 0.2) return false;

        // Logic 3: Budget Cap
        const budgetCapMultiplier = maxCRRatio > 1.2 ? 1.5 : 1.2;
        const xp = CR_TO_XP[monster.Challenge || "0"] || 10;

        if (xp > targetBudget * budgetCapMultiplier) return false;

        if (!monster.Challenge) return false;

        return true;
    });
};

const generateSingleEncounter = (
    candidates: BestiaryData[],
    budget: number,
    scenario: EncounterScenarioType,
    difficulty: EncounterDifficulty
): GeneratedEncounter => {
    const config = SCENARIO_TYPES[scenario];
    const encounterMonsters: { creature: BestiaryData; count: number; id: string }[] = [];
    let currentXp = 0;

    // Sort logic
    if (scenario === 'Boss' || scenario === 'Balanced') {
        candidates.sort((a, b) => parseCR(b.Challenge) - parseCR(a.Challenge));
    } else {
        // Horde: Random start
        candidates.sort(() => Math.random() - 0.5);
    }

    //  VARIETY CONTROL: Pre-select a limited pool of creature types
    let allowedCandidates = [...candidates];

    if (scenario === 'Horde') {
        // Pick 1 or 2 distinct creature definitions to form the horde
        // If candidates are many, pick 1-2 random ones from them.
        if (allowedCandidates.length > 0) {
            const numTypes = Math.random() > 0.4 ? 2 : 1;
            // Better selection: Pick 1 random, then maybe another that is close in CR?
            // For now simple random subset
            const shuffled = [...allowedCandidates].sort(() => Math.random() - 0.5);
            allowedCandidates = shuffled.slice(0, numTypes);
        }
    }

    let attempts = 0;

    // Try to fill budget
    while (attempts < 200) {
        attempts++;
        const totalCount = encounterMonsters.reduce((sum, m) => sum + m.count, 0);

        // Stop if we hit max count
        if (totalCount >= config.maxCount) break;

        // Stop if budget full (considering multiplier)
        const multiplier = getEncounterMultiplier(totalCount);
        const adjustedXp = currentXp * multiplier;
        if (adjustedXp >= budget * 0.95) break;

        // Pick candidate strategy
        let candidate: BestiaryData | undefined;

        if (allowedCandidates.length === 0) break;

        if (scenario === 'Boss') {
            // Pick from top tier
            candidate = allowedCandidates[Math.floor(Math.random() * Math.min(5, allowedCandidates.length))];
        } else if (scenario === 'Balanced') {
            // Pick from top portion 
            candidate = allowedCandidates[Math.floor(Math.random() * Math.min(15, allowedCandidates.length))];
        } else {
            // Horde: Random from the RESTRICTED pool
            candidate = allowedCandidates[Math.floor(Math.random() * allowedCandidates.length)];
        }

        if (!candidate) break;

        const candidateXp = CR_TO_XP[candidate.Challenge || "0"] || 0;
        const nextTotalCount = totalCount + 1;
        const nextMultiplier = getEncounterMultiplier(nextTotalCount);
        const nextAdjustedXp = (currentXp + candidateXp) * nextMultiplier;

        // Check availability
        // Loose overshoot allowed for single strong monsters
        const budgetOvershoot = (scenario === 'Boss' || (scenario === 'Balanced' && totalCount === 0)) ? 1.4 : 1.2;

        if (nextAdjustedXp <= budget * budgetOvershoot) {
            const existing = encounterMonsters.find(m => m.creature.Nom === candidate.Nom);
            if (existing) {
                existing.count++;
            } else {
                encounterMonsters.push({
                    creature: candidate,
                    count: 1,
                    id: Math.random().toString(36).substr(2, 9)
                });
            }
            currentXp += candidateXp;
        }
    }

    // Formatting
    encounterMonsters.sort((a, b) => parseCR(b.creature.Challenge) - parseCR(a.creature.Challenge));
    const finalCount = encounterMonsters.reduce((sum, m) => sum + m.count, 0);

    return {
        monsters: encounterMonsters,
        totalXp: Math.floor(currentXp * getEncounterMultiplier(finalCount)),
        difficulty: difficulty,
    };
};

export const generateEncounterScenarios = (
    bestiary: Record<string, BestiaryData>,
    settings: EncounterSettings
): { [key in EncounterScenarioType]?: GeneratedEncounter } => {
    // Slight difficulty bump (1.1x)
    const baseBudget = calculateEncounterBudget(settings.partySize, settings.partyLevel, settings.difficulty);
    const budget = baseBudget * 1.1;

    const allMonsters = Object.values(bestiary);
    const scenarios: { [key in EncounterScenarioType]?: GeneratedEncounter } = {};

    (['Balanced', 'Horde', 'Boss'] as EncounterScenarioType[]).forEach(type => {
        const config = SCENARIO_TYPES[type];

        let candidates = filterCandidates(
            allMonsters,
            budget,
            settings.partyLevel,
            settings.monsterTypes,
            config.maxCRRatio
        );

        if (candidates.length > 0) {
            scenarios[type] = generateSingleEncounter(candidates, budget, type, settings.difficulty);
        }
    });

    return scenarios;
};
