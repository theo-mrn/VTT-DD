import type { GameSystemModule } from '@/modules/game-system/types';
import { DND_CLASSIC_STATS } from './stats';
import { DND_CLASSIC_CREATION } from './creation';

export const dndClassicModule: GameSystemModule = {
  manifest: {
    id: 'dnd-classic',
    name: 'D&D Classique',
    version: '1.0.0',
    description: 'Système de règles par défaut du VTT (FOR/DEX/CON/SAG/INT/CHA, Défense/Contact/Distance/Magie, PV).',
    author: 'VTT-DD Core',
    type: 'game-system',
    defaultEnabled: true,
  },
  gameSystem: {
    systemId: 'dnd-classic',
    stats: DND_CLASSIC_STATS,
    creation: DND_CLASSIC_CREATION,
    combatDefenseKey: 'Defense',
    combatAttackKeys: ['Contact', 'Distance', 'Magie'],
  },
};

export { DND_CLASSIC_STATS } from './stats';
export { DND_CLASSIC_CREATION } from './creation';
