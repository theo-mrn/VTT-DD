import type { CombatParticipant } from '@vtt/contracts';
import { DEFAULT_COMBAT_SETTINGS } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { startCandidates } from './model';
import {
  pruneChoices,
  setupRows,
  setupSummary,
  sideParamsFromCombat,
  startCombatBody,
  withChoice,
} from './setup';

const engaged = [
  { characterId: 'lyra', side: 'players' as const },
  { characterId: 'kael', side: 'players' as const },
  { characterId: 'orc', side: 'enemies' as const },
  { characterId: 'gob', side: 'enemies' as const },
  { characterId: 'loup', side: 'allies' as const },
];
const tokens = [
  { characterId: 'lyra', visibility: 'visible' },
  { characterId: 'orc', visibility: 'hidden' },
  { characterId: 'gob', visibility: 'visible' },
];
const candidates = startCandidates(engaged, tokens);

describe('hors combat : l’ordre de la scène', () => {
  it('présélection de la scène, PNJ caché pré-coché « caché »', () => {
    const rows = setupRows(candidates, {});
    expect(rows.map((r) => [r.characterId, r.checked, r.hidden, r.surprised])).toEqual([
      ['lyra', true, false, false],
      ['orc', true, true, false],
      ['gob', true, false, false],
      ['kael', false, false, false],
      ['loup', false, false, false],
    ]);
  });

  it('écarter, cacher, surprendre : les choix du MJ par-dessus la présélection', () => {
    let choices = {};
    const rows = setupRows(candidates, choices);
    choices = withChoice(choices, rows[2]!, { checked: false });
    choices = withChoice(choices, rows[0]!, { surprised: true });
    choices = withChoice(choices, rows[3]!, { checked: true, hidden: true });
    const next = setupRows(candidates, choices);
    expect(next.map((r) => [r.characterId, r.checked, r.hidden, r.surprised])).toEqual([
      ['lyra', true, false, true],
      ['orc', true, true, false],
      ['gob', false, false, false],
      // Un héros n'est jamais caché aux joueurs
      ['kael', true, false, false],
      ['loup', false, false, false],
    ]);
    expect(setupSummary(next)).toEqual({
      chosen: 3,
      bySide: { players: 2, enemies: 1, allies: 0 },
      hidden: 1,
      surprised: 1,
      sides: ['players', 'enemies'],
    });
  });

  it('un personnage parti de la scène perd ses choix', () => {
    const choices = { lyra: { surprised: true }, parti: { checked: true } };
    expect(pruneChoices(choices, candidates)).toEqual({ lyra: { surprised: true } });
    const same = { lyra: { surprised: true } };
    expect(pruneChoices(same, candidates)).toBe(same);
  });
});

describe('« Lancer l’initiative » et « Démarrer sans initiative »', () => {
  const rows = setupRows(candidates, { lyra: { surprised: true } });

  it('démarre avec les cochés, cachés, surpris et tire l’initiative par camp', () => {
    expect(
      startCombatBody(rows, {
        rollInitiative: true,
        settings: { ...DEFAULT_COMBAT_SETTINGS, physicalDice: false },
        sideParams: { players: { competence: 'vigilance' }, enemies: {} },
      }),
    ).toEqual({
      participants: ['lyra', 'orc', 'gob'],
      hidden: ['orc'],
      surprised: ['lyra'],
      settings: { physicalDice: false },
      rollInitiative: true,
      paramsBySide: { players: { competence: 'vigilance' } },
    });
  });

  it('sans initiative : ni jet ni paramètres ; le mode seulement s’il est choisi', () => {
    expect(
      startCombatBody(rows, {
        rollInitiative: false,
        mode: 'slots',
        settings: DEFAULT_COMBAT_SETTINGS,
        sideParams: { players: { competence: 'vigilance' } },
      }),
    ).toEqual({
      participants: ['lyra', 'orc', 'gob'],
      mode: 'slots',
      hidden: ['orc'],
      surprised: ['lyra'],
    });
  });

  it('personne de coché : rien à envoyer', () => {
    const none = setupRows(candidates, {
      lyra: { checked: false },
      orc: { checked: false },
      gob: { checked: false },
    });
    expect(startCombatBody(none, { rollInitiative: true })).toBeNull();
  });
});

describe('compétences d’initiative par camp retenues', () => {
  const p = (characterId: string, side: CombatParticipant['side'], params?: object) =>
    ({
      characterId,
      side,
      sortKeys: [],
      hasActed: false,
      initiative: params
        ? { summary: '', params, source: 'server', rolledAt: '2026-09-30T10:00:00Z' }
        : null,
    }) as CombatParticipant;

  it('le premier participant de chaque camp qui a choisi donne le choix du camp', () => {
    const combat = {
      order: [
        p('lyra', 'players', { competence: 'sangfroid' }),
        p('orc', 'enemies'),
        p('gob', 'enemies', { competence: 'vigilance', rapide: true }),
        p('kael', 'players', { competence: 'vigilance' }),
      ],
    };
    expect(sideParamsFromCombat(combat, ['competence'])).toEqual({
      players: { competence: 'sangfroid' },
      enemies: { competence: 'vigilance' },
    });
    expect(sideParamsFromCombat(combat, [])).toEqual({});
    expect(sideParamsFromCombat(null, ['competence'])).toEqual({});
  });
});
