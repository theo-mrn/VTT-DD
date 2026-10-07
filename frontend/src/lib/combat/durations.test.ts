/**
 * Durées décomptées au nombre de tours, côté interface (docs/combat.md § 18) : libellés, durée
 * par défaut lue dans le système, demande envoyée à character, rapports d'attaque, annonce.
 */
import type { Modification } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { expiryMessage } from '@/components/combat/duration-notices';
import { modificationText } from '@/components/combat/reports/labels';
import { setDuration, toInput } from '@/components/combat/reports/model';
import { FREE_STATE_SOURCE, statesOf } from '@/components/combat/turns/use-cast';
import type { FichePersonnage } from '@/lib/personnages';
import {
  defaultDurationOf,
  durationShort,
  durationText,
  timerOfModification,
  timingRequest,
} from './durations';
import { toModification } from './report';
import { combatSystem, loadSystem } from './test-kit';

const ARIA = '0b5c1c9e-7f37-4b8a-9d55-1f2d3c4b5a69';
const GOB = '7a1d2c3b-0000-4000-8000-00000000000b';

const systeme = loadSystem({
  ...combatSystem,
  catalogue: [
    ...combatSystem.catalogue!,
    {
      id: 'garde',
      sorte: 'talent',
      nom: 'En garde',
      duree: { valeur: 1, moment: 'debut-tour', de: 'source' },
    },
  ],
});

describe('libellés', () => {
  const nameOf = (id: string) => (id === GOB ? 'Gobelin' : undefined);
  it('court et complet, ancre nommée, jusqu’au retrait', () => {
    expect(durationShort({ duration: 2 })).toBe('2 rounds');
    expect(durationShort({ duration: null })).toBeNull();
    expect(durationText({ duration: null })).toBe('jusqu’au retrait');
    expect(durationText({ duration: 1, timing: { moment: 'fin-tour', attente: true } })).toBe(
      'jusqu’à la fin de son prochain tour',
    );
    expect(
      durationText(
        { duration: 1, timing: { moment: 'debut-tour', de: GOB } },
        { bearerId: ARIA, nameOf },
      ),
    ).toBe('jusqu’au début du prochain tour de Gobelin');
  });
});

describe('poser une durée', () => {
  it('durée par défaut lue dans le catalogue du système', () => {
    expect(defaultDurationOf(systeme, 'garde')).toEqual({
      duration: 1,
      moment: 'debut-tour',
      anchor: 'source',
    });
    expect(defaultDurationOf(systeme, 'botte')).toBeNull();
  });

  it('demande à character : rien en fin de round, ancre omise pour le porteur', () => {
    expect(timingRequest('fin-round', GOB, ARIA)).toBeNull();
    expect(timingRequest('fin-tour', ARIA, ARIA)).toEqual({ moment: 'fin-tour' });
    expect(timingRequest('debut-tour', GOB, ARIA)).toEqual({ moment: 'debut-tour', de: GOB });
  });

  it('états d’une fiche : moment du décompte gardé avec la durée', () => {
    const sheet = {
      state: {
        possessions: [
          { entree: 'botte', duree: 1, decompte: { moment: 'fin-tour', attente: true } },
        ],
        bonus: [{ id: 'b', nom: 'Prière', source: FREE_STATE_SOURCE, effets: [], duree: 2 }],
      },
    } as unknown as Pick<FichePersonnage, 'state'>;
    expect(statesOf(sheet, systeme, ['talent']).map((s) => [s.name, s.duration, s.timing])).toEqual(
      [
        ['Botte secrète', 1, { moment: 'fin-tour', attente: true }],
        ['Prière', 2, undefined],
      ],
    );
  });
});

describe('rapports d’attaque', () => {
  const donne: Modification = {
    entite: 'cible',
    entree: 'garde',
    operation: 'donner',
    rangs: 1,
    duree: 1,
    decompte: { moment: 'debut-tour', source: true },
  };

  it('la source devient l’attaquant, le libellé du rapport le dit court', () => {
    const m = toModification(donne, GOB);
    expect(m).toMatchObject({
      kind: 'entry',
      duration: 1,
      timing: { moment: 'turn_start', anchorId: GOB },
    });
    const input = toInput(m);
    expect(input).toMatchObject({ timing: { moment: 'turn_start', anchorId: GOB } });
    expect(modificationText(systeme, input)).toBe('En garde, 1 tour');
    if (input.kind !== 'entry') throw new Error('entrée attendue');
    expect(timerOfModification(input)).toEqual({
      duration: 1,
      timing: { moment: 'debut-tour', de: GOB },
    });
  });

  it('le MJ change le nombre : le moment est gardé ; jusqu’au retrait : ni l’un ni l’autre', () => {
    const mods = [toInput(toModification(donne, GOB))];
    expect(setDuration(mods, 0, 3)[0]).toMatchObject({
      duration: 3,
      timing: { moment: 'turn_start' },
    });
    const forever = setDuration(mods, 0, null)[0]!;
    expect(forever).not.toHaveProperty('duration');
    expect(forever).not.toHaveProperty('timing');
  });

  it('fin de round, ou sans attaquant connu : pas d’ancre', () => {
    expect(toModification({ ...donne, decompte: { moment: 'fin-round' } })).not.toHaveProperty(
      'timing',
    );
    expect(toModification(donne)).toMatchObject({ timing: { moment: 'turn_start' } });
    expect(toModification(donne)).toEqual(
      expect.objectContaining({ timing: { moment: 'turn_start' } }),
    );
  });
});

describe('annonce à la table', () => {
  const nameOf = (id: string) => (id === ARIA ? 'Aria' : 'Gobelin');
  it('une fin, plusieurs fins, rien', () => {
    expect(
      expiryMessage(
        { expirations: [{ characterId: ARIA, entries: [{ key: 'beni', name: 'Béni' }] }] },
        nameOf,
      ),
    ).toBe('Béni prend fin · Aria');
    expect(
      expiryMessage(
        {
          expirations: [
            { characterId: ARIA, entries: [{ key: 'beni', name: 'Béni' }] },
            { characterId: GOB, entries: [{ key: 'bonus:rage', name: 'Rage' }] },
          ],
        },
        nameOf,
      ),
    ).toBe('Fin de Béni (Aria), Rage (Gobelin)');
    expect(expiryMessage({ expirations: [] }, nameOf)).toBeNull();
  });
});
