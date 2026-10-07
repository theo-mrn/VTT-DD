import type fr from '../fr/map';
import type { Translation } from '../../types';

export default {
  tools: {
    select: 'Select',
    draw: 'Draw',
    text: 'Text',
    measure: 'Measure',
    objects: 'Objects',
    tokens: 'Characters',
    portals: 'Portals',
    obstacles: 'Obstacles',
    fog: 'Fog',
    lights: 'Lights',
    sounds: 'Sound zones',
  },
  actions: {
    layersPanel: 'Layers',
    gridToggle: 'Grid',
    combatAttack: 'Attack',
    presenceCursor: 'Show my cursor',
    cameraFit: 'Fit the view',
    cameraZoomIn: 'Zoom in',
    cameraZoomOut: 'Zoom out',
    fullscreenToggle: 'Full screen',
    fogCover: 'Cover everything in fog',
    fogReveal: 'Reveal everything',
  },
} satisfies Translation<typeof fr>;
