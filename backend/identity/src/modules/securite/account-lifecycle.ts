/**
 * Cycle de vie d'un compte (docs/legal.md) :
 * - suppression demandée : sessions coupées, compte invisible des autres, purge définitive
 *   DELETION_GRACE_DAYS plus tard (`identity.user_deleted`, que chaque service écoute) ;
 *   une reconnexion d'ici là l'annule ;
 * - inactivité : sans visite depuis INACTIVE_AFTER_DAYS, un e-mail prévient ; sans visite
 *   INACTIVITY_NOTICE_DAYS plus tard, la suppression est demandée comme ci-dessus.
 */
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { apiKeys, sessions, users } from '../../db/schema.js';
import { supprimerCompte } from './depot.js';

const DAY_MS = 86_400_000;
export const DELETION_GRACE_DAYS = 7;
export const INACTIVE_AFTER_DAYS = 3 * 365;
export const INACTIVITY_NOTICE_DAYS = 30;
const BATCH = 50;

const SYSTEM = { userId: null, role: 'system' as const, characterId: null };
const actor = (userId: string) => ({ userId, role: 'user' as const, characterId: null });
const account = (userId: string) => ({ type: 'user', id: userId });

export const purgeDate = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);

/**
 * Demande la suppression : sessions révoquées, clés d'API coupées. Une demande déjà en cours
 * garde sa date. `null` : compte introuvable.
 */
export async function requestDeletion(
  db: Db,
  ctx: EventContext,
  userId: string,
  opts: { now?: Date; reason?: 'user' | 'inactivity' } = {},
): Promise<{ purgeAt: Date; email: string | null } | null> {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ email: users.email, requestedAt: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1);
    if (!row) return null;
    const requestedAt = row.requestedAt ?? now;
    if (!row.requestedAt) {
      await tx
        .update(users)
        .set({ deletionRequestedAt: now, updatedAt: now })
        .where(eq(users.id, userId));
      await appendEvent(tx, ctx, {
        type: 'identity.user_deletion_requested',
        actor: opts.reason === 'inactivity' ? SYSTEM : actor(userId),
        aggregate: account(userId),
        payload: { purgeAt: purgeDate(now).toISOString(), reason: opts.reason ?? 'user' },
      });
    }
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await tx
      .update(apiKeys)
      .set({ revokedAt: now })
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
    return { purgeAt: purgeDate(requestedAt), email: row.email };
  });
}

/** Reconnexion : annule une suppression demandée. Vrai si une demande était en cours. */
export async function cancelDeletion(db: Db, ctx: EventContext, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ deletionRequestedAt: null, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNotNull(users.deletionRequestedAt)))
      .returning({ id: users.id });
    if (!row) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.user_deletion_cancelled',
      actor: actor(userId),
      aggregate: account(userId),
      payload: {},
    });
    return true;
  });
}

/** Visite : dernière visite datée (au plus une écriture par jour), avertissement levé. */
export async function touchLastSeen(db: Db, userId: string, now: Date = new Date()) {
  await db
    .update(users)
    .set({ lastSeenAt: now, inactivityWarnedAt: null })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.lastSeenAt),
          lt(users.lastSeenAt, new Date(now.getTime() - DAY_MS)),
          isNotNull(users.inactivityWarnedAt),
        ),
      ),
    );
}

/** Comptes dont le délai est passé : purge définitive, par lots. Renvoie le nombre purgé. */
export async function purgeRequestedDeletions(
  db: Db,
  ctx: EventContext,
  now: Date = new Date(),
): Promise<number> {
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(lt(users.deletionRequestedAt, new Date(now.getTime() - DELETION_GRACE_DAYS * DAY_MS)))
    .orderBy(asc(users.deletionRequestedAt))
    .limit(BATCH);
  let purged = 0;
  for (const { id } of due) if (await supprimerCompte(db, ctx, id)) purged += 1;
  return purged;
}

/** Dernière visite connue : la colonne, sinon la création du compte. */
const lastVisit = sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`;

/** Comptes inactifs à prévenir (jamais prévenus, aucune suppression en cours). */
export async function inactiveToWarn(db: Db, now: Date = new Date()) {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        lt(lastVisit, new Date(now.getTime() - INACTIVE_AFTER_DAYS * DAY_MS)),
        isNull(users.inactivityWarnedAt),
        isNull(users.deletionRequestedAt),
        isNull(users.disabledAt),
        isNotNull(users.email),
      ),
    )
    .limit(BATCH);
}

export async function markInactivityWarned(db: Db, userId: string, now: Date = new Date()) {
  await db.update(users).set({ inactivityWarnedAt: now }).where(eq(users.id, userId));
}

/** Prévenus depuis INACTIVITY_NOTICE_DAYS sans être revenus : leur suppression est à demander. */
export async function inactiveToExpire(db: Db, now: Date = new Date()) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        lt(users.inactivityWarnedAt, new Date(now.getTime() - INACTIVITY_NOTICE_DAYS * DAY_MS)),
        isNull(users.deletionRequestedAt),
      ),
    )
    .limit(BATCH);
}
