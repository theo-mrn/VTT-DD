/**
 * Module « preferences » : préférences de dés de l'utilisateur connecté.
 *
 *   GET   /v1/dice/me/preferences   { skinId, animation3d, sound, allSkins, inventory }
 *   PATCH /v1/dice/me/preferences   { skinId?, animation3d?, sound? }
 *
 * `inventory` : skins possédés en propre, c'est-à-dire les skins gratuits du
 * catalogue et ceux débloqués (import de l'ancienne app, plus tard boutique et
 * défis), dans l'ordre du catalogue. `allSkins` : accès à tous les skins
 * (premium, publié par le service billing), qui s'ajoute à
 * l'inventaire sans le remplacer. Un skin est possédé si `allSkins` est vrai
 * ou s'il est dans `inventory` (comme `ownsDice = isPremium || inventaire` de
 * l'ancienne boutique) ; un skin choisi doit être possédé.
 */
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { inventory, preferences } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { DEFAULT_SKIN, SKINS, skin } from '../../skins/catalog.js';
import { currentUser, eventContext } from '../schemas.js';

export const Preferences = z.object({
  skinId: z.string(),
  animation3d: z.boolean(),
  sound: z.boolean(),
  allSkins: z.boolean(),
  inventory: z.array(z.string()),
});
type Preferences = z.output<typeof Preferences>;

const SkinId = z.string().regex(/^[a-z0-9_]{1,64}$/, 'Identifiant de skin invalide');

/** Base ou transaction en cours (lecture). */
type Reader = Pick<Db, 'select'>;

/** Un skin est possédé : accès à tous les skins, ou skin gratuit ou débloqué. */
export const ownsSkin = (p: Pick<Preferences, 'allSkins' | 'inventory'>, skinId: string) =>
  !!skin(skinId) && (p.allSkins || p.inventory.includes(skinId));

/** Skins possédés en propre par `userId` : gratuits et débloqués, dans l'ordre du catalogue. */
async function ownedSkins(db: Reader, userId: string): Promise<string[]> {
  const owned = new Set(
    (
      await db
        .select({ skinId: inventory.skinId })
        .from(inventory)
        .where(eq(inventory.userId, userId))
    ).map((x) => x.skinId),
  );
  return SKINS.filter((s) => s.free || owned.has(s.id)).map((s) => s.id);
}

export async function preferencesOf(db: Reader, userId: string): Promise<Preferences> {
  const [[row], owned] = await Promise.all([
    db.select().from(preferences).where(eq(preferences.userId, userId)),
    ownedSkins(db, userId),
  ]);
  const access = { allSkins: row?.allSkins ?? false, inventory: owned };
  // Skin plus possédé (remboursement, fin d'abonnement…) : retour au skin par défaut
  const skinId = row && ownsSkin(access, row.skinId) ? row.skinId : DEFAULT_SKIN;
  return {
    skinId,
    animation3d: row?.animation3d ?? true,
    sound: row?.sound ?? true,
    ...access,
  };
}

/** Charge utile de `dice.preferences_updated`. */
const eventPayload = (userId: string, p: Preferences) => ({
  userId,
  skinId: p.skinId,
  animation3d: p.animation3d,
  sound: p.sound,
  allSkins: p.allSkins,
});

/**
 * Accorde ou retire l'accès à tous les skins (premium, droits publiés par
 * billing), dans la transaction de l'appelant. Sans changement, aucune
 * écriture ni événement. Le skin choisi est conservé ; s'il n'est plus
 * possédé, les préférences renvoient le skin par défaut.
 */
export async function applyAllSkins(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  allSkins: boolean,
): Promise<boolean> {
  const [row] = await tx
    .select({ allSkins: preferences.allSkins })
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .for('update');
  if ((row?.allSkins ?? false) === allSkins) return false;
  await tx
    .insert(preferences)
    .values({ userId, skinId: DEFAULT_SKIN, allSkins })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { allSkins, updatedAt: sql`now()` },
    });
  const next = await preferencesOf(tx, userId);
  await appendEvent(tx, ctx, {
    type: 'dice.preferences_updated',
    actor: { userId: null, role: 'system', characterId: null },
    aggregate: { type: 'dice_preferences', id: userId },
    payload: eventPayload(userId, next),
    visibility: 'owner',
  });
  return true;
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/dice/me/preferences',
    { ...auth, schema: { response: { 200: Preferences } } },
    async (req) => preferencesOf(db, currentUser(req)),
  );

  r.patch(
    '/v1/dice/me/preferences',
    {
      ...auth,
      schema: {
        body: z
          .object({
            skinId: SkinId.optional(),
            animation3d: z.boolean().optional(),
            sound: z.boolean().optional(),
          })
          .refine((b) => Object.keys(b).length > 0, 'Aucune préférence à modifier'),
        response: { 200: Preferences },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const current = await preferencesOf(db, userId);
      const { skinId, animation3d, sound } = req.body;
      if (skinId !== undefined) {
        if (!skin(skinId))
          throw new HttpError(422, 'Skin inconnu', 'unknown_skin', `Skin ${skinId}`);
        if (!ownsSkin(current, skinId))
          throw new HttpError(
            403,
            'Accès refusé',
            'skin_not_owned',
            'Ce skin n’est pas dans votre inventaire',
          );
      }
      const next = {
        skinId: skinId ?? current.skinId,
        animation3d: animation3d ?? current.animation3d,
        sound: sound ?? current.sound,
      };
      const result = { ...current, ...next };
      await db.transaction(async (tx) => {
        await tx
          .insert(preferences)
          .values({ userId, ...next })
          .onConflictDoUpdate({
            target: preferences.userId,
            set: { ...next, updatedAt: sql`now()` },
          });
        await appendEvent(tx, eventContext(req), {
          type: 'dice.preferences_updated',
          actor: { userId, role: 'user', characterId: null },
          aggregate: { type: 'dice_preferences', id: userId },
          payload: eventPayload(userId, result),
          visibility: 'owner',
        });
      });
      return result;
    },
  );
};
