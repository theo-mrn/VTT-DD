/**
 * Clés d'API : création, liste, révocation et échange contre un jeton d'accès.
 * Chaque changement d'état écrit son événement dans l'outbox, dans la même
 * transaction. Ni la clé ni son empreinte ne sortent jamais d'ici (réponses de
 * liste, événements, logs).
 */
import { uuidv7 } from '@vtt/contracts';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { apiKeys, users } from '../../db/schema.js';
import { CLES_ACTIVES_MAX, empreinteCle, genererCle } from './cles.js';

export class LimiteAtteinte extends Error {
  constructor() {
    super(`Au plus ${CLES_ACTIVES_MAX} clés actives`);
    this.name = 'LimiteAtteinte';
  }
}

export interface CleListee {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });

/** Clés actives du compte, les plus récentes d'abord. */
export async function listerCles(db: Db, userId: string): Promise<CleListee[]> {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
}

/** Crée une clé ; la clé brute n'est renvoyée qu'ici. */
export async function creerCle(
  db: Db,
  ctx: EventContext,
  userId: string,
  nom: string,
): Promise<{ id: string; name: string; prefix: string; key: string }> {
  const { cle, prefixe, empreinte } = genererCle();
  const id = uuidv7();

  await db.transaction(async (tx) => {
    // Verrou sur le compte : deux créations simultanées ne dépassent pas la limite
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [actives] = await tx
      .select({ n: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
    if ((actives?.n ?? 0) >= CLES_ACTIVES_MAX) throw new LimiteAtteinte();

    await tx.insert(apiKeys).values({ id, userId, name: nom, prefix: prefixe, keyHash: empreinte });
    await appendEvent(tx, ctx, {
      type: 'identity.api_key_created',
      actor: acteur(userId),
      aggregate: { type: 'user', id: userId },
      payload: { keyId: id, name: nom },
      visibility: 'owner',
    });
  });

  return { id, name: nom, prefix: prefixe, key: cle };
}

/** Révoque une clé active du compte. Faux si elle n'existe pas ou n'est pas à lui. */
export async function revoquerCle(
  db: Db,
  ctx: EventContext,
  userId: string,
  cleId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const revoquees = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, cleId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    if (revoquees.length === 0) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.api_key_revoked',
      actor: acteur(userId),
      aggregate: { type: 'user', id: userId },
      payload: { keyId: cleId },
      visibility: 'owner',
    });
    return true;
  });
}

/**
 * Vérifie une clé présentée à la gateway : active et compte non désactivé.
 * Met à jour la date de dernière utilisation. Renvoie le compte, ou null.
 */
export async function utiliserCle(
  db: Db,
  ctx: EventContext,
  cle: string,
): Promise<{ userId: string; keyId: string } | null> {
  const empreinte = empreinteCle(cle);
  return db.transaction(async (tx) => {
    const [ligne] = await tx
      .select({ keyId: apiKeys.id, userId: apiKeys.userId, disabledAt: users.disabledAt })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(and(eq(apiKeys.keyHash, empreinte), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (!ligne || ligne.disabledAt !== null) return null;

    await tx.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, ligne.keyId));
    await appendEvent(tx, ctx, {
      type: 'identity.api_key_used',
      actor: acteur(ligne.userId),
      aggregate: { type: 'user', id: ligne.userId },
      payload: { keyId: ligne.keyId },
      visibility: 'owner',
    });
    return { userId: ligne.userId, keyId: ligne.keyId };
  });
}
