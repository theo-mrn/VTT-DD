import type fr from '../../fr/map/vision';
import type { Translation } from '../../../types';

export default {
  gmView: 'GM view',
  view: 'View',
  viewOf: '{name}’s view',
  gmViewHint: 'Everything visible, players’ shadow as a veil',
  noPlayers: 'No players in the campaign.',
  playersRadius: 'Players’ vision radii',
  myRadius: 'My vision radius',
  animateMist: 'Animate the mist',
  animateBackground: 'Animate the background',
  clickDistance: 'Distance on click',
  clickDistanceGm: '⌘/Ctrl + click: from the selected token',
  clickDistancePlayer: 'From my character',
} satisfies Translation<typeof fr>;
