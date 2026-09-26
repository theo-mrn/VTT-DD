/**
 * Combat en base : une ligne `campaign_combats` par campagne (combat actif) et
 * ses participants, turn_order = position dans l'ordre d'initiative.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { campaignCombatParticipants, campaignCombats, type Role } from '../../db/schema.js';
import { actorRole } from '../campaigns/repository.js';
import { stateOf } from './api.js';
import { remove, type CombatState } from './turns.js';

export type CombatRow = typeof campaignCombats.$inferSelect;
export type ParticipantRow = typeof campaignCombatParticipants.$inferSelect;

export interface LoadedCombat {
  combat: CombatRow;
  participants: ParticipantRow[];
}

/** Combat actif de la campagne (verrouillé pour la transaction si `lock`), ou null. */
export async function loadCombat(
  db: Db | Tx,
  campaignId: string,
  lock = false,
): Promise<LoadedCombat | null> {
  const query = db.select().from(campaignCombats).where(eq(campaignCombats.campaignId, campaignId));
  const [combat] = lock ? await query.for('update') : await query;
  if (!combat) return null;
  const participants = await db
    .select()
    .from(campaignCombatParticipants)
    .where(eq(campaignCombatParticipants.campaignId, campaignId))
    .orderBy(asc(campaignCombatParticipants.turnOrder));
  return { combat, participants };
}

/**
 * Enregistre un nouvel état : ligne du combat (version + 1) et participants
 * réécrits dans l'ordre (ceux absents de l'état sont retirés).
 */
export async function saveState(
  tx: Tx,
  combat: CombatRow,
  state: CombatState,
  options: { initiativeRolled?: boolean } = {},
): Promise<LoadedCombat> {
  const [updated] = await tx
    .update(campaignCombats)
    .set({
      round: state.round,
      currentIndex: state.currentIndex,
      slots: state.slots,
      ...(options.initiativeRolled !== undefined
        ? { initiativeRolled: options.initiativeRolled }
        : {}),
      version: combat.version + 1,
      updatedAt: sql`now()`,
    })
    .where(eq(campaignCombats.campaignId, combat.campaignId))
    .returning();
  await tx
    .delete(campaignCombatParticipants)
    .where(eq(campaignCombatParticipants.campaignId, combat.campaignId));
  const participants = state.order.length
    ? await tx
        .insert(campaignCombatParticipants)
        .values(
          state.order.map((p, turnOrder) => ({
            campaignId: combat.campaignId,
            characterId: p.characterId,
            turnOrder,
            side: p.side,
            sortKeys: p.sortKeys,
            hasActed: p.hasActed,
          })),
        )
        .returning()
    : [];
  return {
    combat: updated!,
    participants: participants.sort((a, b) => a.turnOrder - b.turnOrder),
  };
}

/** Événement de combat (sujet vtt.<campaignId>.combat.<action>). */
export function combatEvent(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: 'combat.started' | 'combat.turn_changed' | 'combat.ended';
    combat: CombatRow;
    userId: string;
    role: Role | null;
    payload: Record<string, unknown>;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: e.combat.campaignId,
    actor: { userId: e.userId, role: actorRole(e.role), characterId: null },
    aggregate: { type: 'combat', id: e.combat.id },
    payload: e.payload,
  });
}

/**
 * Personnages qui quittent la campagne pendant un combat : ils sortent de
 * l'ordre (et leur créneau disparaît). À appeler, campagne verrouillée, avant
 * de supprimer leur engagement.
 */
export async function removeFromCombat(
  tx: Tx,
  ctx: EventContext,
  campaignId: string,
  characterIds: string[],
  actor: { userId: string; role: Role | null },
) {
  const loaded = await loadCombat(tx, campaignId, true);
  if (!loaded) return;
  const affected = characterIds.filter((id) =>
    loaded.participants.some((p) => p.characterId === id),
  );
  if (!affected.length) return;
  const state = remove(stateOf(loaded.combat, loaded.participants), affected);
  const { combat } = await saveState(tx, loaded.combat, state);
  await combatEvent(tx, ctx, {
    type: 'combat.turn_changed',
    combat,
    ...actor,
    payload: {
      reason: 'participants_removed',
      removed: affected,
      round: combat.round,
      currentIndex: combat.currentIndex,
      version: combat.version,
    },
  });
}
