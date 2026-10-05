/**
 * Statut premium affiché sur le profil (badge, bordures), appliqué depuis les
 * droits publiés par billing, seule source de vérité de l'abonnement
 * (billing.entitlements_changed : état complet et version).
 *
 * Consommateur durable `identity-rights` : une version déjà appliquée (ou plus
 * ancienne) est ignorée, l'ordre de livraison et les doublons sont donc sans
 * effet. Compte inconnu (supprimé) : acquitté sans effet. Remplace l'ancienne
 * route interne PUT /internal/users/:userId/premium.
 */
import { EntitlementsChanged, ENTITLEMENTS_CHANGED, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { billingRights, profiles } from '../../db/schema.js';

export const RIGHTS_CONSUMER = 'identity-rights';

export type RightsOutcome = 'applied' | 'stale' | 'ignored';

/** Pose le statut premium dans la transaction ; null si le compte n'existe pas. */
export async function setPremium(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  premium: boolean,
): Promise<{ userId: string; premium: boolean } | null> {
  const [row] = await tx
    .select({ premium: profiles.premium })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .for('update');
  if (!row) return null;
  if (row.premium !== premium) {
    await tx
      .update(profiles)
      .set({ premium, updatedAt: sql`now()` })
      .where(eq(profiles.userId, userId));
    await appendEvent(tx, ctx, {
      type: 'identity.premium_changed',
      actor: { userId: null, role: 'system', characterId: null },
      aggregate: { type: 'user', id: userId },
      visibility: 'owner',
      payload: { premium },
    });
  }
  return { userId, premium };
}

/** Traite un événement du bus ; une erreur (base) fait relivrer le message. */
export async function handleRightsEvent(db: Db, event: EventEnvelope): Promise<RightsOutcome> {
  if (event.type !== ENTITLEMENTS_CHANGED) return 'ignored';
  const parsed = EntitlementsChanged.safeParse(event.payload);
  if (!parsed.success) return 'ignored';
  const { userId, version, premium } = parsed.data;
  const ctx: EventContext = {
    correlationId: event.correlationId,
    traceparent: event.traceparent,
    causationId: event.id,
  };

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    if (!profile) return 'ignored';
    // Version strictement plus récente seulement (verrou de ligne : un seul à la fois)
    const [fresh] = await tx
      .insert(billingRights)
      .values({ userId, version })
      .onConflictDoUpdate({
        target: billingRights.userId,
        set: { version, updatedAt: sql`now()` },
        setWhere: lt(billingRights.version, version),
      })
      .returning({ version: billingRights.version });
    if (!fresh) return 'stale';
    await setPremium(tx, ctx, userId, premium);
    return 'applied';
  });
}

/**
 * Démarre le consommateur durable sur `bus` ; renvoie la fonction d'arrêt. À
 * sa création, il relit tout le flux (7 jours) : les versions écartent ce qui
 * est déjà appliqué.
 */
export function startRightsConsumer(opts: {
  bus: Bus;
  db: Db;
  logger?: ConsumeOptions['logger'];
}): Promise<() => Promise<void>> {
  return consumeEvents(opts.bus, {
    durable: RIGHTS_CONSUMER,
    subjects: [`vtt.global.${ENTITLEMENTS_CHANGED}`],
    deliver: 'all',
    ...(opts.logger ? { logger: opts.logger } : {}),
    handler: async (event) => {
      await handleRightsEvent(opts.db, event);
    },
  });
}
