export type TokenRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type UnlockCondition = 'free' | 'purchase' | 'challenge';

export interface TokenSkin {
    id: string; // e.g., 'Token1', 'Token2'
    name: string;
    description?: string;
    price: number;
    rarity: TokenRarity;
    unlockCondition: UnlockCondition;
}

// These match the filenames we expect from the API (e.g. "Token1")
export const TOKEN_DEFINITIONS: Record<string, TokenSkin> = {
    'Token1': {
        id: 'Token1',
        name: 'Cadre Classique',
        description: 'Un cadre simple et élégant, parfait pour commencer.',
        price: 0,
        rarity: 'common',
        unlockCondition: 'free'
    },
    'Token2': {
        id: 'Token2',
        name: 'Cadre Argenté',
        description: 'Reflets d\'argent sur métal sombre.',
        price: 0,
        rarity: 'common',
        unlockCondition: 'free'
    },
    'Token3': {
        id: 'Token3',
        name: 'Cadre Doré',
        description: 'Ornez votre portrait des richesses d\'antan.',
        price: 150,
        rarity: 'uncommon',
        unlockCondition: 'purchase'
    },
    'Token4': {
        id: 'Token4',
        name: 'Cadre Sanguin',
        description: 'Forgé dans le sang de vos ennemis.',
        price: 300,
        rarity: 'rare',
        unlockCondition: 'purchase'
    },
    'Token5': {
        id: 'Token5',
        name: 'Cadre Sylvestre',
        description: 'Protégé par les esprits de la forêt.',
        price: 300,
        rarity: 'rare',
        unlockCondition: 'purchase'
    },
    'Token6': {
        id: 'Token6',
        name: 'Cadre Abyssal',
        description: 'Sondant les profondeurs inconnues.',
        price: 500,
        rarity: 'epic',
        unlockCondition: 'purchase'
    },
    'Token7': {
        id: 'Token7',
        name: 'Cadre Céleste',
        description: 'Brille de la lumière des étoiles.',
        price: 800,
        rarity: 'legendary',
        unlockCondition: 'purchase'
    },
};

export const DEFAULT_TOKEN_INVENTORY = ['Token1', 'Token2'];

// Helper to provide a fallback definition if a token isn't explicitly defined
export const getTokenDefinition = (tokenId: string): TokenSkin => {
    if (TOKEN_DEFINITIONS[tokenId]) {
        return TOKEN_DEFINITIONS[tokenId];
    }

    // Fallback for unknown tokens loaded from API
    return {
        id: tokenId,
        name: `Cadre Mystère (${tokenId})`,
        description: 'Un cadre d\'origine inconnue.',
        price: 100,
        rarity: 'common',
        unlockCondition: 'purchase'
    };
};
