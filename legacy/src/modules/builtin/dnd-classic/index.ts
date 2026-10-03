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
    // PAS de bodyFamily/titleFamily ici : ça écraserait --font-body/--font-title pour toute la
    // salle (cf GameSystemTypography.tsx). On ne déclare que la police, pour qu'elle apparaisse
    // comme option supplémentaire dans le sélecteur de style des notes de carte (CreateNoteModal),
    // sans changer la typographie par défaut de dnd-classic.
    typography: {
      fonts: [
        { family: 'Hobbiton Brush Hand', src: '/fonts/hobbitonbrushhand.ttf' },
      ],
    },
  },
};

export { DND_CLASSIC_STATS } from './stats';
export { DND_CLASSIC_CREATION } from './creation';
