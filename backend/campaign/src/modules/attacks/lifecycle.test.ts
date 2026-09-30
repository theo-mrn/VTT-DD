/**
 * Cycle de vie d'une attaque sans base : statuts, tour, défauts de la déclaration.
 */
import { DEFAULT_COMBAT_SETTINGS } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { participant, start } from '../combat/turns.js';
import {
  defaultVisibility,
  effectiveDice,
  implicitSlotActor,
  outOfTurnOf,
  preparedTargets,
  statusAfterDecision,
  statusAfterResolution,
  statusBeforeResolution,
} from './lifecycle.js';

const target = (status: string, decision = 'pending', reactionParams: string[] = []) =>
  ({ status, decision, reactionParams }) as never;

describe('statuts', () => {
  it('avant la résolution : réactions attendues, sinon dés', () => {
    expect(statusBeforeResolution([target('awaiting_reaction', 'pending', ['esquive'])])).toBe(
      'awaiting_reactions',
    );
    expect(statusBeforeResolution([target('failed', 'pending', ['esquive'])])).toBe(
      'awaiting_dice',
    );
  });

  it('après la résolution : failed seulement si toutes les cibles ont échoué', () => {
    expect(statusAfterResolution([target('failed'), target('resolved')])).toBe('pending');
    expect(statusAfterResolution([target('failed'), target('failed')])).toBe('failed');
  });

  it('après les décisions : en attente, appliquée ou écartée ; coûts de l’attaquant compris', () => {
    const costs = { modifications: [{}], decision: 'pending', applied: null } as never;
    expect(statusAfterDecision([target('resolved', 'applied')], costs)).toBe('pending');
    expect(statusAfterDecision([target('resolved', 'applied'), target('failed')], null)).toBe(
      'applied',
    );
    expect(statusAfterDecision([target('resolved', 'skipped')], null)).toBe('dismissed');
    expect(statusAfterDecision([target('resolved', 'reverted')], null)).toBe('pending');
    const noCosts = { modifications: [], decision: 'pending', applied: null } as never;
    expect(statusAfterDecision([target('resolved', 'skipped')], noCosts)).toBe('dismissed');
  });
});

describe('déclaration', () => {
  it('visibilité : gm pour le MJ si gmRollsHidden, public sinon, ou celle demandée', () => {
    const s = DEFAULT_COMBAT_SETTINGS;
    expect(defaultVisibility(undefined, true, s)).toBe('gm');
    expect(defaultVisibility(undefined, true, { ...s, gmRollsHidden: false })).toBe('public');
    expect(defaultVisibility(undefined, false, s)).toBe('public');
    expect(defaultVisibility('private', true, s)).toBe('private');
  });

  it('étape B : le serveur tire toujours', () => {
    expect(effectiveDice('physical', DEFAULT_COMBAT_SETTINGS)).toBe('server');
  });

  it('hors tour : individual, slots (camp, acteur désigné, déjà agi), hors combat', () => {
    const ind = start('individual', [participant('a', 'players'), participant('b', 'enemies')]);
    expect(outOfTurnOf(ind, 'a')).toBe(false);
    expect(outOfTurnOf(ind, 'b')).toBe(true);
    expect(outOfTurnOf(ind, 'zz')).toBe(true);
    expect(outOfTurnOf(null, 'a')).toBe(false);
    const slots = start('slots', [participant('p1', 'players'), participant('e1', 'enemies')]);
    expect(outOfTurnOf(slots, 'p1')).toBe(false);
    expect(outOfTurnOf(slots, 'e1')).toBe(true);
    expect(outOfTurnOf({ ...slots, currentActorId: 'p1' }, 'p1')).toBe(false);
    expect(implicitSlotActor(slots, 'p1')).toBe(true);
    expect(implicitSlotActor(slots, 'e1')).toBe(false);
    expect(implicitSlotActor({ ...slots, currentActorId: 'p1' }, 'p1')).toBe(false);
    expect(implicitSlotActor(ind, 'a')).toBe(false);
  });

  it('cibles préparées : refus, réaction attendue, résolue tout de suite', () => {
    const prepared = {
      targets: [
        { characterId: 'x', error: 'Hors de portée', reactionParams: [] },
        { characterId: 'y', error: null, reactionParams: ['esquive'] },
        { characterId: 'z', error: null, reactionParams: [] },
      ],
    } as never;
    const waiting = preparedTargets(['x', 'y', 'z'], prepared, null);
    expect(waiting.map((t) => [t.status, t.error])).toEqual([
      ['failed', 'Hors de portée'],
      ['awaiting_reaction', null],
      ['awaiting_dice', null],
    ]);
    const resolution = {
      targets: [{ characterId: 'z', status: 'resolved', error: null, result: {}, view: {} }],
      actor: { modifications: [] },
    } as never;
    const now = preparedTargets(['x', 'z'], prepared, resolution);
    expect(now.map((t) => t.status)).toEqual(['failed', 'resolved']);
  });
});
