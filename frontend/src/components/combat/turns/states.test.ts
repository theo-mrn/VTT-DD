import type { Presentation } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { loadSystem } from '@/lib/combat/test-kit';
import type { FichePersonnage } from '@/lib/personnages';
import { combatPresentation, FREE_STATE_SOURCE, statesOf } from './use-cast';

describe('états d’un participant', () => {
  it('chaque état porte l’icône que la présentation lui donne, l’état libre la générique', () => {
    const systeme = loadSystem();
    const { stateSorts, stateIcons } = combatPresentation({
      combat: { groupes: [], etats: { sortes: ['talent'], icones: { botte: 'rage' } } },
    } as unknown as Presentation);
    const sheet = {
      state: {
        possessions: [{ entree: 'botte', duree: 2 }, { entree: 'epee' }],
        bonus: [{ id: 'b1', nom: 'Concentré', source: FREE_STATE_SOURCE, effets: [], duree: 1 }],
      },
    } as unknown as Pick<FichePersonnage, 'state'>;
    expect(
      statesOf(sheet, systeme, stateSorts, stateIcons).map((s) => [s.name, s.icon, s.duration]),
    ).toEqual([
      ['Botte secrète', 'rage', 2],
      ['Concentré', 'etat', 1],
    ]);
    // Sans présentation du combat : l'icône générique
    expect(statesOf(sheet, systeme, ['talent'])[0]!.icon).toBe('etat');
  });
});
