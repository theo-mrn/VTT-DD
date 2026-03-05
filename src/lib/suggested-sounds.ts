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
    { id: 'combat', label: 'Combat' },
    { id: 'magie', label: 'Magie' },
    { id: 'pas', label: 'Pas' },
    { id: 'portes', label: 'Portes' },
    { id: 'actions', label: 'Divers' },
]

export const SUGGESTED_SOUNDS: SuggestedSound[] = [
    // Ambiance
    { name: 'Forêt de Nuit', path: 'https://assets.yner.fr/Audio/Foret de_nuit.mp3', category: 'ambiance' },
    { name: 'Sonnette', path: 'https://assets.yner.fr/Audio/sonette.mp3', category: 'ambiance' },

    // Nature
    { name: 'Forêt Paisible', path: 'https://assets.yner.fr/Audio/foret.mp3', category: 'nature' },
    { name: 'Rivière', path: 'https://assets.yner.fr/Audio/eau.mp3', category: 'nature' },
    { name: 'Feu de Camp', path: 'https://assets.yner.fr/Audio/feu.mp3', category: 'nature' },
    { name: 'Insectes de Nuit', path: 'https://assets.yner.fr/Audio/insecte_nuit.mp3', category: 'nature' },
    { name: 'Pluie', path: 'https://assets.yner.fr/Audio/pluit.mp3', category: 'nature' },
    { name: 'Tonnerre', path: 'https://assets.yner.fr/Audio/tonere.mp3', category: 'nature' },
    { name: 'Orage', path: 'https://assets.yner.fr/Audio/orage.mp3', category: 'nature' },
    { name: 'Vent Doux', path: 'https://assets.yner.fr/Audio/vent1.mp3', category: 'nature' },
    { name: 'Vent Moyen', path: 'https://assets.yner.fr/Audio/vent2.mp3', category: 'nature' },
    { name: 'Vent Fort', path: 'https://assets.yner.fr/Audio/vent3.mp3', category: 'nature' },

    // Créatures
    { name: 'Dragon 1', path: 'https://assets.yner.fr/Audio/dragon.mp3', category: 'creatures' },
    { name: 'Dragon 2', path: 'https://assets.yner.fr/Audio/dragon2.mp3', category: 'creatures' },
    { name: 'Dragon Ailes', path: 'https://assets.yner.fr/Audio/dragon_battant_des_ailes.mp3', category: 'creatures' },
    { name: 'Dragon Dormant', path: 'https://assets.yner.fr/Audio/dragon_dormant.mp3', category: 'creatures' },
    { name: 'Gobelin 2', path: 'https://assets.yner.fr/Audio/ogre3.mp3', category: 'creatures' },
    { name: 'Rire de Gobelin', path: 'https://assets.yner.fr/Audio/rire_goblin.mp3', category: 'creatures' },
    { name: 'Mort de Gobelin', path: 'https://assets.yner.fr/Audio/goblin_death.mp3', category: 'creatures' },
    { name: 'Orque 1', path: 'https://assets.yner.fr/Audio/goblin.mp3', category: 'creatures' },
    { name: 'Orque 2', path: 'https://assets.yner.fr/Audio/orgre.mp3', category: 'creatures' },
    { name: 'Orque 3', path: 'https://assets.yner.fr/Audio/ogre2.mp3', category: 'creatures' },
    { name: 'Loup 1', path: 'https://assets.yner.fr/Audio/loup1.mp3', category: 'creatures' },
    { name: 'Loup 2', path: 'https://assets.yner.fr/Audio/loup2.mp3', category: 'creatures' },
    { name: 'Worg', path: 'https://assets.yner.fr/Audio/worg.mp3', category: 'creatures' },
    { name: 'Aboiement', path: 'https://assets.yner.fr/Audio/aboiement.mp3', category: 'creatures' },
    { name: 'Monstre', path: 'https://assets.yner.fr/Audio/monstre.mp3', category: 'creatures' },
    { name: 'Grognement', path: 'https://assets.yner.fr/Audio/grognement.mp3', category: 'creatures' },
    { name: 'Grognement 2', path: 'https://assets.yner.fr/Audio/grognement2.mp3', category: 'creatures' },
    { name: 'Rire Grave', path: 'https://assets.yner.fr/Audio/rire_grave.mp3', category: 'creatures' },

    // Foule
    { name: 'Foule', path: 'https://assets.yner.fr/Audio/crowd.mp3', category: 'foule' },
    { name: 'Taverne', path: 'https://assets.yner.fr/Audio/tavern.mp3', category: 'foule' },

    // Combat
    { name: 'Flèches', path: 'https://assets.yner.fr/Audio/arrows.mp3', category: 'combat' },
    { name: 'Impact Flèche', path: 'https://assets.yner.fr/Audio/arrow-impact-87260.mp3', category: 'combat' },
    { name: 'Impact Flèche Précis', path: 'https://assets.yner.fr/Audio/a-clean-and-precise-game-style-arrow-impact-1-450238.mp3', category: 'combat' },
    { name: 'Dégainer Épée', path: 'https://assets.yner.fr/Audio/dégainage_épée.mp3', category: 'combat' },
    { name: 'Épées', path: 'https://assets.yner.fr/Audio/swords.mp3', category: 'combat' },
    { name: 'Impact Épée Armure', path: 'https://assets.yner.fr/Audio/armor-impact-from-sword-393843.mp3', category: 'combat' },
    { name: 'Impact Hache Métal 1', path: 'https://assets.yner.fr/Audio/a-massive-axe-impact-hitting-metal-2-450253.mp3', category: 'combat' },
    { name: 'Impact Hache Métal 2', path: 'https://assets.yner.fr/Audio/a-massive-axe-impact-hitting-metal-4-450252.mp3', category: 'combat' },
    { name: 'Impact Bouclier', path: 'https://assets.yner.fr/Audio/shield_impact-6-382409.mp3', category: 'combat' },
    { name: 'Coup de poing 1', path: 'https://assets.yner.fr/Audio/punch.mp3', category: 'combat' },
    { name: 'Coup de poing 2', path: 'https://assets.yner.fr/Audio/punch2.mp3', category: 'combat' },
    { name: 'Coup de poing 3', path: 'https://assets.yner.fr/Audio/punch3.mp3', category: 'combat' },

    // Pas
    { name: 'Pas classique', path: 'https://assets.yner.fr/Audio/fotstep2.mp3', category: 'pas' },
    { name: 'Pas Nature', path: 'https://assets.yner.fr/Audio/footsteps.mp3', category: 'pas' },
    { name: 'Pas discret', path: 'https://assets.yner.fr/Audio/footsteps-75638.mp3', category: 'pas' },
    { name: 'Pas Couloir', path: 'https://assets.yner.fr/Audio/footsteps-in-a-hallway-47842.mp3', category: 'pas' },
    { name: 'Pas Escaliers', path: 'https://assets.yner.fr/Audio/footsteps-stairs-slow-106711.mp3', category: 'pas' },
    { name: 'Pas Parquet', path: 'https://assets.yner.fr/Audio/footsteps-walking-boots-parquet-1-420135.mp3', category: 'pas' },
    { name: 'Pas Lourds', path: 'https://assets.yner.fr/Audio/heavy_footstep.mp3', category: 'pas' },
    { name: 'Pas de Monstre', path: 'https://assets.yner.fr/Audio/monster-footstep-162883.mp3', category: 'pas' },

    // Portes
    { name: 'Ouverture Porte 1', path: 'https://assets.yner.fr/Audio/opening door.mp3', category: 'portes' },
    { name: 'Ouverture Porte 2', path: 'https://assets.yner.fr/Audio/opening_door.mp3', category: 'portes' },
    { name: 'Porte Verrouillée 1', path: 'https://assets.yner.fr/Audio/locked_door.mp3', category: 'portes' },
    { name: 'Porte Verrouillée 2', path: 'https://assets.yner.fr/Audio/lockedoor.mp3', category: 'portes' },
    { name: 'Clés et Porte', path: 'https://assets.yner.fr/Audio/keys-on-door-and-open-6861.mp3', category: 'portes' },

    // Magie
    { name: 'Sort d\'Air', path: 'https://assets.yner.fr/Audio/air_spell.mp3', category: 'magie' },
    { name: 'Sort d\'Électricité', path: 'https://assets.yner.fr/Audio/electric_spell.mp3', category: 'magie' },
    { name: 'Sort de Feu', path: 'https://assets.yner.fr/Audio/fire_spell.mp3', category: 'magie' },
    { name: 'Impact Sort de Feu', path: 'https://assets.yner.fr/Audio/fire_spell_impact.mp3', category: 'magie' },
    { name: 'Sort de Glace', path: 'https://assets.yner.fr/Audio/ice_spell.mp3', category: 'magie' },
    { name: 'Résurrection', path: 'https://assets.yner.fr/Audio/resurection.mp3', category: 'magie' },
    { name: 'Sort Générique', path: 'https://assets.yner.fr/Audio/spell1.mp3', category: 'magie' },

    // Divers
    { name: 'Clés', path: 'https://assets.yner.fr/Audio/keys.mp3', category: 'actions' },
    { name: 'Corne de brume / Cor', path: 'https://assets.yner.fr/Audio/horn.mp3', category: 'actions' },
    { name: 'Pièces de monnaie', path: 'https://assets.yner.fr/Audio/coins-clinking-sound-410677.mp3', category: 'actions' },
]

export const MUSIC_CATEGORIES = [
    { id: 'all', label: 'Toutes les musiques' },
    { id: 'chill', label: 'Chill & Calme' },
    { id: 'epic', label: 'Épique & Combat' },
    { id: 'taverne', label: 'Taverne' },
]

export const SUGGESTED_MUSICS: SuggestedSound[] = [
    // Chill
    { name: 'Chill 1', path: 'https://assets.yner.fr/Musics/chill/M1.mp3', category: 'chill' },
    { name: 'Chill 2', path: 'https://assets.yner.fr/Musics/chill/M2.mp3', category: 'chill' },
    { name: 'Chill 3', path: 'https://assets.yner.fr/Musics/chill/M3.mp3', category: 'chill' },
    { name: 'Chill 4', path: 'https://assets.yner.fr/Musics/chill/M4.mp3', category: 'chill' },
    { name: 'Chill 5', path: 'https://assets.yner.fr/Musics/chill/M5.mp3', category: 'chill' },
    { name: 'Chill 6', path: 'https://assets.yner.fr/Musics/chill/M6.mp3', category: 'chill' },
    { name: 'Chill 7', path: 'https://assets.yner.fr/Musics/chill/M7.mp3', category: 'chill' },
    { name: 'Chill 8', path: 'https://assets.yner.fr/Musics/chill/M8.mp3', category: 'chill' },
    { name: 'Chill 11', path: 'https://assets.yner.fr/Musics/chill/M11.mp3', category: 'chill' },
    { name: 'Chill 12', path: 'https://assets.yner.fr/Musics/chill/M12.mp3', category: 'chill' },
    { name: 'Chill 13', path: 'https://assets.yner.fr/Musics/chill/M13.mp3', category: 'chill' },

    // Epic
    { name: 'Epic 1', path: 'https://assets.yner.fr/Musics/epic/M1.mp3', category: 'epic' },
    { name: 'Epic 2', path: 'https://assets.yner.fr/Musics/epic/M2.mp3', category: 'epic' },
    { name: 'Epic 3', path: 'https://assets.yner.fr/Musics/epic/M3.mp3', category: 'epic' },
    { name: 'Epic 4', path: 'https://assets.yner.fr/Musics/epic/M4.mp3', category: 'epic' },
    { name: 'Epic 5', path: 'https://assets.yner.fr/Musics/epic/M5.mp3', category: 'epic' },
    { name: 'Epic 6', path: 'https://assets.yner.fr/Musics/epic/M6.mp3', category: 'epic' },

    // Taverne
    { name: 'Taverne 1', path: 'https://assets.yner.fr/Musics/taverne/M1.mp3', category: 'taverne' },
    { name: 'Taverne 2', path: 'https://assets.yner.fr/Musics/taverne/M2.mp3', category: 'taverne' },
    { name: 'Taverne 3', path: 'https://assets.yner.fr/Musics/taverne/M3.mp3', category: 'taverne' },
    { name: 'Taverne 4', path: 'https://assets.yner.fr/Musics/taverne/M4.mp3', category: 'taverne' },
    { name: 'Taverne 5', path: 'https://assets.yner.fr/Musics/taverne/M5.mp3', category: 'taverne' },
]
