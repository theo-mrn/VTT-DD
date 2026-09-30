/**
 * Combat en base : une ligne `campaign_combats` par campagne (combat actif), ses participants
 * (turn_order = position dans l'ordre d'initiative) et le journal des passages de tour.
 */
import { uuidv7, type Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  campaignCombatParticipants,
  campaignCombats,
  campaignCombatTurns,
  type Role,
  type TurnLogReason,
  type TurnSnapshot,
} from '../../db/schema.js';
import { actorRole, type Access } from '../campaigns/repository.js';
import { fullApi, stateOf } from './api.js';
import { remove, type CombatState } from './turns.js';
import { turnChangedPayloads, type TurnChange } from './view.js';

export type CombatRow = typeof campaignCombats.$inferSelect;
export type ParticipantRow = typeof campaignCombatParticipants.$inferSelect;
export type TurnLogRow = typeof campaignCombatTurns.$inferSelect;

export interface LoadedCombat {
  combat: CombatRow;
  participants: ParticipantRow[];
  /** Un passage de tour peut être annulé (journal non vide). */
  canGoBack: boolean;
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
  const [participants, [log]] = await Promise.all([
    db
      .select()
      .from(campaignCombatParticipants)
      .where(eq(campaignCombatParticipants.campaignId, campaignId))
      .orderBy(asc(campaignCombatParticipants.turnOrder)),
    db
      .select({ id: campaignCombatTurns.id })
      .from(campaignCombatTurns)
      .where(
        and(
          eq(campaignCombatTurns.campaignId, campaignId),
          eq(campaignCombatTurns.combatId, combat.id),
        ),
      )
      .limit(1),
  ]);
  return { combat, participants, canGoBack: !!log };
}

/**
 * Enregistre un nouvel état : ligne du combat (version + 1) et participants réécrits dans
 * l'ordre (ceux absents de l'état sont retirés).
 */
export async function saveState(
  tx: Tx,
  loaded: Pick<LoadedCombat, 'combat'> & Partial<Pick<LoadedCombat, 'canGoBack'>>,
  state: CombatState,
  options: { initiativeRolled?: boolean; settings?: CombatRow['settings'] } = {},
): Promise<LoadedCombat> {
  const { combat } = loaded;
  const [updated] = await tx
    .update(campaignCombats)
    .set({
      round: state.round,
      currentIndex: state.currentIndex,
      slots: state.slots,
      currentActorId: state.mode === 'slots' ? state.currentActorId : null,
      turn: state.turn,
      ...(options.initiativeRolled !== undefined
        ? { initiativeRolled: options.initiativeRolled }
        : {}),
      ...(options.settings !== undefined ? { settings: options.settings } : {}),
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
            visibleToPlayers: p.visibleToPlayers,
            initiative: p.initiative,
            initiativePending: p.initiativePending,
            joinedRound: p.joinedRound,
            defeated: p.defeated,
          })),
        )
        .returning()
    : [];
  return {
    combat: updated!,
    participants: participants.sort((a, b) => a.turnOrder - b.turnOrder),
    canGoBack: loaded.canGoBack ?? (await hasTurnLog(tx, updated!)),
  };
}

async function hasTurnLog(tx: Tx, combat: CombatRow) {
  const [row] = await tx
    .select({ id: campaignCombatTurns.id })
    .from(campaignCombatTurns)
    .where(eq(campaignCombatTurns.combatId, combat.id))
    .limit(1);
  return !!row;
}

export type CombatEventType =
  | 'combat.started'
  | 'combat.turn_changed'
  | 'combat.ended'
  | 'combat.settings_updated'
  | 'combat.participant_defeated';

/** Événement de combat (sujet vtt.<campaignId>.combat.<action>, agrégat `combat`). */
export function combatEvent(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: CombatEventType;
    combat: CombatRow;
    userId: string | null;
    role: Role | null;
    payload: Record<string, unknown>;
    visibility?: Visibility;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: e.combat.campaignId,
    actor: {
      userId: e.userId,
      role: e.userId ? actorRole(e.role) : 'system',
      characterId: null,
    },
    aggregate: { type: 'combat', id: e.combat.id },
    payload: e.payload,
    ...(e.visibility ? { visibility: e.visibility } : {}),
  });
}

/**
 * `combat.turn_changed` : un seul événement public quand rien n'est à cacher ; sinon la charge
 * complète aux MJ (`gm_only`) et la charge expurgée à tous (même version).
 */
export async function turnChanged(
  tx: Tx,
  ctx: EventContext,
  loaded: LoadedCombat,
  actor: { userId: string | null; role: Role | null },
  change: TurnChange,
) {
  const { gm, players, same } = turnChangedPayloads(fullApi(loaded), change);
  const base = { type: 'combat.turn_changed' as const, combat: loaded.combat, ...actor };
  if (!same) await combatEvent(tx, ctx, { ...base, payload: gm, visibility: 'gm_only' });
  await combatEvent(tx, ctx, { ...base, payload: players });
}

// ─── Journal des passages de tour ────────────────────────────────────────────

/** Enregistre un passage (état d'avant) ; renvoie son identifiant. */
export async function logTurn(
  tx: Tx,
  combat: CombatRow,
  e: {
    id?: string;
    reason: TurnLogReason;
    before: TurnSnapshot;
    userId: string;
    tickId?: string | null;
  },
): Promise<string> {
  const id = e.id ?? uuidv7();
  await tx.insert(campaignCombatTurns).values({
    id,
    campaignId: combat.campaignId,
    combatId: combat.id,
    reason: e.reason,
    before: e.before,
    tickId: e.tickId ?? null,
    createdBy: e.userId,
  });
  return id;
}

/** Dernier passage du combat (verrouillé), ou null. */
export async function lastTurn(tx: Tx, combat: CombatRow): Promise<TurnLogRow | null> {
  const [row] = await tx
    .select()
    .from(campaignCombatTurns)
    .where(eq(campaignCombatTurns.combatId, combat.id))
    // Début de la transaction du passage, puis identifiant (UUIDv7 : même milliseconde)
    .orderBy(desc(campaignCombatTurns.createdAt), desc(campaignCombatTurns.id))
    .limit(1)
    .for('update');
  return row ?? null;
}

export async function dropTurn(tx: Tx, id: string) {
  await tx.delete(campaignCombatTurns).where(eq(campaignCombatTurns.id, id));
}

/** Vide le journal (initiative relancée pour tous : on ne remonte pas au-delà). */
export async function clearTurns(tx: Tx, combat: CombatRow) {
  await tx.delete(campaignCombatTurns).where(eq(campaignCombatTurns.combatId, combat.id));
}

/** Entrées expirées au décompte d'un passage (pour les rendre avec « Précédent »). */
export async function recordExpired(db: Db, id: string, expired: Record<string, string[]>) {
  await db.update(campaignCombatTurns).set({ expired }).where(eq(campaignCombatTurns.id, id));
}

/**
 * Personnages qui quittent la campagne pendant un combat : ils sortent de l'ordre (et leur
 * créneau disparaît). À appeler, campagne verrouillée, avant de supprimer leur engagement.
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
  const saved = await saveState(tx, loaded, state);
  await turnChanged(tx, ctx, saved, actor, {
    reason: 'participants_removed',
    removed: affected,
  });
}

/** Nouveaux réglages (version + 1). */
export async function saveSettings(
  tx: Tx,
  loaded: LoadedCombat,
  settings: CombatRow['settings'],
): Promise<LoadedCombat> {
  const [combat] = await tx
    .update(campaignCombats)
    .set({ settings, version: loaded.combat.version + 1, updatedAt: sql`now()` })
    .where(eq(campaignCombats.campaignId, loaded.combat.campaignId))
    .returning();
  return { ...loaded, combat: combat! };
}

/** Engagements de ces personnages dans la campagne ; 422 `character_not_engaged` sinon. */
export async function engagedOrThrow(db: Db | Tx, campaignId: string, ids: string[]) {
  const engaged = ids.length
    ? await db
        .select()
        .from(campaignCharacters)
        .where(
          and(
            eq(campaignCharacters.campaignId, campaignId),
            inArray(campaignCharacters.characterId, ids),
          ),
        )
    : [];
  const missing = ids.filter((id) => !engaged.some((e) => e.characterId === id));
  if (missing.length)
    throw new HttpError(
      422,
      'Refusé',
      'character_not_engaged',
      `Personnages non engagés dans la campagne : ${missing.join(', ')}`,
    );
  return new Map(engaged.map((e) => [e.characterId, e]));
}

/** 403 si l'appelant n'incarne pas ce personnage dans la campagne. */
export async function requirePlays(db: Db | Tx, a: Access, userId: string, id: string) {
  const [engagement] = await db
    .select({ playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(eq(campaignCharacters.campaignId, a.campaign.id), eq(campaignCharacters.characterId, id)),
    );
  if (!engagement || engagement.playedBy !== userId)
    throw HttpError.forbidden('Seul le MJ ou le joueur qui incarne le personnage agit pour lui');
}
