/**
 * Module « community » : avis et signalements (docs/marketplace.md § 4.2 et 7).
 *
 *   PUT    /v1/marketplace/listings/:id/review    { rating, comment } : mon avis (acquéreur)
 *   DELETE /v1/marketplace/listings/:id/review    le retirer
 *   POST   /v1/marketplace/listings/:id/reports   { reason, details } : signaler une fiche
 *
 * Avis vérifiés : seulement d'un acquéreur, jamais sur sa propre fiche, un par compte. Les
 * compteurs de la fiche (nombre, somme) suivent dans la même transaction.
 */
import { MARKETPLACE_EVENTS, ReportReason, Review, uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { listings, reports, reviews } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { listingById, owns } from '../../domain/listings.js';
import { isUniqueViolation } from '../../domain/retry.js';
import { reviewView } from '../../domain/views.js';
import {
  eventContext,
  IdParams,
  notFound,
  perHour,
  perMinute,
  sessionUser,
  userActor,
} from '../common.js';

const ReviewBody = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000, '1 000 caractères au plus').default(''),
});

const ReportBody = z.strictObject({
  reason: ReportReason,
  details: z.string().trim().max(1000, '1 000 caractères au plus').default(''),
});

const listingAggregate = (id: string) => ({ type: 'marketplace_listing', id });

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.put(
    '/v1/marketplace/listings/:id/review',
    {
      ...auth,
      config: perMinute(10),
      schema: { params: IdParams, body: ReviewBody, response: { 200: Review } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const { rating, comment } = req.body;
      const listing = await listingById(db, req.params.id);
      if (!listing || listing.status === 'draft') throw notFound();
      if (listing.creatorId === userId) throw HttpError.forbidden('On ne note pas son propre pack');
      if (!(await owns(db, userId, listing.id)))
        throw new HttpError(
          403,
          'Accès refusé',
          'not_owned',
          'Seuls les acquéreurs donnent leur avis',
        );
      const row = await db.transaction(async (tx) => {
        const [previous] = await tx
          .select()
          .from(reviews)
          .where(and(eq(reviews.listingId, listing.id), eq(reviews.userId, userId)))
          .for('update');
        const [saved] = await tx
          .insert(reviews)
          .values({ listingId: listing.id, userId, rating, comment })
          .onConflictDoUpdate({
            target: [reviews.listingId, reviews.userId],
            set: { rating, comment, updatedAt: sql`now()` },
          })
          .returning();
        await tx
          .update(listings)
          .set({
            ratingCount: sql`${listings.ratingCount} + ${previous ? 0 : 1}`,
            ratingSum: sql`${listings.ratingSum} + ${rating - (previous?.rating ?? 0)}`,
          })
          .where(eq(listings.id, listing.id));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.reviewPosted,
          actor: userActor(userId),
          aggregate: listingAggregate(listing.id),
          payload: { listingId: listing.id, rating, edited: Boolean(previous) },
        });
        return saved!;
      });
      return reviewView(row);
    },
  );

  r.delete(
    '/v1/marketplace/listings/:id/review',
    { ...auth, schema: { params: IdParams } },
    async (req, reply) => {
      const userId = sessionUser(req);
      await db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(reviews)
          .where(and(eq(reviews.listingId, req.params.id), eq(reviews.userId, userId)))
          .returning();
        if (!removed) throw new HttpError(404, 'Ressource introuvable', 'review_not_found');
        await tx
          .update(listings)
          .set({
            ratingCount: sql`${listings.ratingCount} - 1`,
            ratingSum: sql`${listings.ratingSum} - ${removed.rating}`,
          })
          .where(eq(listings.id, removed.listingId));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.reviewDeleted,
          actor: userActor(userId),
          aggregate: listingAggregate(removed.listingId),
          payload: { listingId: removed.listingId, by: 'author' },
        });
      });
      return reply.code(204).send();
    },
  );

  r.post(
    '/v1/marketplace/listings/:id/reports',
    {
      ...auth,
      config: perHour(5),
      schema: {
        params: IdParams,
        body: ReportBody,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const listing = await listingById(db, req.params.id);
      if (!listing || listing.status === 'draft') throw notFound();
      if (listing.creatorId === userId)
        throw HttpError.badRequest('On ne signale pas son propre pack', 'own_listing');
      const id = uuidv7();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(reports).values({
            id,
            listingId: listing.id,
            reporterId: userId,
            reason: req.body.reason,
            details: req.body.details,
          });
          await appendEvent(tx, eventContext(req), {
            type: MARKETPLACE_EVENTS.listingReported,
            actor: userActor(userId),
            aggregate: listingAggregate(listing.id),
            // Les détails, texte libre, restent dans la table : jamais dans le journal
            payload: { listingId: listing.id, reportId: id, reason: req.body.reason },
          });
        });
      } catch (e) {
        if (isUniqueViolation(e, 'reports_open'))
          throw HttpError.conflict('Vous avez déjà signalé ce pack', 'already_reported');
        throw e;
      }
      reply.code(201);
      return { id };
    },
  );
};
