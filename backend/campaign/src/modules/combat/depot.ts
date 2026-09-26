/**
 * Combat en base : une ligne `combats` par salle (combat actif) et ses
 * participants, rang = position dans l'ordre d'initiative.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { combatParticipants, combats, type Role } from '../../db/schema.js';
import { roleActeur } from '../salles/depot.js';
import { etatDe } from './api.js';
import { retirer, type EtatCombat } from './ordre.js';

export type LigneCombat = typeof combats.$inferSelect;
export type LigneParticipant = typeof combatParticipants.$inferSelect;

export interface CombatLu {
  combat: LigneCombat;
  participants: LigneParticipant[];
}

/** Combat actif de la salle (verrouillé pour la transaction si `verrou`), ou null. */
export async function lireCombat(
  db: Db | Tx,
  roomId: string,
  verrou = false,
): Promise<CombatLu | null> {
  const requete = db.select().from(combats).where(eq(combats.roomId, roomId));
  const [combat] = verrou ? await requete.for('update') : await requete;
  if (!combat) return null;
  const participants = await db
    .select()
    .from(combatParticipants)
    .where(eq(combatParticipants.roomId, roomId))
    .orderBy(asc(combatParticipants.rang));
  return { combat, participants };
}

/**
 * Enregistre un nouvel état : ligne du combat (version + 1) et participants
 * réécrits dans l'ordre (ceux absents de l'état sont retirés).
 */
export async function enregistrerEtat(
  tx: Tx,
  combat: LigneCombat,
  etat: EtatCombat,
  options: { initiative?: boolean } = {},
): Promise<CombatLu> {
  const [suivant] = await tx
    .update(combats)
    .set({
      round: etat.round,
      courant: etat.courant,
      creneaux: etat.creneaux,
      ...(options.initiative !== undefined ? { initiative: options.initiative } : {}),
      version: combat.version + 1,
      updatedAt: sql`now()`,
    })
    .where(eq(combats.roomId, combat.roomId))
    .returning();
  await tx.delete(combatParticipants).where(eq(combatParticipants.roomId, combat.roomId));
  const participants = etat.ordre.length
    ? await tx
        .insert(combatParticipants)
        .values(
          etat.ordre.map((p, rang) => ({
            roomId: combat.roomId,
            characterId: p.characterId,
            rang,
            camp: p.camp,
            cles: p.cles,
            aAgi: p.aAgi,
          })),
        )
        .returning()
    : [];
  return { combat: suivant!, participants: participants.sort((a, b) => a.rang - b.rang) };
}

/** Événement de combat (sujet vtt.<roomId>.combat.<action>). */
export function evenementCombat(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: 'combat.started' | 'combat.turn_changed' | 'combat.ended';
    combat: LigneCombat;
    userId: string;
    role: Role | null;
    payload: Record<string, unknown>;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    roomId: e.combat.roomId,
    actor: { userId: e.userId, role: roleActeur(e.role), characterId: null },
    aggregate: { type: 'combat', id: e.combat.id },
    payload: e.payload,
  });
}

/**
 * Personnages qui quittent la salle pendant un combat : ils sortent de
 * l'ordre (et leur créneau disparaît). À appeler, salle verrouillée, avant de
 * supprimer leur engagement.
 */
export async function retirerDuCombat(
  tx: Tx,
  ctx: EventContext,
  roomId: string,
  characterIds: string[],
  auteur: { userId: string; role: Role | null },
) {
  const lu = await lireCombat(tx, roomId, true);
  if (!lu) return;
  const touches = characterIds.filter((id) => lu.participants.some((p) => p.characterId === id));
  if (!touches.length) return;
  const etat = retirer(etatDe(lu.combat, lu.participants), touches);
  const { combat } = await enregistrerEtat(tx, lu.combat, etat);
  await evenementCombat(tx, ctx, {
    type: 'combat.turn_changed',
    combat,
    ...auteur,
    payload: {
      raison: 'participants_retires',
      retires: touches,
      round: combat.round,
      courant: combat.courant,
      version: combat.version,
    },
  });
}
