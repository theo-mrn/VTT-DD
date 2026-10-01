/**
 * Attaques et rapports d'une campagne (docs/combat.md § 5, § 7, § 10) : listes et détail
 * filtrés par le service pour l'appelant (un joueur ne reçoit que ses attaques, en vue de
 * l'attaquant), relus en direct.
 *
 * `combat.attack_updated` est un signal sans contenu : on relit l'attaque en REST (filtrée).
 * Les autres événements d'attaque (`resolved`, `decided`, `reverted`… réservés au MJ, ou
 * annonces publiques) relisent aussi l'attaque concernée et les listes.
 *
 * ```ts
 * const { attacks } = useAttacks(campaignId, { status: 'pending', combatId });
 * const { attack } = useAttack(campaignId, attackId);
 * const commands = useAttackCommands(campaignId);
 * const declared = await commands.declare(body, idempotencyKey);
 * await commands.apply(attack.id, { version: attack.version, targets: [...] });
 * ```
 */
'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ApplyAttack,
  ApplyAttacks,
  Attack,
  AttackPage,
  AttackReaction,
  AttackStatus,
  CancelAttack,
  DeclareAttack,
  DeclareAttacks,
  DismissAttack,
  ListAttacksQuery,
  OverrideAttackOutcome,
  RevertAttack,
  SubmitRollDice,
} from '@vtt/contracts';
import { useMemo } from 'react';
import { marquerJetsPerimes } from '../jets';
import type { RealtimeEvent } from '../realtime';
import { relireVersion, usePontCampagne } from '../realtime-bridge';
import { attacksApi, combatKeys } from './api';

export const ATTACK_EVENTS = [
  'combat.attack_updated',
  'combat.attack_resolved',
  'combat.attack_announced',
  'combat.attack_decided',
  'combat.attack_concluded',
  'combat.attack_reverted',
] as const;

// ─── Statuts ─────────────────────────────────────────────────────────────────

/** Attaque en cours de résolution (réactions, dés). */
export const isInProgress = (s: AttackStatus) =>
  s === 'awaiting_reactions' || s === 'awaiting_dice';
/** Rapport résolu, en attente de la décision du MJ. */
export const isPendingDecision = (s: AttackStatus) => s === 'pending';
/** Attaque ouverte : ni décidée, ni abandonnée, ni refusée (ses cibles gardent leur anneau). */
export const isOpen = (s: AttackStatus) => isInProgress(s) || isPendingDecision(s);
/** Plus rien ne bougera sans le MJ (décidée, abandonnée, refusée). */
export const isClosed = (s: AttackStatus) =>
  s === 'applied' || s === 'dismissed' || s === 'cancelled' || s === 'failed';

/** Libellé d'un statut, pour l'auteur et le MJ. */
export const ATTACK_STATUS_LABELS: Record<AttackStatus, string> = {
  awaiting_reactions: 'En attente de la défense',
  awaiting_dice: 'Dés à lancer',
  pending: 'Rapport envoyé au MJ',
  applied: 'Appliqué',
  dismissed: 'Écarté',
  cancelled: 'Abandonnée',
  failed: 'Refusée par les règles',
};

// ─── Cache ───────────────────────────────────────────────────────────────────

/** Garde une attaque reçue (réponse d'une écriture) si elle n'est pas plus ancienne. */
export function keepAttack(client: QueryClient, campaignId: string, attack: Attack) {
  const key = combatKeys.attack(campaignId, attack.id);
  const known = client.getQueryData<Attack>(key);
  if (known && known.version > attack.version) return known;
  client.setQueryData(key, attack);
  void client.invalidateQueries({ queryKey: combatKeys.attackLists(campaignId) });
  return attack;
}

/** Applique un événement d'attaque au cache : relit l'attaque concernée et les listes. */
export function applyAttackEvent(client: QueryClient, campaignId: string, e: RealtimeEvent) {
  const payload = e.event.payload as { attackId?: unknown; version?: unknown; attack?: unknown };
  const attackId =
    typeof payload?.attackId === 'string'
      ? payload.attackId
      : payload?.attack && typeof (payload.attack as Attack).id === 'string'
        ? (payload.attack as Attack).id
        : e.event.aggregate.type === 'attack'
          ? e.event.aggregate.id
          : null;
  const version = typeof payload?.version === 'number' ? payload.version : null;
  if (attackId) {
    const key = combatKeys.attack(campaignId, attackId);
    const known = client.getQueryData<Attack>(key);
    // Déjà à jour (ma propre écriture)
    if (known && version !== null && known.version >= version) return;
    void relireVersion<Attack>(client, key, version, (a) => a.version);
  }
  void client.invalidateQueries({ queryKey: combatKeys.attackLists(campaignId) });
  // Le jet d'une attaque résolue arrive dans l'historique des dés
  if (
    e.event.type === 'combat.attack_updated' &&
    (payload as { change?: unknown }).change === 'resolved'
  )
    marquerJetsPerimes(client);
}

/**
 * Relit les attaques sur leurs événements et à chaque (ré)abonnement sans rejeu. Chaque
 * liste et chaque détail le demandent : le pont est partagé, un événement est appliqué une
 * fois (`realtime-bridge.ts`).
 */
export function useAttackEvents(campaignId: string | null | undefined, enabled = true) {
  const { live } = usePontCampagne(
    'attaques',
    campaignId,
    ATTACK_EVENTS,
    applyAttackEvent,
    (client, id) => void client.invalidateQueries({ queryKey: combatKeys.attacks(id) }),
    enabled,
  );
  return { live };
}

// ─── Lectures ────────────────────────────────────────────────────────────────

const NO_ATTACKS: readonly Attack[] = [];

/** Attaques filtrées (les plus récentes d'abord), tenues à jour en direct. */
export function useAttacks(
  campaignId: string | null | undefined,
  query: ListAttacksQuery = {},
  opts: { enabled?: boolean } = {},
) {
  const enabled = Boolean(campaignId) && (opts.enabled ?? true);
  const { live } = useAttackEvents(campaignId, enabled);
  const q = useQuery({
    queryKey: combatKeys.attackList(campaignId ?? '', query),
    queryFn: (): Promise<AttackPage> => attacksApi.list(campaignId!, query),
    enabled,
    staleTime: 10_000,
  });
  return {
    attacks: q.data?.attacks ?? NO_ATTACKS,
    hasMore: q.data?.hasMore ?? false,
    isLoading: enabled && q.isPending,
    isError: q.isError,
    error: q.error,
    live,
  };
}

/** Une attaque, filtrée pour l'appelant, tenue à jour en direct. */
export function useAttack(
  campaignId: string | null | undefined,
  attackId: string | null | undefined,
) {
  const enabled = Boolean(campaignId && attackId);
  const { live } = useAttackEvents(campaignId, enabled);
  const q = useQuery({
    queryKey: combatKeys.attack(campaignId ?? '', attackId ?? ''),
    queryFn: () => attacksApi.get(campaignId!, attackId!),
    enabled,
    staleTime: 5_000,
  });
  return {
    attack: q.data ?? null,
    isLoading: enabled && q.isPending,
    isError: q.isError,
    error: q.error,
    live,
  };
}

// ─── Écritures ───────────────────────────────────────────────────────────────

/** Écritures des attaques ; chaque réponse est gardée en cache, les listes relues. */
export function useAttackCommands(campaignId: string) {
  const client = useQueryClient();
  return useMemo(() => {
    const keep = (attack: Attack) => keepAttack(client, campaignId, attack);
    const keepAll = (attacks: Attack[]) => attacks.map(keep);
    return {
      declare: async (body: DeclareAttack, idempotencyKey: string) =>
        keep(await attacksApi.declare(campaignId, body, idempotencyKey)),
      declareMany: async (body: DeclareAttacks, idempotencyKey: string) =>
        keepAll((await attacksApi.declareMany(campaignId, body, idempotencyKey)).attacks),
      react: async (attackId: string, body: AttackReaction) =>
        keep(await attacksApi.react(campaignId, attackId, body)),
      submitDice: async (attackId: string, body: SubmitRollDice) =>
        keep(await attacksApi.submitDice(campaignId, attackId, body)),
      cancel: async (attackId: string, body?: CancelAttack) =>
        keep(await attacksApi.cancel(campaignId, attackId, body)),
      apply: async (attackId: string, body: ApplyAttack) =>
        keep(await attacksApi.apply(campaignId, attackId, body)),
      applyMany: async (body: ApplyAttacks) =>
        keepAll((await attacksApi.applyMany(campaignId, body)).attacks),
      dismiss: async (attackId: string, body: DismissAttack) =>
        keep(await attacksApi.dismiss(campaignId, attackId, body)),
      revert: async (attackId: string, body: RevertAttack) =>
        keep(await attacksApi.revert(campaignId, attackId, body)),
      override: async (attackId: string, body: OverrideAttackOutcome) =>
        keep(await attacksApi.override(campaignId, attackId, body)),
    };
  }, [client, campaignId]);
}
