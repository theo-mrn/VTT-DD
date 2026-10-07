import type fr from '../../fr/map/party';
import type { Translation } from '../../../types';

export default {
  showNpcs: 'Show NPCs',
  showHeroes: 'Show heroes',
  noNpc: 'No NPCs',
  nobody: 'Nobody in the scene',
  hideCombatBar: 'Put away the combat bar',
  showCombatBar: 'Show the combat bar',
  combatBar: 'Combat bar',
  hideBar: 'Hide the bar',
  endCombat: 'End the combat…',
  centerView: 'Center the view',
  sheet: 'Sheet',
  whisper: 'Write privately',
  whisperSent: 'Private message sent to {name}',
  notSent: 'Message not sent',
  whisperTo: 'To {name}…',
  whisperLabel: 'Private message to {name}',
  more: '{count, plural, one {# more} other {# more}}',
} satisfies Translation<typeof fr>;
