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
    { name: 'Forêt de Nuit', path: '/Audio/Foret de_nuit.mp3', category: 'ambiance' },
    { name: 'Sonnette', path: '/Audio/sonette.mp3', category: 'ambiance' },

    // Nature
    { name: 'Forêt Paisible', path: '/Audio/foret.mp3', category: 'nature' },
    { name: 'Rivière', path: '/Audio/eau.mp3', category: 'nature' },
    { name: 'Feu de Camp', path: '/Audio/feu.mp3', category: 'nature' },
    { name: 'Insectes de Nuit', path: '/Audio/insecte_nuit.mp3', category: 'nature' },
    { name: 'Pluie', path: '/Audio/pluit.mp3', category: 'nature' },
    { name: 'Tonnerre', path: '/Audio/tonere.mp3', category: 'nature' },
    { name: 'Orage', path: '/Audio/orage.mp3', category: 'nature' },
    { name: 'Vent Doux', path: '/Audio/vent1.mp3', category: 'nature' },
    { name: 'Vent Moyen', path: '/Audio/vent2.mp3', category: 'nature' },
    { name: 'Vent Fort', path: '/Audio/vent3.mp3', category: 'nature' },

    // Créatures
    { name: 'Dragon 1', path: '/Audio/dragon.mp3', category: 'creatures' },
    { name: 'Dragon 2', path: '/Audio/dragon2.mp3', category: 'creatures' },
    { name: 'Dragon Ailes', path: '/Audio/dragon_battant_des_ailes.mp3', category: 'creatures' },
    { name: 'Dragon Dormant', path: '/Audio/dragon_dormant.mp3', category: 'creatures' },
    { name: 'Gobelin 2', path: '/Audio/ogre3.mp3', category: 'creatures' },
    { name: 'Rire de Gobelin', path: '/Audio/rire_goblin.mp3', category: 'creatures' },
    { name: 'Mort de Gobelin', path: '/Audio/goblin_death.mp3', category: 'creatures' },
    { name: 'Orque 1', path: '/Audio/goblin.mp3', category: 'creatures' },
    { name: 'Orque 2', path: '/Audio/orgre.mp3', category: 'creatures' },
    { name: 'Orque 3', path: '/Audio/ogre2.mp3', category: 'creatures' },
    { name: 'Loup 1', path: '/Audio/loup1.mp3', category: 'creatures' },
    { name: 'Loup 2', path: '/Audio/loup2.mp3', category: 'creatures' },
    { name: 'Worg', path: '/Audio/worg.mp3', category: 'creatures' },
    { name: 'Aboiement', path: '/Audio/aboiement.mp3', category: 'creatures' },
    { name: 'Monstre', path: '/Audio/monstre.mp3', category: 'creatures' },
    { name: 'Grognement', path: '/Audio/grognement.mp3', category: 'creatures' },
    { name: 'Grognement 2', path: '/Audio/grognement2.mp3', category: 'creatures' },
    { name: 'Rire Grave', path: '/Audio/rire_grave.mp3', category: 'creatures' },

    // Foule
    { name: 'Foule', path: '/Audio/crowd.mp3', category: 'foule' },
    { name: 'Taverne', path: '/Audio/tavern.mp3', category: 'foule' },

    // Combat
    { name: 'Flèches', path: '/Audio/arrows.mp3', category: 'combat' },
    { name: 'Impact Flèche', path: '/Audio/arrow-impact-87260.mp3', category: 'combat' },
    { name: 'Impact Flèche Précis', path: '/Audio/a-clean-and-precise-game-style-arrow-impact-1-450238.mp3', category: 'combat' },
    { name: 'Dégainer Épée', path: '/Audio/dégainage_épée.mp3', category: 'combat' },
    { name: 'Épées', path: '/Audio/swords.mp3', category: 'combat' },
    { name: 'Impact Épée Armure', path: '/Audio/armor-impact-from-sword-393843.mp3', category: 'combat' },
    { name: 'Impact Hache Métal 1', path: '/Audio/a-massive-axe-impact-hitting-metal-2-450253.mp3', category: 'combat' },
    { name: 'Impact Hache Métal 2', path: '/Audio/a-massive-axe-impact-hitting-metal-4-450252.mp3', category: 'combat' },
    { name: 'Impact Bouclier', path: '/Audio/shield_impact-6-382409.mp3', category: 'combat' },
    { name: 'Coup de poing 1', path: '/Audio/punch.mp3', category: 'combat' },
    { name: 'Coup de poing 2', path: '/Audio/punch2.mp3', category: 'combat' },
    { name: 'Coup de poing 3', path: '/Audio/punch3.mp3', category: 'combat' },

    // Pas
    { name: 'Pas classique', path: '/Audio/fotstep2.mp3', category: 'pas' },
    { name: 'Pas Nature', path: '/Audio/footsteps.mp3', category: 'pas' },
    { name: 'Pas discret', path: '/Audio/footsteps-75638.mp3', category: 'pas' },
    { name: 'Pas Couloir', path: '/Audio/footsteps-in-a-hallway-47842.mp3', category: 'pas' },
    { name: 'Pas Escaliers', path: '/Audio/footsteps-stairs-slow-106711.mp3', category: 'pas' },
    { name: 'Pas Parquet', path: '/Audio/footsteps-walking-boots-parquet-1-420135.mp3', category: 'pas' },
    { name: 'Pas Lourds', path: '/Audio/heavy_footstep.mp3', category: 'pas' },
    { name: 'Pas de Monstre', path: '/Audio/monster-footstep-162883.mp3', category: 'pas' },

    // Portes
    { name: 'Ouverture Porte 1', path: '/Audio/opening door.mp3', category: 'portes' },
    { name: 'Ouverture Porte 2', path: '/Audio/opening_door.mp3', category: 'portes' },
    { name: 'Porte Verrouillée 1', path: '/Audio/locked_door.mp3', category: 'portes' },
    { name: 'Porte Verrouillée 2', path: '/Audio/lockedoor.mp3', category: 'portes' },
    { name: 'Clés et Porte', path: '/Audio/keys-on-door-and-open-6861.mp3', category: 'portes' },

    // Magie
    { name: 'Sort d\'Air', path: '/Audio/air_spell.mp3', category: 'magie' },
    { name: 'Sort d\'Électricité', path: '/Audio/electric_spell.mp3', category: 'magie' },
    { name: 'Sort de Feu', path: '/Audio/fire_spell.mp3', category: 'magie' },
    { name: 'Impact Sort de Feu', path: '/Audio/fire_spell_impact.mp3', category: 'magie' },
    { name: 'Sort de Glace', path: '/Audio/ice_spell.mp3', category: 'magie' },
    { name: 'Résurrection', path: '/Audio/resurection.mp3', category: 'magie' },
    { name: 'Sort Générique', path: '/Audio/spell1.mp3', category: 'magie' },

    // Divers
    { name: 'Clés', path: '/Audio/keys.mp3', category: 'actions' },
    { name: 'Corne de brume / Cor', path: '/Audio/horn.mp3', category: 'actions' },
    { name: 'Pièces de monnaie', path: '/Audio/coins-clinking-sound-410677.mp3', category: 'actions' },
]
