/**
 * Skins débloqués hors de l'app : achat Stripe confirmé par le service
 * billing (plus tard cadeaux et défis). Même effet que l'ancien webhook
 * Stripe, qui ajoutait le skin à `users/{uid}.dice_inventory` (arrayUnion).
 */
import { HttpError } from '@vtt/platform';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { inventory, type InventorySource } from '../../db/schema.js';
import { skin } from '../../skins/catalog.js';
import { preferencesOf } from '../preferences/index.js';

/**
 * Ajoute `skinId` à l'inventaire de `userId`. Idempotent : un skin déjà
 * possédé (ou gratuit, donc toujours possédé) ne produit ni écriture ni
 * événement. Renvoie les préférences à jour.
 */
export async function grantSkin(
  db: Db,
  ctx: EventContext,
  userId: string,
  skinId: string,
  source: Exclude<InventorySource, 'import'>,
) {
  const s = skin(skinId);
  if (!s) throw new HttpError(422, 'Skin inconnu', 'unknown_skin', `Skin ${skinId}`);
  return db.transaction(async (tx) => {
    if (!s.free) {
      const added = await tx
        .insert(inventory)
        .values({ userId, skinId, source })
        .onConflictDoNothing()
        .returning({ skinId: inventory.skinId });
      if (added.length) {
        await appendEvent(tx, ctx, {
          type: 'dice.skin_granted',
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'dice_preferences', id: userId },
          payload: { userId, skinId, source },
          visibility: 'owner',
        });
      }
    }
    return preferencesOf(tx, userId);
  });
}
