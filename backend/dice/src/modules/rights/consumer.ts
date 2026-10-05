/**
 * Consommateur durable `dice-rights` : applique les droits publiés par billing
 * (billing.entitlements_changed, état complet et version). Remplace les
 * anciennes routes internes /internal/users/:id/all-skins et /inventory/:skin.
 *
 *  - premium : accès à tous les skins (preferences.all_skins) ;
 *  - diceSkins : skins achetés ; l'inventaire de source `purchase` est aligné
 *    dessus (ajouts, et retraits après un remboursement). Les skins importés
 *    de l'ancienne app, offerts ou gagnés ne sont jamais touchés.
 *
 * Une version déjà appliquée (ou plus ancienne) est ignorée : l'ordre de
 * livraison et les doublons sont sans effet. Le tout dans une transaction :
 * une erreur fait relivrer le message.
 */
import { EntitlementsChanged, ENTITLEMENTS_CHANGED, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { billingRights, inventory } from '../../db/schema.js';
import { skin } from '../../skins/catalog.js';
import { applyAllSkins } from '../preferences/index.js';

export const RIGHTS_CONSUMER = 'dice-rights';

const SYSTEM = { userId: null, role: 'system' as const, characterId: null };

export type RightsOutcome = 'applied' | 'stale' | 'ignored';

interface Log {
  warn(obj: object, msg: string): void;
}

/** Traite un événement du bus ; une erreur (base) fait relivrer le message. */
export async function handleRightsEvent(
  db: Db,
  event: EventEnvelope,
  log?: Log,
): Promise<RightsOutcome> {
  if (event.type !== ENTITLEMENTS_CHANGED) return 'ignored';
  const parsed = EntitlementsChanged.safeParse(event.payload);
  if (!parsed.success) {
    log?.warn({ eventId: event.id }, 'droits billing illisibles : ignorés');
    return 'ignored';
  }
  const rights = parsed.data;
  const ctx: EventContext = { correlationId: event.correlationId, traceparent: event.traceparent };

  return db.transaction(async (tx) => {
    // Version strictement plus récente seulement (verrou de ligne : un seul à la fois)
    const [fresh] = await tx
      .insert(billingRights)
      .values({ userId: rights.userId, version: rights.version })
      .onConflictDoUpdate({
        target: billingRights.userId,
        set: { version: rights.version, updatedAt: sql`now()` },
        setWhere: lt(billingRights.version, rights.version),
      })
      .returning({ version: billingRights.version });
    if (!fresh) return 'stale';

    await applyAllSkins(tx, ctx, rights.userId, rights.premium);
    await alignPurchasedSkins(tx, ctx, rights.userId, rights.diceSkins, log);
    return 'applied';
  });
}

/** Aligne l'inventaire de source `purchase` sur les skins achetés selon billing. */
async function alignPurchasedSkins(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  skinIds: string[],
  log?: Log,
) {
  const wanted = new Set<string>();
  for (const id of skinIds) {
    const s = skin(id);
    if (!s) log?.warn({ userId, skinId: id }, 'skin acheté inconnu du catalogue : ignoré');
    // Un skin gratuit est toujours possédé : rien à enregistrer
    else if (!s.free) wanted.add(id);
  }
  const current = (
    await tx
      .select({ skinId: inventory.skinId })
      .from(inventory)
      .where(and(eq(inventory.userId, userId), eq(inventory.source, 'purchase')))
  ).map((r) => r.skinId);

  const event = (type: string, skinId: string) =>
    appendEvent(tx, ctx, {
      type,
      actor: SYSTEM,
      aggregate: { type: 'dice_preferences', id: userId },
      payload: { userId, skinId, source: 'purchase' },
      visibility: 'owner',
    });

  for (const skinId of wanted) {
    if (current.includes(skinId)) continue;
    // Déjà possédé autrement (import, cadeau) : la ligne existante est gardée
    const added = await tx
      .insert(inventory)
      .values({ userId, skinId, source: 'purchase' })
      .onConflictDoNothing()
      .returning({ skinId: inventory.skinId });
    if (added.length) await event('dice.skin_granted', skinId);
  }

  const removed = current.filter((id) => !wanted.has(id));
  if (removed.length) {
    await tx
      .delete(inventory)
      .where(
        and(
          eq(inventory.userId, userId),
          eq(inventory.source, 'purchase'),
          inArray(inventory.skinId, removed),
        ),
      );
    for (const skinId of removed) await event('dice.skin_revoked', skinId);
  }
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
      await handleRightsEvent(opts.db, event, opts.logger);
    },
  });
}
