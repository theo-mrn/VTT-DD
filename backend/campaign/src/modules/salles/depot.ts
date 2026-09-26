/**
 * Salles en base : accès d'un membre, détail d'une salle, événements.
 *
 * Une salle dont l'appelant n'est pas membre est introuvable (404) : on ne
 * révèle pas son existence. Un membre sans le rôle requis reçoit 403.
 */
import type { ActorRole, Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Profil } from '../../clients/profils.js';
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
import { moi } from '../schemas.js';

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
    /** Public par défaut (membres de la salle). */
    visibility?: Visibility;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    roomId: e.roomId,
    actor: { userId: e.userId, role: roleActeur(e.role), characterId: null },
    aggregate: { type: 'room', id: e.roomId },
    payload: e.payload,
    ...(e.visibility ? { visibility: e.visibility } : {}),
  });
}

export interface MembreApi {
  userId: string;
  nom: string | null;
  avatarUrl: string | null;
  role: Role;
}

export interface UtilisateurApi {
  id: string;
  nom: string | null;
  avatarUrl: string | null;
}

/** Champs communs à la liste des salles, aux campagnes publiques et au détail. */
export interface ChampsSalleApi {
  id: string;
  nom: string;
  description: string;
  systeme: { id: string; version: string };
  code: string;
  imageUrl: string | null;
  maxJoueurs: number;
  publique: boolean;
  creationPersonnages: boolean;
  joueurs: number;
  complete: boolean;
  proprietaire: UtilisateurApi;
  updatedAt: string;
}

export interface ResumeSalleApi extends ChampsSalleApi {
  role: Role | null;
  membres: number;
}

export interface SalleApi extends ChampsSalleApi {
  proprietaireId: string;
  /** Rôle de l'appelant. */
  role: Role;
  personnageIncarne: string | null;
  membres: MembreApi[];
  personnages: {
    characterId: string;
    ownerId: string;
    camp: Camp;
    ajoutePar: string;
    incarnePar: string | null;
  }[];
  combat?: CombatApi;
  version: number;
  createdAt: string;
}

/** Utilisateur affiché, depuis les profils chargés. */
export const utilisateurApi = (id: string, profils: Map<string, Profil>): UtilisateurApi => ({
  id,
  nom: profils.get(id)?.nom ?? null,
  avatarUrl: profils.get(id)?.avatarUrl ?? null,
});

function champsSalle(salle: Salle, joueurs: number, profils: Map<string, Profil>): ChampsSalleApi {
  return {
    id: salle.id,
    nom: salle.nom,
    description: salle.description,
    systeme: { id: salle.systemId, version: salle.systemVersion },
    code: salle.code,
    imageUrl: salle.imageUrl,
    maxJoueurs: salle.maxJoueurs,
    publique: salle.publique,
    creationPersonnages: salle.creationPersonnages,
    joueurs,
    complete: joueurs >= salle.maxJoueurs,
    proprietaire: utilisateurApi(salle.ownerId, profils),
    updatedAt: salle.updatedAt.toISOString(),
  };
}

/** Effectif des salles : membres, et places occupées (membres qui ne sont pas MJ). */
export function effectifs(db: Db | Tx) {
  return db
    .select({
      roomId: roomMembers.roomId,
      membres: count().as('membres'),
      joueurs: sql<number>`count(*) filter (where ${roomMembers.role} <> 'mj')`
        .mapWith(Number)
        .as('joueurs'),
    })
    .from(roomMembers)
    .groupBy(roomMembers.roomId)
    .as('effectif');
}

/** Places occupées d'une salle (membres qui ne sont pas MJ). */
export async function joueursDe(db: Db | Tx, roomId: string): Promise<number> {
  const [ligne] = await db
    .select({ n: count() })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), ne(roomMembers.role, 'mj')));
  return ligne!.n;
}

/** Salles d'une liste, avec le profil de leur propriétaire. */
export async function resumesSalles(
  deps: Pick<Deps, 'profils'>,
  lignes: { salle: Salle; role: Role | null; membres: number; joueurs: number }[],
  authorization: string | undefined,
): Promise<ResumeSalleApi[]> {
  const profils = await deps.profils.profils(
    [...new Set(lignes.map((l) => l.salle.ownerId))],
    authorization,
  );
  return lignes.map((l) => ({
    ...champsSalle(l.salle, Number(l.joueurs), profils),
    role: l.role,
    membres: Number(l.membres),
  }));
}

/** Détail d'une salle pour un membre (profils des membres via identity). */
export async function detailSalle(
  deps: Pick<Deps, 'db' | 'profils'>,
  a: Acces,
  req: FastifyRequest,
): Promise<SalleApi> {
  const { db } = deps;
  const userId = moi(req);
  const id = a.salle.id;
  // Relue : l'accès a pu être obtenu avant une modification de la même requête
  const [[salle], membres, personnages, [combat], participants] = await Promise.all([
    db.select().from(rooms).where(eq(rooms.id, id)),
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
  const s = salle ?? a.salle;
  const profils = await deps.profils.profils(
    [...new Set([s.ownerId, ...membres.map((m) => m.userId)])],
    req.headers.authorization,
  );
  return {
    ...champsSalle(s, membres.filter((m) => m.role !== 'mj').length, profils),
    proprietaireId: s.ownerId,
    role: a.role,
    personnageIncarne: personnages.find((p) => p.incarnePar === userId)?.characterId ?? null,
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
      incarnePar: p.incarnePar,
    })),
    ...(combat ? { combat: combatApi(combat, participants) } : {}),
    version: s.version,
    createdAt: s.createdAt.toISOString(),
  };
}
