/**
 * Module « preferences » : préférences de dés de l'utilisateur connecté.
 *
 *   GET   /v1/dice/me/preferences   { skinId, animation3d, sound, inventory }
 *   PATCH /v1/dice/me/preferences   { skinId?, animation3d?, sound? }
 *
 * `inventory` : skins utilisables, c'est-à-dire les skins gratuits du
 * catalogue et ceux débloqués (import de l'ancienne app, plus tard boutique et
 * défis), dans l'ordre du catalogue. Un skin choisi doit en faire partie.
 */
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { inventory, preferences } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { DEFAULT_SKIN, SKINS, skin } from '../../skins/catalog.js';
import { currentUser, eventContext } from '../schemas.js';

const Preferences = z.object({
  skinId: z.string(),
  animation3d: z.boolean(),
  sound: z.boolean(),
  inventory: z.array(z.string()),
});
type Preferences = z.output<typeof Preferences>;

const SkinId = z.string().regex(/^[a-z0-9_]{1,64}$/, 'Identifiant de skin invalide');

/** Skins utilisables par `userId` : gratuits et débloqués, dans l'ordre du catalogue. */
async function usableSkins(db: Db, userId: string): Promise<string[]> {
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

export async function preferencesOf(db: Db, userId: string): Promise<Preferences> {
  const [[row], usable] = await Promise.all([
    db.select().from(preferences).where(eq(preferences.userId, userId)),
    usableSkins(db, userId),
  ]);
  // Skin retiré de l'inventaire (remboursement…) : retour au skin par défaut
  const skinId = row && usable.includes(row.skinId) ? row.skinId : DEFAULT_SKIN;
  return {
    skinId,
    animation3d: row?.animation3d ?? true,
    sound: row?.sound ?? true,
    inventory: usable,
  };
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
        if (!current.inventory.includes(skinId))
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
          payload: { userId, ...next },
          visibility: 'owner',
        });
      });
      return { ...next, inventory: current.inventory };
    },
  );
};
