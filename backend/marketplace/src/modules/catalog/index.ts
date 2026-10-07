/**
 * Module « catalog » : vitrine et fiche d'un pack (docs/marketplace.md § 4.2).
 *
 *   GET /v1/marketplace/listings?q&system&kind&price&safe&sort&page   catalogue (20 par page)
 *   GET /v1/marketplace/listings/:id                                  fiche (adresse ou id)
 *   GET /v1/marketplace/listings/:id/reviews?page                     avis, les plus récents d'abord
 *
 * Une fiche publiée est lisible par tous ; retirée par son créateur ou par la modération, elle
 * ne l'est plus que de son créateur, de ses acquéreurs et des modérateurs ; un brouillon, de son
 * créateur et des modérateurs. Sinon : 404, sans dire qu'elle existe.
 */
import {
  CatalogPage,
  CatalogSort,
  ListingDetail,
  ListingKind,
  ReviewPage,
  type License,
} from '@vtt/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listingVersions, reviews } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { listingBySlugOrId, owns } from '../../domain/listings.js';
import { cardView, creatorSummaries, publicVersionView, reviewView } from '../../domain/views.js';
import { currentUser, IdParams, isModerator, notFound } from '../common.js';
import { ownedAmong, PER_PAGE, searchCatalog } from './queries.js';

const CatalogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  system: z.string().min(1).max(200).optional(),
  kind: ListingKind.optional(),
  price: z.enum(['free', 'paid']).optional(),
  safe: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
  sort: CatalogSort.default('popular'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

const REVIEWS_PER_PAGE = 20;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/marketplace/listings',
    { ...auth, schema: { querystring: CatalogQuery, response: { 200: CatalogPage } } },
    async (req) => {
      const userId = currentUser(req);
      const { rows, total } = await searchCatalog(db, req.query);
      const [owned, creators] = await Promise.all([
        ownedAmong(
          db,
          userId,
          rows.map((l) => l.id),
        ),
        creatorSummaries(
          db,
          rows.map((l) => l.creatorId),
        ),
      ]);
      return {
        items: rows.map((l) => cardView(l, creators.get(l.creatorId), owned.has(l.id))),
        page: req.query.page,
        perPage: PER_PAGE,
        total,
      };
    },
  );

  r.get(
    '/v1/marketplace/listings/:id',
    {
      ...auth,
      schema: {
        params: z.object({ id: z.string().min(1).max(80) }),
        response: { 200: ListingDetail },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const listing = await listingBySlugOrId(db, req.params.id);
      if (!listing) throw notFound();
      const mine = listing.creatorId === userId;
      const owned = await owns(db, userId, listing.id);
      const moderator = isModerator(deps, userId);
      const visible =
        listing.status === 'published' ||
        mine ||
        moderator ||
        (owned && listing.status !== 'draft');
      if (!visible) throw notFound();

      const [versions, creators, [mineReview]] = await Promise.all([
        db
          .select()
          .from(listingVersions)
          .where(
            and(eq(listingVersions.listingId, listing.id), eq(listingVersions.status, 'published')),
          )
          .orderBy(desc(listingVersions.publishedAt)),
        creatorSummaries(db, [listing.creatorId]),
        db
          .select()
          .from(reviews)
          .where(and(eq(reviews.listingId, listing.id), eq(reviews.userId, userId))),
      ]);
      reply.header('cache-control', 'no-store');
      return {
        ...cardView(listing, creators.get(listing.creatorId), owned),
        description: listing.description,
        license: listing.license as License,
        attribution: listing.attribution,
        tags: listing.tags,
        gallery: listing.gallery,
        status: listing.status,
        versions: versions.map(publicVersionView),
        myReview: mineReview ? reviewView(mineReview) : null,
        mine,
      };
    },
  );

  r.get(
    '/v1/marketplace/listings/:id/reviews',
    {
      ...auth,
      schema: {
        params: IdParams,
        querystring: z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }),
        response: { 200: ReviewPage },
      },
    },
    async (req) => {
      const { id } = req.params;
      const { page } = req.query;
      const [rows, [count]] = await Promise.all([
        db
          .select()
          .from(reviews)
          .where(eq(reviews.listingId, id))
          .orderBy(desc(reviews.updatedAt), desc(reviews.userId))
          .limit(REVIEWS_PER_PAGE)
          .offset((page - 1) * REVIEWS_PER_PAGE),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(reviews)
          .where(eq(reviews.listingId, id)),
      ]);
      return {
        items: rows.map(reviewView),
        page,
        perPage: REVIEWS_PER_PAGE,
        total: count?.total ?? 0,
      };
    },
  );
};
