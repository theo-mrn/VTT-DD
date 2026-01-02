// Bibliothèque de sons prédéfinis
export interface SuggestedSound {
    name: string
    path: string
    category: string
    duration?: number
}

export const SOUND_CATEGORIES = [
    { id: 'all', label: 'Tous les sons' },
    { id: 'ambiance', label: 'Ambiance' },
    { id: 'creatures', label: 'Créatures' },
    { id: 'nature', label: 'Nature' },
    { id: 'foule', label: 'Foule & Ville' },
]

export const SUGGESTED_SOUNDS: SuggestedSound[] = [
    // Ambiance
    { name: 'Forêt', path: '/Audio/foret.mp3', category: 'ambiance' },
    { name: 'Eau', path: '/Audio/eau.mp3', category: 'ambiance' },
    { name: 'Feu', path: '/Audio/feu.mp3', category: 'ambiance' },

    // Nature
    { name: 'Forêt Paisible', path: '/Audio/foret.mp3', category: 'nature' },
    { name: 'Rivière', path: '/Audio/eau.mp3', category: 'nature' },
    { name: 'Feu de Camp', path: '/Audio/feu.mp3', category: 'nature' },

    // Créatures
    { name: 'Monstre', path: '/Audio/monstre.mp3', category: 'creatures' },

    // Foule
    { name: 'Foule', path: '/Audio/crowd.mp3', category: 'foule' },
]
