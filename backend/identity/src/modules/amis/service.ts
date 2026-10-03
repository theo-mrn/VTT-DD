/**
 * Amis : demandes en attente (friend_requests) et amitiés (friendships, une
 * ligne par paire ordonnée user_a < user_b).
 *
 * Chaque écriture prend un verrou consultatif sur la paire pendant sa
 * transaction : deux demandes croisées envoyées en même temps sont traitées
 * l'une après l'autre, la seconde voit la première et crée l'amitié.
 */
import { HttpError } from '@vtt/platform';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { friendRequests, friendships, profiles, users } from '../../db/schema.js';

/** Paire ordonnée comme en base : l'ordre des UUID en minuscules est celui de PostgreSQL. */
export function paire(x: string, y: string): { userA: string; userB: string } {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });

async function verrouillerPaire(tx: Tx, x: string, y: string) {
  const { userA, userB } = paire(x, y);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`amis:${userA}:${userB}`}, 0))`,
  );
}

async function evenement(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await appendEvent(tx, ctx, {
    type,
    actor: acteur(userId),
    aggregate: { type: 'user', id: userId },
    visibility: 'owner',
    payload,
  });
}

async function sontAmis(tx: Tx, x: string, y: string): Promise<boolean> {
  const { userA, userB } = paire(x, y);
  const [ligne] = await tx
    .select({ a: friendships.userA })
    .from(friendships)
    .where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)))
    .limit(1);
  return !!ligne;
}

/** Crée l'amitié et supprime les demandes dans les deux sens. */
async function lier(tx: Tx, x: string, y: string) {
  await tx
    .delete(friendRequests)
    .where(
      or(
        and(eq(friendRequests.fromUser, x), eq(friendRequests.toUser, y)),
        and(eq(friendRequests.fromUser, y), eq(friendRequests.toUser, x)),
      ),
    );
  await tx.insert(friendships).values(paire(x, y)).onConflictDoNothing();
}

export interface Ami {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  since: string;
}

export async function listerAmis(db: Db, moi: string): Promise<Ami[]> {
  const autre = sql<string>`case when ${friendships.userA} = ${moi} then ${friendships.userB} else ${friendships.userA} end`;
  const lignes = await db
    .select({
      id: users.id,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      title: profiles.title,
      since: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, autre))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(or(eq(friendships.userA, moi), eq(friendships.userB, moi)), isNull(users.disabledAt)),
    )
    .orderBy(asc(profiles.name), asc(users.id));
  return lignes.map((l) => ({ ...l, since: l.since.toISOString() }));
}

export interface Demande {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

async function demandes(db: Db, moi: string, sens: 'received' | 'sent'): Promise<Demande[]> {
  const [cote, autre] =
    sens === 'received'
      ? [friendRequests.toUser, friendRequests.fromUser]
      : [friendRequests.fromUser, friendRequests.toUser];
  const lignes = await db
    .select({
      id: users.id,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      createdAt: friendRequests.createdAt,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, autre))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(cote, moi), isNull(users.disabledAt)))
    .orderBy(desc(friendRequests.createdAt), asc(users.id));
  return lignes.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }));
}

export async function listerDemandes(db: Db, moi: string) {
  const [received, sent] = await Promise.all([
    demandes(db, moi, 'received'),
    demandes(db, moi, 'sent'),
  ]);
  return { received, sent };
}

/**
 * Envoie une demande. Si l'autre joueur avait déjà demandé, la demande vaut
 * acceptation et l'amitié est créée.
 */
export async function envoyerDemande(
  db: Db,
  ctx: EventContext,
  moi: string,
  cible: string,
): Promise<{ status: 'pending' | 'accepted' }> {
  if (moi.toLowerCase() === cible.toLowerCase()) {
    throw HttpError.badRequest('Impossible de vous ajouter vous-même', 'self_request');
  }
  return db.transaction(async (tx) => {
    const [compte] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, cible), isNull(users.disabledAt)))
      .limit(1);
    if (!compte) throw HttpError.notFound('Joueur introuvable');

    await verrouillerPaire(tx, moi, cible);

    if (await sontAmis(tx, moi, cible)) {
      throw HttpError.conflict('Vous êtes déjà amis', 'already_friends');
    }

    const existantes = await tx
      .select({ from: friendRequests.fromUser })
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.fromUser, moi), eq(friendRequests.toUser, cible)),
          and(eq(friendRequests.fromUser, cible), eq(friendRequests.toUser, moi)),
        ),
      );
    if (existantes.some((d) => d.from === moi)) {
      throw HttpError.conflict('Demande déjà envoyée', 'request_already_sent');
    }

    if (existantes.some((d) => d.from === cible)) {
      await lier(tx, moi, cible);
      await evenement(tx, ctx, moi, 'identity.friend_request_accepted', { friendId: cible });
      return { status: 'accepted' as const };
    }

    await tx.insert(friendRequests).values({ fromUser: moi, toUser: cible });
    await evenement(tx, ctx, moi, 'identity.friend_request_sent', { toUserId: cible });
    return { status: 'pending' as const };
  });
}

/** Accepte la demande reçue de `de` (404 s'il n'y en a pas). */
export async function accepterDemande(
  db: Db,
  ctx: EventContext,
  moi: string,
  de: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await verrouillerPaire(tx, moi, de);
    const [demande] = await tx
      .select({ from: friendRequests.fromUser })
      .from(friendRequests)
      .where(and(eq(friendRequests.fromUser, de), eq(friendRequests.toUser, moi)))
      .limit(1);
    if (!demande) throw HttpError.notFound('Aucune demande reçue de ce joueur');
    await lier(tx, moi, de);
    await evenement(tx, ctx, moi, 'identity.friend_request_accepted', { friendId: de });
  });
}

/**
 * Refuse la demande reçue de `autre` ou annule celle qui lui a été envoyée
 * (404 s'il n'y a ni l'une ni l'autre).
 */
export async function supprimerDemande(
  db: Db,
  ctx: EventContext,
  moi: string,
  autre: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await verrouillerPaire(tx, moi, autre);
    const supprimees = await tx
      .delete(friendRequests)
      .where(
        or(
          and(eq(friendRequests.fromUser, autre), eq(friendRequests.toUser, moi)),
          and(eq(friendRequests.fromUser, moi), eq(friendRequests.toUser, autre)),
        ),
      )
      .returning({ from: friendRequests.fromUser });
    if (!supprimees.length) throw HttpError.notFound('Aucune demande avec ce joueur');
    for (const d of supprimees) {
      if (d.from === moi) {
        await evenement(tx, ctx, moi, 'identity.friend_request_cancelled', { toUserId: autre });
      } else {
        await evenement(tx, ctx, moi, 'identity.friend_request_declined', { fromUserId: autre });
      }
    }
  });
}

/** Retire un ami (404 si vous n'êtes pas amis). */
export async function retirerAmi(
  db: Db,
  ctx: EventContext,
  moi: string,
  ami: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { userA, userB } = paire(moi, ami);
    const supprimees = await tx
      .delete(friendships)
      .where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)))
      .returning({ a: friendships.userA });
    if (!supprimees.length) throw HttpError.notFound('Ce joueur ne fait pas partie de vos amis');
    await evenement(tx, ctx, moi, 'identity.friend_removed', { friendId: ami });
  });
}
