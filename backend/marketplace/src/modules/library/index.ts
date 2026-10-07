/**
 * Module « library » : acquérir un pack, ma bibliothèque, installer dans une campagne
 * (docs/marketplace.md § 4.2, 4.3 et 5.3).
 *
 *   POST /v1/marketplace/listings/:id/acquire            pack gratuit (ou copie du créateur)
 *   POST /v1/marketplace/listings/:id/checkout           pack payant : session Stripe (billing)
 *   GET  /v1/marketplace/library                         mes packs, dernière version, installations
 *   GET  /v1/marketplace/library/:id/content             contenu de la dernière version publiée
 *   POST /v1/marketplace/library/:id/installs            { campaignId } : début d'installation (MJ)
 *   POST /v1/marketplace/installs/:id/complete           { created } : installation terminée
 *
 * Un achat n'accorde rien ici : billing publie la vente payée sur le bus, le consommateur
 * (src/consumer) crée l'acquisition.
 */
import {
  InstallCreated,
  InstallStart,
  InstallSummary,
  LibraryItem,
  MARKETPLACE_EVENTS,
  PackContent,
  uuidv7,
  type ListingCard,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import {
  acquisitions,
  installs,
  listings,
  listingVersions,
  type InstallRow,
  type ListingRow,
  type VersionRow,
} from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { readContent } from '../../domain/content.js';
import { listingById, owns, versionById } from '../../domain/listings.js';
import { cardView, creatorSummaries, publicVersionView } from '../../domain/views.js';
import {
  eventContext,
  gmActor,
  IdParams,
  notFound,
  perMinute,
  sessionUser,
  currentUser,
  userActor,
  Uuid,
} from '../common.js';
import { paidListingsOff, requireStorage } from '../studio/index.js';

const ReturnUrl = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'Chemin relatif attendu (/…)');

const listingAggregate = (id: string) => ({ type: 'marketplace_listing', id });

const removed = () =>
  new HttpError(409, 'Pack retiré', 'listing_removed', 'Ce pack a été retiré par la modération');

function installView(i: InstallRow, versionNumber: string): InstallSummary {
  return {
    id: i.id,
    campaignId: i.campaignId,
    versionId: i.versionId,
    versionNumber,
    status: i.status,
    completedAt: i.completedAt?.toISOString() ?? null,
  };
}

/** Dernière version publiée d'une fiche. */
async function latestPublished(deps: Pick<Deps, 'db'>, listing: ListingRow) {
  if (!listing.currentVersionId) return undefined;
  const v = await versionById(deps.db, listing.currentVersionId);
  return v?.status === 'published' ? v : undefined;
}

/** L'appelant peut utiliser ce pack : acquis (non révoqué) ou à lui. */
async function canUse(deps: Pick<Deps, 'db'>, listing: ListingRow, userId: string) {
  return listing.creatorId === userId || owns(deps.db, userId, listing.id);
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/marketplace/listings/:id/acquire',
    {
      ...auth,
      config: perMinute(20),
      schema: { params: IdParams, response: { 200: z.object({ owned: z.literal(true) }) } },
    },
    async (req) => {
      const userId = sessionUser(req);
      await db.transaction(async (tx) => {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, req.params.id))
          .for('update');
        const mine = listing?.creatorId === userId;
        if (!listing || (listing.status !== 'published' && !mine)) throw notFound();
        if (listing.status === 'removed') throw removed();
        if (listing.priceCents > 0 && !mine)
          throw new HttpError(402, 'Pack payant', 'payment_required', 'Ce pack s’achète');
        const [current] = await tx
          .select()
          .from(acquisitions)
          .where(and(eq(acquisitions.userId, userId), eq(acquisitions.listingId, listing.id)))
          .for('update');
        if (current && !current.revokedAt) return;
        const source = mine ? ('gift' as const) : ('free' as const);
        await tx
          .insert(acquisitions)
          .values({ userId, listingId: listing.id, source })
          .onConflictDoUpdate({
            target: [acquisitions.userId, acquisitions.listingId],
            set: {
              source,
              saleId: null,
              acquiredAt: sql`now()`,
              revokedAt: null,
              revokeReason: null,
            },
          });
        if (!mine)
          await tx
            .update(listings)
            .set({ acquisitionsCount: sql`${listings.acquisitionsCount} + 1` })
            .where(eq(listings.id, listing.id));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.listingAcquired,
          actor: userActor(userId),
          aggregate: listingAggregate(listing.id),
          payload: { listingId: listing.id, source },
        });
      });
      return { owned: true as const };
    },
  );

  r.post(
    '/v1/marketplace/listings/:id/checkout',
    {
      ...auth,
      config: perMinute(10),
      schema: {
        params: IdParams,
        body: z.strictObject({ returnUrl: ReturnUrl }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const userId = sessionUser(req);
      const listing = await listingById(db, req.params.id);
      if (!listing || listing.status !== 'published') throw notFound();
      if (listing.priceCents <= 0)
        throw HttpError.badRequest('Ce pack est gratuit', 'listing_free');
      if (config.MARKETPLACE_PAID_LISTINGS !== 'on') throw paidListingsOff();
      if (listing.creatorId === userId) throw HttpError.conflict('C’est votre pack', 'own_listing');
      if (await owns(db, userId, listing.id))
        throw HttpError.conflict('Vous possédez déjà ce pack', 'already_owned');
      const session = await deps.billing.checkout({
        buyerId: userId,
        sellerId: listing.creatorId,
        listingId: listing.id,
        title: listing.title,
        priceCents: listing.priceCents,
        currency: 'eur',
        returnUrl: req.body.returnUrl,
      });
      await db.transaction(async (tx) =>
        appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.checkoutStarted,
          actor: userActor(userId),
          aggregate: listingAggregate(listing.id),
          payload: { listingId: listing.id, priceCents: listing.priceCents },
        }),
      );
      return session;
    },
  );

  r.get(
    '/v1/marketplace/library',
    { ...auth, schema: { response: { 200: z.object({ items: z.array(LibraryItem) }) } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const rows = await db
        .select({ acquisition: acquisitions, listing: listings })
        .from(acquisitions)
        .innerJoin(listings, eq(listings.id, acquisitions.listingId))
        .where(and(eq(acquisitions.userId, userId), isNull(acquisitions.revokedAt)))
        .orderBy(desc(acquisitions.acquiredAt));
      const ids = rows.map((r) => r.listing.id);
      const versionIds = rows.flatMap((r) =>
        r.listing.currentVersionId ? [r.listing.currentVersionId] : [],
      );
      const [creators, versions, mine] = await Promise.all([
        creatorSummaries(
          db,
          rows.map((r) => r.listing.creatorId),
        ),
        versionIds.length
          ? db.select().from(listingVersions).where(inArray(listingVersions.id, versionIds))
          : Promise.resolve([] as VersionRow[]),
        ids.length
          ? db
              .select({ install: installs, number: listingVersions.number })
              .from(installs)
              .innerJoin(listingVersions, eq(listingVersions.id, installs.versionId))
              .where(and(eq(installs.userId, userId), inArray(installs.listingId, ids)))
              .orderBy(desc(installs.startedAt))
          : Promise.resolve([]),
      ]);
      const versionOf = new Map(versions.map((v) => [v.id, v]));
      reply.header('cache-control', 'no-store');
      return {
        items: rows.map(({ acquisition, listing }) => {
          const latest = listing.currentVersionId
            ? versionOf.get(listing.currentVersionId)
            : undefined;
          const card: ListingCard = cardView(listing, creators.get(listing.creatorId), true);
          return {
            listing: card,
            source: acquisition.source,
            acquiredAt: acquisition.acquiredAt.toISOString(),
            available: listing.status !== 'removed' && Boolean(latest),
            latestVersion: latest?.status === 'published' ? publicVersionView(latest) : null,
            installs: lastInstallPerCampaign(
              mine.filter((m) => m.install.listingId === listing.id),
            ),
          };
        }),
      };
    },
  );

  r.get(
    '/v1/marketplace/library/:id/content',
    { ...auth, schema: { params: IdParams, response: { 200: PackContent } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const listing = await listingById(db, req.params.id);
      if (!listing || !(await canUse(deps, listing, userId))) throw notFound();
      if (listing.status === 'removed') throw removed();
      const version = await latestPublished(deps, listing);
      if (!version?.contentKey || !version.contentSha256) throw notFound('Aucune version publiée');
      reply.header('cache-control', 'no-store');
      return readContent(requireStorage(deps), version.contentKey, version.contentSha256);
    },
  );

  r.post(
    '/v1/marketplace/library/:id/installs',
    {
      ...auth,
      config: perMinute(20),
      schema: {
        params: IdParams,
        body: z.strictObject({ campaignId: Uuid('Identifiant de campagne invalide') }),
        response: { 201: InstallStart },
      },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const { campaignId } = req.body;
      const listing = await listingById(db, req.params.id);
      if (!listing || !(await canUse(deps, listing, userId))) throw notFound();
      if (listing.status === 'removed') throw removed();
      const version = await latestPublished(deps, listing);
      if (!version?.contentKey || !version.contentSha256) throw notFound('Aucune version publiée');
      const role = await deps.campaigns.role(campaignId, userId);
      if (!role)
        throw new HttpError(
          404,
          'Ressource introuvable',
          'campaign_not_found',
          'Campagne introuvable',
        );
      if (role !== 'gm') throw HttpError.forbidden('Seul le MJ installe un pack dans sa campagne');
      const content = await readContent(
        requireStorage(deps),
        version.contentKey,
        version.contentSha256,
      );

      const install = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(installs)
          .values({
            id: uuidv7(),
            userId,
            listingId: listing.id,
            versionId: version.id,
            campaignId,
          })
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.installStarted,
          actor: gmActor(userId),
          aggregate: { type: 'marketplace_install', id: row!.id },
          campaignId,
          payload: { installId: row!.id, listingId: listing.id, versionId: version.id },
        });
        return row!;
      });
      reply.code(201);
      return {
        install: installView(install, version.number),
        listingTitle: listing.title,
        content,
      };
    },
  );

  r.post(
    '/v1/marketplace/installs/:id/complete',
    {
      ...auth,
      schema: {
        params: IdParams,
        body: z.strictObject({ created: InstallCreated }),
        response: { 200: InstallSummary },
      },
    },
    async (req) => {
      const userId = sessionUser(req);
      const { install, number } = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(installs)
          .where(and(eq(installs.id, req.params.id), eq(installs.userId, userId)))
          .for('update');
        if (!current) throw new HttpError(404, 'Ressource introuvable', 'install_not_found');
        const [version] = await tx
          .select({ number: listingVersions.number })
          .from(listingVersions)
          .where(eq(listingVersions.id, current.versionId));
        // Rejoué (double clic, reprise) : déjà terminée, rien à refaire
        if (current.status === 'done') return { install: current, number: version!.number };
        const [done] = await tx
          .update(installs)
          .set({ status: 'done', created: req.body.created, completedAt: sql`now()` })
          .where(eq(installs.id, current.id))
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.packInstalled,
          actor: gmActor(userId),
          aggregate: { type: 'marketplace_install', id: current.id },
          campaignId: current.campaignId,
          payload: {
            installId: current.id,
            listingId: current.listingId,
            versionId: current.versionId,
            created: req.body.created,
          },
        });
        return { install: done!, number: version!.number };
      });
      return installView(install, number);
    },
  );
};

/** Dernière installation par campagne (la plus récente d'abord). */
function lastInstallPerCampaign(rows: { install: InstallRow; number: string }[]): InstallSummary[] {
  const seen = new Set<string>();
  const out: InstallSummary[] = [];
  for (const { install, number } of rows) {
    if (seen.has(install.campaignId)) continue;
    seen.add(install.campaignId);
    out.push(installView(install, number));
  }
  return out;
}
