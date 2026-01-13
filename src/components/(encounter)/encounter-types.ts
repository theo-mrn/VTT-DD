export interface BestiaryData {
    Nom: string;
    Type: string;
    description: string;
    image?: string;
    niveau: number;
    Challenge?: string;
    PV: number;
    PV_Max: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    FOR: number;
    DEX: number;
    CON: number;
    INT: number;
    SAG: number;
    CHA: number;
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
}

export type EncounterDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Deadly';

export interface EncounterSettings {
    partySize: number;
    partyLevel: number;
    difficulty: EncounterDifficulty;
    monsterTypes?: string[]; // Optional filter list
}

export interface GeneratedEncounter {
    monsters: {
        creature: BestiaryData;
        count: number;
        id: string; // unique ID for referencing
    }[];
    totalXp: number;
    difficulty: EncounterDifficulty;
}
