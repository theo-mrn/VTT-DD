/**
 * État du combat d'une campagne à la table (docs/combat.md § 4, § 9.3, § 10), tenu à jour en
 * direct : `GET …/combat` (vue expurgée pour un joueur), relu sur les événements `combat.*`
 * des tours et à chaque (ré)abonnement sans rejeu.
 *
 * ```ts
 * const { combat, isLoading } = useCombat(campaignId);   // combat : CombatState | null
 * const commands = useCombatCommands(campaignId);        // next, previous, start…
 * await commands.next({ version: combat.version });
 * const actor = currentActorId(combat);                  // participant qui agit, ou null
 * ```
 *
 * Les commandes écrivent la réponse du service dans le cache (`combatKeys.state`) : l'écran se
 * met à jour sans attendre l'événement, qui est ignoré s'il n'est pas plus récent.
 */
'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AddCombatParticipants,
  ChooseSlotActor,
  CombatParticipant,
  CombatSettings,
  CombatState,
  EndCombat,
  NextTurn,
  PreviousTurn,
  ReorderCombat,
  RollCombatInitiative,
  RollParticipantInitiative,
  SetTurn,
  StartCombat,
  SubmitRollDice,
  UpdateCombatParticipant,
  UpdateCombatSettings,
} from '@vtt/contracts';
import { DEFAULT_COMBAT_SETTINGS } from '@vtt/contracts';
import { useEffect, useMemo } from 'react';
import { useCampaignEvents, type RealtimeEvent } from '../realtime';
import { combatApi, combatKeys } from './api';

/** Événements des tours (les attaques ont les leurs, `use-attacks.ts`). */
export const COMBAT_TURN_EVENTS = [
  'combat.started',
  'combat.turn_changed',
  'combat.ended',
  'combat.settings_updated',
  'combat.participant_defeated',
] as const;

// ─── Lectures pures ──────────────────────────────────────────────────────────

/**
 * Participant qui agit : `currentActorId` du service, sinon (réponse d'avant ce contrat) celui
 * de `currentIndex` en mode individuel. Null : personne (créneau sans acteur, tour d'un
 * participant caché pour un joueur, combat sans initiative).
 */
export function currentActorId(combat: CombatState | null | undefined): string | null {
  if (!combat) return null;
  if (combat.currentActorId !== undefined) return combat.currentActorId ?? null;
  if (combat.mode !== 'individual' || combat.currentIndex < 0) return null;
  return combat.order[combat.currentIndex]?.characterId ?? null;
}

/** Participant du combat, s'il y est (et visible pour moi). */
export function participantOf(
  combat: CombatState | null | undefined,
  characterId: string | null | undefined,
): CombatParticipant | null {
  if (!combat || !characterId) return null;
  return combat.order.find((p) => p.characterId === characterId) ?? null;
}

/** Réglages du combat, défauts compris (réponse d'avant ce contrat : les défauts). */
export function combatSettings(combat: CombatState | null | undefined): CombatSettings {
  return { ...DEFAULT_COMBAT_SETTINGS, ...(combat?.settings ?? {}) };
}

/** Camp du créneau courant (mode slots), ou null. */
export function currentSlotSide(combat: CombatState | null | undefined) {
  if (!combat || combat.mode !== 'slots') return null;
  return combat.slots?.[combat.currentIndex]?.side ?? null;
}

// ─── Cache et temps réel ─────────────────────────────────────────────────────

/** Applique un événement des tours au cache : relecture si l'état connu est plus ancien. */
export function applyCombatEvent(client: QueryClient, campaignId: string, e: RealtimeEvent) {
  const key = combatKeys.state(campaignId);
  const { type, payload } = e.event;
  if (type === 'combat.ended') {
    client.setQueryData(key, null);
    void client.invalidateQueries({ queryKey: combatKeys.attacks(campaignId) });
    return;
  }
  const known = client.getQueryData<CombatState | null>(key);
  const version = typeof payload?.version === 'number' ? payload.version : null;
  // Déjà à jour (ma propre écriture, ou le second événement expurgé de même version)
  if (!e.redacted && known && version !== null && known.version >= version) return;
  void client.invalidateQueries({ queryKey: key, exact: true });
  if (type === 'combat.started' || type === 'combat.participant_defeated')
    void client.invalidateQueries({ queryKey: combatKeys.attacks(campaignId) });
}

/**
 * Combat en cours d'une campagne, tenu à jour en direct. `combat` : null s'il n'y en a pas
 * (ou tant qu'il se charge : voir `isLoading`).
 */
export function useCombat(campaignId: string | null | undefined, opts: { enabled?: boolean } = {}) {
  const client = useQueryClient();
  const enabled = Boolean(campaignId) && (opts.enabled ?? true);
  const query = useQuery({
    queryKey: combatKeys.state(campaignId ?? ''),
    queryFn: () => combatApi.get(campaignId!),
    enabled,
    staleTime: 15_000,
  });
  const { live, generation } = useCampaignEvents(
    campaignId ?? null,
    COMBAT_TURN_EVENTS,
    (e) => applyCombatEvent(client, campaignId!, e),
    { enabled },
  );
  useEffect(() => {
    if (!enabled || generation === 0) return;
    void client.invalidateQueries({ queryKey: combatKeys.state(campaignId!), exact: true });
  }, [client, campaignId, enabled, generation]);

  return {
    combat: query.data ?? null,
    isLoading: enabled && query.isPending,
    isError: query.isError,
    error: query.error,
    live,
    refetch: query.refetch,
  };
}

// ─── Commandes ───────────────────────────────────────────────────────────────

/**
 * Écritures du combat (MJ, et « Terminer mon tour » d'un joueur) ; chaque réponse remplace
 * l'état en cache. Les erreurs remontent (`combatErrorMessage` pour les afficher).
 */
export function useCombatCommands(campaignId: string) {
  const client = useQueryClient();
  return useMemo(() => {
    const key = combatKeys.state(campaignId);
    const keep = <T extends CombatState>(state: T): T => {
      client.setQueryData(key, state);
      return state;
    };
    return {
      start: async (body: StartCombat) => {
        const state = keep(await combatApi.start(campaignId, body));
        void client.invalidateQueries({ queryKey: combatKeys.attacks(campaignId) });
        return state;
      },
      rollInitiative: async (body?: RollCombatInitiative) =>
        keep(await combatApi.rollInitiative(campaignId, body)),
      next: async (body?: NextTurn) => keep(await combatApi.next(campaignId, body)),
      previous: async (body?: PreviousTurn) => keep(await combatApi.previous(campaignId, body)),
      setTurn: async (body: SetTurn) => keep(await combatApi.setTurn(campaignId, body)),
      chooseSlotActor: async (body: ChooseSlotActor) =>
        keep(await combatApi.chooseSlotActor(campaignId, body)),
      reorder: async (body: ReorderCombat) => keep(await combatApi.reorder(campaignId, body)),
      updateSettings: async (body: UpdateCombatSettings) =>
        keep(await combatApi.updateSettings(campaignId, body)),
      addParticipants: async (body: AddCombatParticipants) =>
        keep(await combatApi.addParticipants(campaignId, body)),
      updateParticipant: async (characterId: string, body: UpdateCombatParticipant) =>
        keep(await combatApi.updateParticipant(campaignId, characterId, body)),
      removeParticipant: async (characterId: string) =>
        keep(await combatApi.removeParticipant(campaignId, characterId)),
      rollParticipantInitiative: async (characterId: string, body?: RollParticipantInitiative) => {
        const r = await combatApi.rollParticipantInitiative(campaignId, characterId, body);
        keep(r.combat);
        return r;
      },
      submitInitiativeDice: async (characterId: string, body: SubmitRollDice) => {
        const r = await combatApi.submitInitiativeDice(campaignId, characterId, body);
        keep(r.combat);
        return r;
      },
      end: async (body?: EndCombat) => {
        await combatApi.end(campaignId, body);
        client.setQueryData(key, null);
        void client.invalidateQueries({ queryKey: combatKeys.attacks(campaignId) });
      },
    };
  }, [client, campaignId]);
}
