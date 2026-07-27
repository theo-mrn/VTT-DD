import type { SuggestedSound } from './suggested-sounds'

// Sons Star Wars — fichiers statiques servis depuis public/effects/Star Wars/ (pas embarqués dans le
// bundle zip : le zip est déjà lourd à cause de holotable.glb, ces .wav restent servis par l'app elle-
// même comme les images de suggested-objects-starwars.ts sur assets.yner.fr). Utilisé par SoundDrawer.tsx
// à la place de SUGGESTED_SOUNDS quand le système actif est Star Wars, même logique que
// SUGGESTED_OBJECTS_STARWARS pour ObjectDrawer.tsx (gameSystem.objectLibraryId === 'starwars').

export const SOUND_CATEGORIES_STARWARS = [
    { id: 'all', label: 'Tous les sons' },
    { id: 'droid', label: 'Droïdes' },
    { id: 'lightsaber', label: 'Sabre Laser' },
    { id: 'lasers', label: 'Blasters' },
    { id: 'creature', label: 'Créatures' },
    { id: 'spaceship', label: 'Vaisseaux' },
]

export const SUGGESTED_SOUNDS_STARWARS: SuggestedSound[] = [
    // Droïdes
    { name: 'Déplacement Droïde 1', path: '/effects/Star%20Wars/Droid/Droid%20movement%201.wav', category: 'droid' },
    { name: 'Déplacement Droïde 2', path: '/effects/Star%20Wars/Droid/Droid%20movement%202.wav', category: 'droid' },
    { name: 'Déplacement Droïde 3', path: '/effects/Star%20Wars/Droid/Droid%20movement%203.wav', category: 'droid' },

    // Sabre Laser
    { name: 'Allumage Sabre Laser', path: '/effects/Star%20Wars/Lightsaber/Lightsaber%20Ignition.wav', category: 'lightsaber' },
    { name: 'Impact Sabre Laser', path: '/effects/Star%20Wars/Lightsaber/Lightsaber%20hit.wav', category: 'lightsaber' },
    { name: 'Fouet Sabre Laser 1', path: '/effects/Star%20Wars/Lightsaber/Lightsaber%20whip%201.wav', category: 'lightsaber' },
    { name: 'Fouet Sabre Laser 2', path: '/effects/Star%20Wars/Lightsaber/Lightsaber%20whip%202.wav', category: 'lightsaber' },

    // Blasters
    { name: 'Charge Laser', path: '/effects/Star%20Wars/Lasers/Laser%20power-up.wav', category: 'lasers' },
    { name: 'Mitrailleuse Laser', path: '/effects/Star%20Wars/Lasers/Laser%20Machine%20Gun.wav', category: 'lasers' },
    { name: 'Laser Lourd', path: '/effects/Star%20Wars/Lasers/Laser%20heavy%20duty.wav', category: 'lasers' },
    { name: 'Canon Laser', path: '/effects/Star%20Wars/Lasers/Laser%20cannon.wav', category: 'lasers' },
    { name: 'Fusil Laser', path: '/effects/Star%20Wars/Lasers/Laser%20rifle.wav', category: 'lasers' },

    // Créatures
    { name: 'Dialogue Alien 1', path: '/effects/Star%20Wars/Creature/Alien%20dialogue%201.wav', category: 'creature' },
    { name: 'Dialogue Alien 2', path: '/effects/Star%20Wars/Creature/Alien%20dialogue%202.wav', category: 'creature' },

    // Vaisseaux
    { name: 'Hydraulique Vaisseau', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Hydraulics.wav', category: 'spaceship' },
    { name: 'Survol Vaisseau', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Fly%20By.wav', category: 'spaceship' },
    { name: 'Charge Vaisseau 1', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Charge%201.wav', category: 'spaceship' },
    { name: 'Charge Vaisseau 2', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Charge%202.wav', category: 'spaceship' },
    { name: 'Fermeture Porte Vaisseau', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Door%20Shut%20Door%20Shut.wav', category: 'spaceship' },
    { name: 'Intérieur Vaisseau', path: '/effects/Star%20Wars/Spaceship/Spaceship%20Interior.wav', category: 'spaceship' },
]
