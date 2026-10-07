/**
 * Module « moderation » : revue avant publication, contrôle a posteriori, signalements, retraits
 * (docs/marketplace.md § 7). Réservé aux comptes de MARKETPLACE_MODERATORS.
 *
 *   GET  /v1/marketplace/moderation/queue                         versions en revue, fiches à revoir, signalements
 *   GET  /v1/marketplace/moderation/versions/:id/content          contenu d'une version
 *   POST /v1/marketplace/moderation/versions/:id/approve          publier
 *   POST /v1/marketplace/moderation/versions/:id/reject           { reason, note } refuser
 *   POST /v1/marketplace/moderation/listings/:id/remove           { reason, note? } retirer (droits : fichiers purgés)
 *   POST /v1/marketplace/moderation/listings/:id/recheck          fiche modifiée vue, rien à redire
 *   POST /v1/marketplace/moderation/reports/:id/dismiss           signalement classé sans suite
 *   POST /v1/marketplace/moderation/reviews/:listingId/:userId/delete   avis abusif retiré
 */
import {
  MARKETPLACE_EVENTS,
  ModerationQueue,
  ModerationReason,
  PackContent,
  StudioVersion,
  type ReportReason,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { listings, listingVersions, reports, reviews } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { readContent } from '../../domain/content.js';
import { listingById, versionById } from '../../domain/listings.js';
import { studioListingView, studioVersionView } from '../../domain/views.js';
import { listingFolder } from '../../storage/storage.js';
import { eventContext, IdParams, notFound, requireModerator, userActor, Uuid } from '../common.js';
import { requireStorage } from '../studio/index.js';

const RejectBody = z.strictObject({
  reason: ModerationReason,
  note: z.string().trim().min(1, 'Expliquez le refus au créateur').max(1000),
});
const RemoveBody = z.strictObject({
  reason: ModerationReason,
  note: z.string().trim().max(1000).optional(),
});

const listingAggregate = (id: string) => ({ type: 'marketplace_listing', id });
const versionAggregate = (id: string) => ({ type: 'marketplace_version', id });

const notInReview = () =>
  HttpError.conflict('Cette version n’est pas en revue', 'version_not_in_review');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/marketplace/moderation/queue',
    { ...auth, schema: { response: { 200: ModerationQueue } } },
    async (req, reply) => {
      requireModerator(deps, req);
      const [pending, recheck, open] = await Promise.all([
        db
          .select({ version: listingVersions, listing: listings })
          .from(listingVersions)
          .innerJoin(listings, eq(listings.id, listingVersions.listingId))
          .where(eq(listingVersions.status, 'in_review'))
          .orderBy(asc(listingVersions.submittedAt))
          .limit(100),
        db
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.needsRecheck, true),
              inArray(listings.status, ['published', 'unlisted']),
            ),
          )
          .orderBy(asc(listings.updatedAt))
          .limit(100),
        db
          .select()
          .from(reports)
          .where(eq(reports.status, 'open'))
          .orderBy(asc(reports.createdAt))
          .limit(500),
      ]);
      const reported = [...new Set(open.map((x) => x.listingId))];
      const reportedListings = reported.length
        ? await db.select().from(listings).where(inArray(listings.id, reported))
        : [];
      reply.header('cache-control', 'no-store');
      return {
        versions: pending.map((p) => ({
          listing: studioListingView(p.listing),
          version: studioVersionView(p.version),
        })),
        recheck: recheck.map(studioListingView),
        reports: reportedListings.map((l) => ({
          listing: studioListingView(l),
          reports: open
            .filter((x) => x.listingId === l.id)
            .map((x) => ({
              id: x.id,
              listingId: x.listingId,
              reason: x.reason as ReportReason,
              details: x.details,
              status: x.status,
              createdAt: x.createdAt.toISOString(),
            })),
        })),
      };
    },
  );

  r.get(
    '/v1/marketplace/moderation/versions/:id/content',
    { ...auth, schema: { params: IdParams, response: { 200: PackContent } } },
    async (req, reply) => {
      requireModerator(deps, req);
      const version = await versionById(db, req.params.id);
      if (!version?.contentKey || !version.contentSha256) throw notFound('Version introuvable');
      reply.header('cache-control', 'no-store');
      return readContent(requireStorage(deps), version.contentKey, version.contentSha256);
    },
  );

  r.post(
    '/v1/marketplace/moderation/versions/:id/approve',
    { ...auth, schema: { params: IdParams, response: { 200: StudioVersion } } },
    async (req) => {
      const moderator = requireModerator(deps, req);
      const row = await db.transaction(async (tx) => {
        const [version] = await tx
          .select()
          .from(listingVersions)
          .where(eq(listingVersions.id, req.params.id))
          .for('update');
        if (!version) throw notFound('Version introuvable');
        if (version.status !== 'in_review') throw notInReview();
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, version.listingId))
          .for('update');
        if (!listing || listing.status === 'removed')
          throw HttpError.conflict('Ce pack a été retiré', 'listing_removed');
        const [published] = await tx
          .update(listingVersions)
          .set({
            status: 'published',
            reviewedAt: sql`now()`,
            reviewedBy: moderator,
            publishedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(listingVersions.id, version.id))
          .returning();
        const first = listing.status === 'draft';
        const counts = version.counts!;
        await tx
          .update(listings)
          .set({
            currentVersionId: version.id,
            kinds: [
              ...(counts.scenes ? ['scenes'] : []),
              ...(counts.npcTemplates ? ['npcs'] : []),
              ...(counts.objectTemplates ? ['objects'] : []),
            ],
            ...(version.systemId ? { systemId: version.systemId } : {}),
            ...(first ? { status: 'published' as const, publishedAt: sql`now()` } : {}),
            // La revue a vu la fiche telle qu'elle est
            needsRecheck: false,
            updatedAt: sql`now()`,
            version: sql`${listings.version} + 1`,
          })
          .where(eq(listings.id, listing.id));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionPublished,
          actor: userActor(moderator),
          aggregate: versionAggregate(version.id),
          payload: {
            listingId: listing.id,
            versionId: version.id,
            number: version.number,
            first,
          },
        });
        return published!;
      });
      return studioVersionView(row);
    },
  );

  r.post(
    '/v1/marketplace/moderation/versions/:id/reject',
    { ...auth, schema: { params: IdParams, body: RejectBody, response: { 200: StudioVersion } } },
    async (req) => {
      const moderator = requireModerator(deps, req);
      const row = await db.transaction(async (tx) => {
        const [version] = await tx
          .select()
          .from(listingVersions)
          .where(eq(listingVersions.id, req.params.id))
          .for('update');
        if (!version) throw notFound('Version introuvable');
        if (version.status !== 'in_review') throw notInReview();
        const [rejected] = await tx
          .update(listingVersions)
          .set({
            status: 'rejected',
            reviewedAt: sql`now()`,
            reviewedBy: moderator,
            reviewReason: req.body.reason,
            reviewNote: req.body.note,
            updatedAt: sql`now()`,
          })
          .where(eq(listingVersions.id, version.id))
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionRejected,
          actor: userActor(moderator),
          aggregate: versionAggregate(version.id),
          // La note, texte libre, reste sur la version : jamais dans le journal
          payload: { listingId: version.listingId, versionId: version.id, reason: req.body.reason },
        });
        return rejected!;
      });
      return studioVersionView(row);
    },
  );

  r.post(
    '/v1/marketplace/moderation/listings/:id/remove',
    {
      ...auth,
      schema: {
        params: IdParams,
        body: RemoveBody,
        response: { 200: z.object({ purged: z.number().int() }) },
      },
    },
    async (req) => {
      const moderator = requireModerator(deps, req);
      const { reason, note } = req.body;
      // Droits d'un tiers (notification d'un ayant droit) : les fichiers partent aussi
      const purge = reason === 'rights';
      if (purge) requireStorage(deps);
      const listingId = await db.transaction(async (tx) => {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, req.params.id))
          .for('update');
        if (!listing) throw notFound();
        if (listing.status === 'removed')
          throw HttpError.conflict('Ce pack est déjà retiré', 'listing_removed');
        await tx
          .update(listings)
          .set({
            status: 'removed',
            removedAt: sql`now()`,
            removedReason: reason,
            needsRecheck: false,
            updatedAt: sql`now()`,
            version: sql`${listings.version} + 1`,
          })
          .where(eq(listings.id, listing.id));
        // Versions en cours : refusées pour le même motif
        await tx
          .update(listingVersions)
          .set({
            status: 'rejected',
            submittedAt: sql`coalesce(${listingVersions.submittedAt}, now())`,
            rightsAttestedAt: sql`coalesce(${listingVersions.rightsAttestedAt}, now())`,
            reviewedAt: sql`now()`,
            reviewedBy: moderator,
            reviewReason: reason,
            reviewNote: note ?? null,
            updatedAt: sql`now()`,
          })
          .where(
            and(eq(listingVersions.listingId, listing.id), eq(listingVersions.status, 'in_review')),
          );
        await tx
          .update(reports)
          .set({
            status: 'resolved',
            outcome: 'removed',
            resolvedAt: sql`now()`,
            resolvedBy: moderator,
          })
          .where(and(eq(reports.listingId, listing.id), eq(reports.status, 'open')));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.listingRemoved,
          actor: userActor(moderator),
          aggregate: listingAggregate(listing.id),
          payload: { listingId: listing.id, reason, purge },
        });
        return listing.id;
      });
      const purged = purge ? await deps.storage!.removePrefix(listingFolder(listingId)) : 0;
      req.log.info({ listingId, reason, purged }, 'pack retiré par la modération');
      return { purged };
    },
  );

  r.post(
    '/v1/marketplace/moderation/listings/:id/recheck',
    { ...auth, schema: { params: IdParams } },
    async (req, reply) => {
      const moderator = requireModerator(deps, req);
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(listings)
          .set({ needsRecheck: false })
          .where(and(eq(listings.id, req.params.id), eq(listings.needsRecheck, true)))
          .returning({ id: listings.id });
        if (!updated) throw notFound('Rien à revoir sur ce pack');
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.listingRechecked,
          actor: userActor(moderator),
          aggregate: listingAggregate(updated.id),
          payload: { listingId: updated.id },
        });
      });
      return reply.code(204).send();
    },
  );

  r.post(
    '/v1/marketplace/moderation/reports/:id/dismiss',
    { ...auth, schema: { params: IdParams } },
    async (req, reply) => {
      const moderator = requireModerator(deps, req);
      await db.transaction(async (tx) => {
        const [report] = await tx
          .update(reports)
          .set({
            status: 'dismissed',
            outcome: 'kept',
            resolvedAt: sql`now()`,
            resolvedBy: moderator,
          })
          .where(and(eq(reports.id, req.params.id), eq(reports.status, 'open')))
          .returning();
        if (!report) throw new HttpError(404, 'Ressource introuvable', 'report_not_found');
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.reportResolved,
          actor: userActor(moderator),
          aggregate: listingAggregate(report.listingId),
          payload: { listingId: report.listingId, reportId: report.id, outcome: 'kept' },
        });
      });
      return reply.code(204).send();
    },
  );

  r.post(
    '/v1/marketplace/moderation/reviews/:listingId/:userId/delete',
    {
      ...auth,
      schema: { params: z.object({ listingId: Uuid(), userId: Uuid() }) },
    },
    async (req, reply) => {
      const moderator = requireModerator(deps, req);
      const { listingId, userId } = req.params;
      if (!(await listingById(db, listingId))) throw notFound();
      await db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(reviews)
          .where(and(eq(reviews.listingId, listingId), eq(reviews.userId, userId)))
          .returning();
        if (!removed) throw new HttpError(404, 'Ressource introuvable', 'review_not_found');
        await tx
          .update(listings)
          .set({
            ratingCount: sql`${listings.ratingCount} - 1`,
            ratingSum: sql`${listings.ratingSum} - ${removed.rating}`,
          })
          .where(eq(listings.id, listingId));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.reviewDeleted,
          actor: userActor(moderator),
          aggregate: listingAggregate(listingId),
          payload: { listingId, by: 'moderator' },
        });
      });
      return reply.code(204).send();
    },
  );
};
