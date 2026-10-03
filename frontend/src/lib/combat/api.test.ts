import { QueryClient } from '@tanstack/react-query';
import type { CombatState } from '@vtt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import {
  combatApi,
  combatKeys,
  isInProgress,
  isNoCombat,
  isRetryable,
  retryWhileInProgress,
} from './api';
import type { RealtimeEvent } from '../realtime';
import { applyCombatEvent, combatCommands, combatFailure } from './use-combat';

const problem = (status: number, code?: string, detail?: string) =>
  new ApiError({
    status,
    title: 'Erreur',
    ...(code ? { code } : {}),
    ...(detail ? { detail } : {}),
  });

const noCombat = problem(404, 'no_combat', 'Aucun combat en cours dans cette campagne');
const inProgress = problem(409, 'idempotency_in_progress', 'Requête identique déjà en cours');

describe('erreurs du combat', () => {
  it('« aucun combat » (no_combat) se reconnaît et ne donne aucun message', () => {
    expect(isNoCombat(noCombat)).toBe(true);
    expect(isNoCombat(problem(404, 'attack_not_found'))).toBe(false);
    expect(combatFailure(noCombat)).toBeNull();
    expect(combatFailure(problem(409, 'version_conflict', 'Le combat a changé'))).toBe(
      'Le combat a changé',
    );
  });

  it('même requête encore en cours (409) : à reprendre avec la même clé', () => {
    expect(isInProgress(inProgress)).toBe(true);
    expect(isRetryable(inProgress)).toBe(true);
    expect(isRetryable(problem(409, 'version_conflict'))).toBe(false);
    expect(isRetryable(problem(503, 'character_unavailable'))).toBe(true);
    expect(isRetryable(new Error('réseau'))).toBe(true);
  });

  it('reprend tant que la requête est en cours, puis rend sa réponse', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(inProgress)
      .mockRejectedValueOnce(inProgress)
      .mockResolvedValue('attaque');
    const waits: number[] = [];
    const wait = async (ms: number) => {
      waits.push(ms);
    };
    await expect(retryWhileInProgress(run, [1, 2, 3], wait)).resolves.toBe('attaque');
    expect(run).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1, 2]);
  });

  it('abandonne après le dernier délai, et ne reprend jamais une autre erreur', async () => {
    const stuck = vi.fn<() => Promise<string>>().mockRejectedValue(inProgress);
    await expect(retryWhileInProgress(stuck, [0, 0], async () => {})).rejects.toBe(inProgress);
    expect(stuck).toHaveBeenCalledTimes(3);
    const refused = problem(422, 'action_refused');
    const once = vi.fn<() => Promise<string>>().mockRejectedValue(refused);
    await expect(retryWhileInProgress(once, [0, 0], async () => {})).rejects.toBe(refused);
    expect(once).toHaveBeenCalledTimes(1);
  });
});

describe('commandes du combat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const state = { id: 'c1', version: 3 } as CombatState;

  it('combat terminé ailleurs : l’écran repasse hors combat', async () => {
    const client = new QueryClient();
    client.setQueryData(combatKeys.state('camp'), state);
    vi.spyOn(combatApi, 'next').mockRejectedValue(noCombat);
    await expect(combatCommands(client, 'camp').next({ version: 3 })).rejects.toBe(noCombat);
    expect(client.getQueryData(combatKeys.state('camp'))).toBeNull();
  });

  it('terminer un combat déjà terminé : réussi, sans erreur', async () => {
    const client = new QueryClient();
    client.setQueryData(combatKeys.state('camp'), state);
    vi.spyOn(combatApi, 'end').mockRejectedValue(noCombat);
    await expect(combatCommands(client, 'camp').end({})).resolves.toBeUndefined();
    expect(client.getQueryData(combatKeys.state('camp'))).toBeNull();
    // Une autre erreur remonte, le combat reste affiché
    client.setQueryData(combatKeys.state('camp'), state);
    vi.spyOn(combatApi, 'end').mockRejectedValue(problem(403, 'forbidden'));
    await expect(combatCommands(client, 'camp').end({})).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData(combatKeys.state('camp'))).toEqual(state);
  });
});

describe('tours reçus en direct', () => {
  const turn = (visibility: string, version: number, redacted = false): RealtimeEvent => ({
    seq: version,
    redacted,
    event: {
      id: `t${version}-${visibility}`,
      type: 'combat.turn_changed',
      version: 1,
      occurredAt: '2026-09-30T10:00:00Z',
      roomId: 'camp',
      actor: { userId: 'mj', role: 'gm', characterId: null },
      aggregate: { type: 'combat', id: 'c1' },
      visibility,
      payload: { reason: 'next', version },
    } as unknown as RealtimeEvent['event'],
  });

  it('MJ : le second tour, expurgé et de même version, ne remplace pas l’état complet', () => {
    const client = new QueryClient();
    const key = combatKeys.state('camp');
    client.setQueryData(key, { id: 'c1', version: 4, redacted: false } as CombatState);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    applyCombatEvent(client, 'camp', turn('public', 4));
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData<CombatState>(key)?.redacted).toBe(false);
    // Un tour plus récent : relu (en REST, vue complète pour le MJ)
    applyCombatEvent(client, 'camp', turn('gm_only', 5));
    // Sans annuler une lecture déjà en route (revérifiée sur la version annoncée)
    expect(invalidate).toHaveBeenCalledWith(
      { queryKey: key, exact: true },
      { cancelRefetch: false },
    );
  });
});
