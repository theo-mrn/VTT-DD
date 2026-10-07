import type fr from '../../fr/map/display';
import type { Translation } from '../../../types';

export default {
  families: {
    characters: 'Characters',
    objects: 'Objects',
    drawings: 'Drawings',
    notes: 'Texts',
    obstacles: 'Obstacles',
    lights: 'Lights',
    fog: 'Fog',
    music: 'Sound zones',
  },
  background: 'Scene background',
  changeBackground: 'Change the background',
  display: 'Display',
  displayLead: 'Families shown to the whole table. Layers are managed separately (K).',
} satisfies Translation<typeof fr>;
