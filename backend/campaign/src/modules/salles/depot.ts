/**
 * Salles en base : accès d'un membre, détail d'une salle, événements.
 *
 * Une salle dont l'appelant n'est pas membre est introuvable (404) : on ne
 * révèle pas son existence. Un membre sans le rôle requis reçoit 403.
 */
import type { ActorRole } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  combatParticipants,
  combats,
  roomCharacters,
  roomMembers,
  rooms,
  type Camp,
  type Role,
} from '../../db/schema.js';
import type { Deps } from '../../deps.js';
import { combatApi, type CombatApi } from '../combat/api.js';

export type Salle = typeof rooms.$inferSelect;

export interface Acces {
  salle: Salle;
  role: Role;
}

/** Salle et rôle de l'appelant ; 404 s'il n'en est pas membre. */
export async function acces(db: Db | Tx, roomId: string, userId: string): Promise<Acces> {
  const [ligne] = await db
    .select({ salle: rooms, role: roomMembers.role })
    .from(rooms)
    .innerJoin(roomMembers, and(eq(roomMembers.roomId, rooms.id), eq(roomMembers.userId, userId)))
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!ligne) throw HttpError.notFound('Salle introuvable');
  return ligne;
}

/** Comme `acces`, et 403 si l'appelant n'est pas MJ. */
export async function accesMj(db: Db | Tx, roomId: string, userId: string): Promise<Acces> {
  const a = await acces(db, roomId, userId);
  if (a.role !== 'mj') throw HttpError.forbidden('Réservé au MJ de la salle');
  return a;
}

/** Verrouille la salle pour la transaction (changements de membres, d'engagement, de combat). */
export async function verrouillerSalle(tx: Tx, roomId: string) {
  await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for('update');
}

/** Rôle de l'auteur d'un événement de salle. */
export const roleActeur = (role: Role | null): ActorRole =>
  role === 'mj' ? 'gm' : role ? 'player' : 'user';

/** Événement de salle (sujet vtt.<roomId>.room.<action>), visible des membres. */
export function evenementSalle(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: string;
    roomId: string;
    userId: string;
    role: Role | null;
    payload: Record<string, unknown>;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    roomId: e.roomId,
    actor: { userId: e.userId, role: roleActeur(e.role), characterId: null },
    aggregate: { type: 'room', id: e.roomId },
    payload: e.payload,
  });
}

export interface MembreApi {
  userId: string;
  nom: string | null;
  avatarUrl: string | null;
  role: Role;
}

export interface SalleApi {
  id: string;
  nom: string;
  description: string;
  systeme: { id: string; version: string };
  proprietaireId: string;
  /** Rôle de l'appelant. */
  role: Role;
  membres: MembreApi[];
  personnages: { characterId: string; ownerId: string; camp: Camp; ajoutePar: string }[];
  combat?: CombatApi;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Détail d'une salle pour un membre (profils des membres via identity). */
export async function detailSalle(
  deps: Pick<Deps, 'db' | 'profils'>,
  a: Acces,
  authorization: string | undefined,
): Promise<SalleApi> {
  const { db } = deps;
  const id = a.salle.id;
  const [membres, personnages, [combat], participants] = await Promise.all([
    db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.roomId, id))
      .orderBy(asc(roomMembers.joinedAt), asc(roomMembers.userId)),
    db
      .select()
      .from(roomCharacters)
      .where(eq(roomCharacters.roomId, id))
      .orderBy(asc(roomCharacters.ajouteLe), asc(roomCharacters.characterId)),
    db.select().from(combats).where(eq(combats.roomId, id)),
    db
      .select()
      .from(combatParticipants)
      .where(eq(combatParticipants.roomId, id))
      .orderBy(asc(combatParticipants.rang)),
  ]);
  const profils = await deps.profils.profils(
    membres.map((m) => m.userId),
    authorization,
  );
  return {
    id,
    nom: a.salle.nom,
    description: a.salle.description,
    systeme: { id: a.salle.systemId, version: a.salle.systemVersion },
    proprietaireId: a.salle.ownerId,
    role: a.role,
    membres: membres.map((m) => ({
      userId: m.userId,
      nom: profils.get(m.userId)?.nom ?? null,
      avatarUrl: profils.get(m.userId)?.avatarUrl ?? null,
      role: m.role,
    })),
    personnages: personnages.map((p) => ({
      characterId: p.characterId,
      ownerId: p.ownerId,
      camp: p.camp,
      ajoutePar: p.ajoutePar,
    })),
    ...(combat ? { combat: combatApi(combat, participants) } : {}),
    version: a.salle.version,
    createdAt: a.salle.createdAt.toISOString(),
    updatedAt: a.salle.updatedAt.toISOString(),
  };
}
