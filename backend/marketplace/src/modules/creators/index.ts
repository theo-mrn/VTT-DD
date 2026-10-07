/**
 * Module « creators » : réglages publics de la marketplace, l'appelant, son profil de créateur
 * et la page publique d'un créateur (docs/marketplace.md § 4.1).
 *
 *   GET /v1/marketplace/config           vente activée, commission, bornes de prix
 *   GET /v1/marketplace/me               profil de créateur (ou null), modérateur
 *   PUT /v1/marketplace/me/creator       { displayName, bio, version? } : crée ou modifie
 *   GET /v1/marketplace/creators/:slug   créateur et ses fiches publiées
 */
import {
  CreatorProfile,
  ListingCard,
  MARKETPLACE_CURRENCY,
  MARKETPLACE_EVENTS,
  MARKETPLACE_FEE,
  MARKETPLACE_PRICE,
  MarketplaceConfig,
  MarketplaceMe,
  Slug,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { creators, listings } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { refreshSearch } from '../../domain/listings.js';
import { retryOnSlugConflict } from '../../domain/retry.js';
import { uniqueSlug } from '../../domain/slugs.js';
import { cardView, creatorView } from '../../domain/views.js';
import { ownedAmong } from '../catalog/queries.js';
import {
  currentUser,
  eventContext,
  isModerator,
  perMinute,
  sessionUser,
  userActor,
  versionConflict,
} from '../common.js';

const CreatorBody = z.strictObject({
  displayName: z.string().trim().min(2, '2 caractères au moins').max(40, '40 caractères au plus'),
  bio: z.string().trim().max(1000, '1 000 caractères au plus').default(''),
  version: z.number().int().positive().optional(),
});

const CreatorPage = z.object({
  creator: CreatorProfile.omit({ payoutsReady: true, version: true }),
  listings: z.array(ListingCard),
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/marketplace/config',
    { ...auth, schema: { response: { 200: MarketplaceConfig } } },
    async () => ({
      paidListings: config.MARKETPLACE_PAID_LISTINGS === 'on',
      fee: { ...MARKETPLACE_FEE },
      price: { ...MARKETPLACE_PRICE },
      currency: MARKETPLACE_CURRENCY,
    }),
  );

  r.get(
    '/v1/marketplace/me',
    { ...auth, schema: { response: { 200: MarketplaceMe } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const [creator] = await db.select().from(creators).where(eq(creators.userId, userId));
      reply.header('cache-control', 'no-store');
      return {
        creator: creator ? creatorView(creator) : null,
        moderator: isModerator(deps, userId),
      };
    },
  );

  r.put(
    '/v1/marketplace/me/creator',
    {
      ...auth,
      config: perMinute(10),
      schema: { body: CreatorBody, response: { 200: CreatorProfile } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const { displayName, bio, version } = req.body;
      const row = await retryOnSlugConflict(() =>
        db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(creators)
            .where(eq(creators.userId, userId))
            .for('update');
          if (!current) {
            const [created] = await tx
              .insert(creators)
              .values({
                userId,
                slug: await uniqueSlug(tx, 'creators', displayName),
                displayName,
                bio,
              })
              .returning();
            await appendEvent(tx, eventContext(req), {
              type: MARKETPLACE_EVENTS.creatorRegistered,
              actor: userActor(userId),
              aggregate: { type: 'marketplace_creator', id: userId },
              payload: { version: created!.version },
            });
            return created!;
          }
          if (version !== undefined && version !== current.version) throw versionConflict();
          const [updated] = await tx
            .update(creators)
            .set({ displayName, bio, updatedAt: sql`now()`, version: sql`${creators.version} + 1` })
            .where(eq(creators.userId, userId))
            .returning();
          if (current.displayName !== displayName) {
            // Le nom du créateur fait partie du texte de recherche de ses fiches
            const own = await tx.select().from(listings).where(eq(listings.creatorId, userId));
            for (const l of own) await refreshSearch(tx, l);
          }
          await appendEvent(tx, eventContext(req), {
            type: MARKETPLACE_EVENTS.creatorUpdated,
            actor: userActor(userId),
            aggregate: { type: 'marketplace_creator', id: userId },
            payload: {
              version: updated!.version,
              fields: [
                ...(current.displayName !== displayName ? ['displayName'] : []),
                ...(current.bio !== bio ? ['bio'] : []),
              ],
            },
          });
          return updated!;
        }),
      );
      return creatorView(row);
    },
  );

  r.get(
    '/v1/marketplace/creators/:slug',
    { ...auth, schema: { params: z.object({ slug: Slug }), response: { 200: CreatorPage } } },
    async (req) => {
      const userId = currentUser(req);
      const [creator] = await db.select().from(creators).where(eq(creators.slug, req.params.slug));
      if (!creator) throw new HttpError(404, 'Ressource introuvable', 'creator_not_found');
      const rows = await db
        .select()
        .from(listings)
        .where(and(eq(listings.creatorId, creator.userId), eq(listings.status, 'published')))
        .orderBy(desc(listings.publishedAt));
      const owned = await ownedAmong(
        db,
        userId,
        rows.map((l) => l.id),
      );
      const summary = {
        userId: creator.userId,
        slug: creator.slug,
        displayName: creator.displayName,
      };
      const { payoutsReady: _p, version: _v, ...pub } = creatorView(creator);
      return {
        creator: pub,
        listings: rows.map((l) => cardView(l, summary, owned.has(l.id))),
      };
    },
  );
};
