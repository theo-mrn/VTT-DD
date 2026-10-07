/**
 * Carte : outils, actions de la barre, fonctions (lib/map/features) et hôte de la carte
 * (components/map). Les noms des outils et des actions servent aussi à l'éditeur des
 * raccourcis.
 */
export default {
  tools: {
    select: 'Sélection',
    draw: 'Dessin',
    text: 'Texte',
    measure: 'Mesurer',
    objects: 'Objets',
    tokens: 'Personnages',
    portals: 'Portails',
    obstacles: 'Obstacles',
    fog: 'Brouillard',
    lights: 'Lumières',
    sounds: 'Zones sonores',
  },
  actions: {
    layersPanel: 'Calques',
    gridToggle: 'Quadrillage',
    combatAttack: 'Attaquer',
    presenceCursor: 'Montrer mon curseur',
    cameraFit: 'Recadrer la vue',
    cameraZoomIn: 'Zoomer',
    cameraZoomOut: 'Dézoomer',
    fullscreenToggle: 'Plein écran',
    fogCover: 'Tout couvrir de brouillard',
    fogReveal: 'Tout découvrir',
  },
} as const;
