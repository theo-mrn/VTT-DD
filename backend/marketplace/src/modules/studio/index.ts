/**
 * Module « studio » : l'espace du créateur (docs/marketplace.md § 4.1).
 *
 *   GET    /v1/marketplace/studio/listings                 mes fiches, tous statuts, et leurs versions
 *   POST   /v1/marketplace/studio/listings                 nouvelle fiche (brouillon)
 *   GET    /v1/marketplace/studio/listings/:id             ma fiche
 *   PATCH  /v1/marketplace/studio/listings/:id             la modifier (publiée : « à revoir »)
 *   DELETE /v1/marketplace/studio/listings/:id             supprimer un brouillon jamais publié
 *   POST   /v1/marketplace/studio/listings/:id/unlist      retirer de la vente
 *   POST   /v1/marketplace/studio/listings/:id/relist      remettre en vente
 *   POST   /v1/marketplace/studio/listings/:id/uploads     billet d'envoi (couverture, galerie)
 *   POST   /v1/marketplace/studio/listings/:id/versions    nouvelle version (brouillon)
 *   PATCH  /v1/marketplace/studio/versions/:id             numéro, notes (brouillon)
 *   PUT    /v1/marketplace/studio/versions/:id/content     contenu du pack (brouillon)
 *   GET    /v1/marketplace/studio/versions/:id/content     le relire
 *   POST   /v1/marketplace/studio/versions/:id/submit      soumettre à la revue
 *   DELETE /v1/marketplace/studio/versions/:id             supprimer un brouillon de version
 */
import {
  compareVersions,
  CreateListing,
  FileUploadRequest,
  FileUploadTicket,
  isValidPrice,
  MARKETPLACE_EVENTS,
  packKinds,
  PackContent,
  StudioListing,
  StudioVersion,
  UpdateListing,
  uuidv7,
  VersionNumber,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent, type Tx } from '../../db/outbox.js';
import {
  acquisitions,
  creators,
  listings,
  listingVersions,
  type ListingRow,
  type VersionRow,
} from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { AssetsRejected, InvalidPack, readContent, storeContent } from '../../domain/content.js';
import { ownListing, ownVersion, refreshSearch, versionsOf } from '../../domain/listings.js';
import { retryOnSlugConflict } from '../../domain/retry.js';
import { uniqueSlug } from '../../domain/slugs.js';
import { studioListingView, studioVersionView } from '../../domain/views.js';
import { listingFolder } from '../../storage/storage.js';
import {
  eventContext,
  IdParams,
  perMinute,
  sendProblem,
  sessionUser,
  userActor,
  versionConflict,
} from '../common.js';

const VersionBody = z.strictObject({
  number: VersionNumber,
  notes: z.string().trim().max(2000, '2 000 caractères au plus').default(''),
});
const VersionPatch = z.strictObject({
  number: VersionNumber.optional(),
  notes: z.string().trim().max(2000, '2 000 caractères au plus').optional(),
});
const SubmitBody = z.strictObject({
  /** Le créateur atteste détenir les droits sur tout le contenu (docs/marketplace.md § 7). */
  rightsAttested: z.literal(true, 'Attestez détenir les droits sur ce contenu'),
});

/** Contenu JSON du pack : jusqu'à 8 Mo, plus l'enveloppe. */
const CONTENT_BODY_LIMIT = 10 * 1024 * 1024;

const listingAggregate = (id: string) => ({ type: 'marketplace_listing', id });
const versionAggregate = (id: string) => ({ type: 'marketplace_version', id });

const removedListing = () =>
  new HttpError(409, 'Pack retiré', 'listing_removed', 'Ce pack a été retiré par la modération');
const notDraft = () =>
  new HttpError(409, 'Version figée', 'version_not_draft', 'Seul un brouillon se modifie');

export function paidListingsOff(): HttpError {
  return new HttpError(
    422,
    'Vente indisponible',
    'paid_listings_disabled',
    'La vente de packs n’est pas encore ouverte : publiez-le gratuitement',
  );
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const auth = { preValidation: app.authenticate };
  const paidOn = config.MARKETPLACE_PAID_LISTINGS === 'on';

  /** Ma fiche et toutes ses versions. */
  async function full(listing: ListingRow): Promise<StudioListing> {
    const versions = await versionsOf(db, listing.id);
    return { ...studioListingView(listing), versions: versions.map(studioVersionView) };
  }

  /** Couverture et galerie : nos envois pour cette fiche seulement (ou rien). */
  function checkMedia(listingId: string, urls: (string | null | undefined)[]) {
    for (const url of urls)
      if (url && !deps.uploads.isOwnFile(url, 'marketplace', listingId))
        throw new HttpError(
          422,
          'Image refusée',
          'media_not_allowed',
          'Envoyez l’image depuis cette page',
        );
  }

  r.get(
    '/v1/marketplace/studio/listings',
    { ...auth, schema: { response: { 200: z.object({ items: z.array(StudioListing) }) } } },
    async (req, reply) => {
      const userId = sessionUser(req);
      const rows = await db
        .select()
        .from(listings)
        .where(eq(listings.creatorId, userId))
        .orderBy(desc(listings.updatedAt));
      const versions = rows.length
        ? await db
            .select()
            .from(listingVersions)
            .where(
              inArray(
                listingVersions.listingId,
                rows.map((l) => l.id),
              ),
            )
            .orderBy(desc(listingVersions.createdAt))
        : [];
      reply.header('cache-control', 'no-store');
      return {
        items: rows.map((l) => ({
          ...studioListingView(l),
          versions: versions.filter((v) => v.listingId === l.id).map(studioVersionView),
        })),
      };
    },
  );

  r.get(
    '/v1/marketplace/studio/listings/:id',
    { ...auth, schema: { params: IdParams, response: { 200: StudioListing } } },
    async (req, reply) => {
      reply.header('cache-control', 'no-store');
      return full(await ownListing(db, req.params.id, sessionUser(req)));
    },
  );

  r.post(
    '/v1/marketplace/studio/listings',
    {
      ...auth,
      config: perMinute(10),
      schema: { body: CreateListing, response: { 201: StudioListing } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const body = req.body;
      if ((body.priceCents ?? 0) > 0 && !paidOn) throw paidListingsOff();
      const [creator] = await db.select().from(creators).where(eq(creators.userId, userId));
      if (!creator)
        throw new HttpError(
          409,
          'Profil requis',
          'creator_required',
          'Créez d’abord votre profil de créateur',
        );
      const [drafts] = await db
        .select({ n: count() })
        .from(listings)
        .where(and(eq(listings.creatorId, userId), eq(listings.status, 'draft')));
      if ((drafts?.n ?? 0) >= config.DRAFTS_PER_CREATOR)
        throw new HttpError(
          429,
          'Trop de brouillons',
          'drafts_limit',
          `${config.DRAFTS_PER_CREATOR} packs non publiés au plus`,
        );
      // Une nouvelle fiche n'a pas encore d'image : rien à vérifier tant qu'elle n'existe pas
      if (body.coverUrl || body.gallery?.length)
        throw HttpError.badRequest(
          'Les images s’envoient une fois le pack créé',
          'media_not_allowed',
        );

      const row = await retryOnSlugConflict(() =>
        db.transaction(async (tx) => {
          const id = uuidv7();
          const [created] = await tx
            .insert(listings)
            .values({
              id,
              creatorId: userId,
              slug: await uniqueSlug(tx, 'listings', body.title),
              title: body.title,
              summary: body.summary ?? '',
              description: body.description ?? '',
              systemId: body.systemId ?? null,
              license: body.license ?? 'personal',
              attribution: body.attribution ?? '',
              priceCents: body.priceCents ?? 0,
              tags: body.tags ?? [],
              contentWarnings: body.contentWarnings ?? [],
            })
            .returning();
          await refreshSearch(tx, created!);
          await appendEvent(tx, eventContext(req), {
            type: MARKETPLACE_EVENTS.listingCreated,
            actor: userActor(userId),
            aggregate: listingAggregate(id),
            payload: { listingId: id, priceCents: created!.priceCents },
          });
          return created!;
        }),
      );
      reply.code(201);
      return full(row);
    },
  );

  r.patch(
    '/v1/marketplace/studio/listings/:id',
    {
      ...auth,
      config: perMinute(30),
      schema: { params: IdParams, body: UpdateListing, response: { 200: StudioListing } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const { version, ...patch } = req.body;
      checkMedia(req.params.id, [patch.coverUrl, ...(patch.gallery ?? [])]);
      const row = await db.transaction(async (tx) => {
        const current = await ownListing(tx, req.params.id, userId, true);
        if (current.status === 'removed') throw removedListing();
        if (version !== undefined && version !== current.version) throw versionConflict();
        if (patch.priceCents !== undefined && patch.priceCents > 0) {
          if (!paidOn) throw paidListingsOff();
          if (current.status !== 'draft') await requirePayouts(tx, userId);
        }
        const fields = (Object.keys(patch) as (keyof typeof patch)[]).filter(
          (k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(current[k]),
        );
        if (!fields.length) return current;
        const [updated] = await tx
          .update(listings)
          .set({
            ...patch,
            // Fiche en vente modifiée : contrôle a posteriori par la modération
            needsRecheck: current.status === 'draft' ? current.needsRecheck : true,
            updatedAt: sql`now()`,
            version: sql`${listings.version} + 1`,
          })
          .where(eq(listings.id, current.id))
          .returning();
        await refreshSearch(tx, updated!);
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.listingUpdated,
          actor: userActor(userId),
          aggregate: listingAggregate(current.id),
          payload: { listingId: current.id, version: updated!.version, fields },
        });
        return updated!;
      });
      return full(row);
    },
  );

  r.delete(
    '/v1/marketplace/studio/listings/:id',
    { ...auth, schema: { params: IdParams } },
    async (req, reply) => {
      const userId = sessionUser(req);
      await db.transaction(async (tx) => {
        const current = await ownListing(tx, req.params.id, userId, true);
        const [acquired] = await tx
          .select({ n: count() })
          .from(acquisitions)
          .where(eq(acquisitions.listingId, current.id));
        if (current.status !== 'draft' || current.publishedAt || (acquired?.n ?? 0) > 0)
          throw new HttpError(
            409,
            'Pack déjà publié',
            'listing_published',
            'Un pack publié se retire de la vente, il ne se supprime pas',
          );
        await tx.delete(listings).where(eq(listings.id, current.id));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.listingDeleted,
          actor: userActor(userId),
          aggregate: listingAggregate(current.id),
          payload: { listingId: current.id },
        });
      });
      // Fichiers d'un brouillon : personne d'autre ne les cite
      await deps.storage
        ?.removePrefix(listingFolder(req.params.id))
        .catch((error: unknown) =>
          req.log.warn({ error: (error as Error).message }, 'fichiers du brouillon non supprimés'),
        );
      return reply.code(204).send();
    },
  );

  /** Retire de la vente, ou y remet, une fiche de l'appelant. */
  async function setListed(req: FastifyRequest, id: string, action: 'unlist' | 'relist') {
    const userId = sessionUser(req);
    const row = await db.transaction(async (tx) => {
      const current = await ownListing(tx, id, userId, true);
      const from = action === 'unlist' ? 'published' : 'unlisted';
      if (current.status === 'removed') throw removedListing();
      if (current.status !== from)
        throw HttpError.conflict(
          action === 'unlist' ? 'Ce pack n’est pas en vente' : 'Ce pack n’est pas retiré',
          'invalid_status',
        );
      if (action === 'relist' && current.priceCents > 0) {
        if (!paidOn) throw paidListingsOff();
        await requirePayouts(tx, userId);
      }
      const [updated] = await tx
        .update(listings)
        .set({
          status: action === 'unlist' ? 'unlisted' : 'published',
          updatedAt: sql`now()`,
          version: sql`${listings.version} + 1`,
        })
        .where(eq(listings.id, current.id))
        .returning();
      await appendEvent(tx, eventContext(req), {
        type:
          action === 'unlist'
            ? MARKETPLACE_EVENTS.listingUnlisted
            : MARKETPLACE_EVENTS.listingRelisted,
        actor: userActor(userId),
        aggregate: listingAggregate(current.id),
        payload: { listingId: current.id, version: updated!.version },
      });
      return updated!;
    });
    return full(row);
  }

  const listedSchema = { params: IdParams, response: { 200: StudioListing } };
  r.post(
    '/v1/marketplace/studio/listings/:id/unlist',
    { ...auth, schema: listedSchema },
    async (req) => setListed(req, req.params.id, 'unlist'),
  );
  r.post(
    '/v1/marketplace/studio/listings/:id/relist',
    { ...auth, schema: listedSchema },
    async (req) => setListed(req, req.params.id, 'relist'),
  );

  r.post(
    '/v1/marketplace/studio/listings/:id/uploads',
    {
      ...auth,
      config: perMinute(30),
      schema: { params: IdParams, body: FileUploadRequest, response: { 200: FileUploadTicket } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const listing = await ownListing(db, req.params.id, userId);
      if (listing.status === 'removed') throw removedListing();
      return deps.uploads.ticket(
        req.body,
        listing.id,
        ['marketplace-cover', 'marketplace-image'],
        req.log,
      );
    },
  );

  r.post(
    '/v1/marketplace/studio/listings/:id/versions',
    {
      ...auth,
      config: perMinute(10),
      schema: { params: IdParams, body: VersionBody, response: { 201: StudioVersion } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const row = await db.transaction(async (tx) => {
        const listing = await ownListing(tx, req.params.id, userId, true);
        if (listing.status === 'removed') throw removedListing();
        const existing = await versionsOf(tx, listing.id);
        if (existing.some((v) => v.status === 'draft' || v.status === 'in_review'))
          throw HttpError.conflict(
            'Une version est déjà en préparation ou en revue',
            'version_open',
          );
        checkIncreasing(existing, req.body.number);
        const id = uuidv7();
        const [created] = await tx
          .insert(listingVersions)
          .values({ id, listingId: listing.id, number: req.body.number, notes: req.body.notes })
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionCreated,
          actor: userActor(userId),
          aggregate: versionAggregate(id),
          payload: { listingId: listing.id, versionId: id, number: req.body.number },
        });
        return created!;
      });
      reply.code(201);
      return studioVersionView(row);
    },
  );

  r.patch(
    '/v1/marketplace/studio/versions/:id',
    {
      ...auth,
      schema: { params: IdParams, body: VersionPatch, response: { 200: StudioVersion } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const row = await db.transaction(async (tx) => {
        const { version, listing } = await ownVersion(tx, req.params.id, userId, true);
        if (version.status !== 'draft') throw notDraft();
        if (req.body.number && req.body.number !== version.number)
          checkIncreasing(
            (await versionsOf(tx, listing.id)).filter((v) => v.id !== version.id),
            req.body.number,
          );
        const [updated] = await tx
          .update(listingVersions)
          .set({ ...req.body, updatedAt: sql`now()` })
          .where(eq(listingVersions.id, version.id))
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionUpdated,
          actor: userActor(userId),
          aggregate: versionAggregate(version.id),
          payload: { listingId: listing.id, versionId: version.id, number: updated!.number },
        });
        return updated!;
      });
      return studioVersionView(row);
    },
  );

  r.put(
    '/v1/marketplace/studio/versions/:id/content',
    {
      ...auth,
      bodyLimit: CONTENT_BODY_LIMIT,
      config: perMinute(10),
      // Le contenu est validé par storeContent (erreurs détaillées, sans réécho du corps)
      schema: { params: IdParams, body: z.unknown(), response: { 200: StudioVersion } },
    },
    async (req, reply) => {
      const userId = sessionUser(req);
      const storage = requireStorage(deps);
      const { version, listing } = await ownVersion(db, req.params.id, userId);
      if (version.status !== 'draft') throw notDraft();
      if (listing.status === 'removed') throw removedListing();

      let stored;
      try {
        stored = await storeContent({ db, storage }, listing.id, version.id, req.body);
      } catch (e) {
        if (e instanceof InvalidPack)
          return sendProblem(reply, 422, 'Pack invalide', 'invalid_pack', { errors: e.errors });
        if (e instanceof AssetsRejected)
          return sendProblem(reply, 422, 'Fichiers refusés', e.code, { urls: e.urls });
        throw e;
      }

      const row = await db.transaction(async (tx) => {
        const { version: fresh } = await ownVersion(tx, version.id, userId, true);
        if (fresh.status !== 'draft') throw notDraft();
        const [updated] = await tx
          .update(listingVersions)
          .set({
            contentKey: stored.key,
            contentSha256: stored.sha256,
            contentBytes: stored.bytes,
            counts: stored.counts,
            systemId: stored.content.systemId,
            updatedAt: sql`now()`,
          })
          .where(eq(listingVersions.id, version.id))
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionContentSet,
          actor: userActor(userId),
          aggregate: versionAggregate(version.id),
          payload: {
            listingId: listing.id,
            versionId: version.id,
            counts: stored.counts,
            bytes: stored.bytes,
          },
        });
        return updated!;
      });
      return studioVersionView(row);
    },
  );

  r.get(
    '/v1/marketplace/studio/versions/:id/content',
    { ...auth, schema: { params: IdParams, response: { 200: PackContent } } },
    async (req, reply) => {
      const userId = sessionUser(req);
      const { version } = await ownVersion(db, req.params.id, userId);
      if (!version.contentKey || !version.contentSha256)
        throw new HttpError(404, 'Ressource introuvable', 'content_not_found', 'Pack vide');
      reply.header('cache-control', 'no-store');
      return readContent(requireStorage(deps), version.contentKey, version.contentSha256);
    },
  );

  r.post(
    '/v1/marketplace/studio/versions/:id/submit',
    {
      ...auth,
      config: perMinute(10),
      schema: { params: IdParams, body: SubmitBody, response: { 200: StudioVersion } },
    },
    async (req) => {
      const userId = sessionUser(req);
      const row = await db.transaction(async (tx) => {
        const { version, listing } = await ownVersion(tx, req.params.id, userId, true);
        if (version.status !== 'draft') throw notDraft();
        if (listing.status === 'removed') throw removedListing();
        checkSubmittable(listing, version);
        if (listing.priceCents > 0) {
          if (!paidOn) throw paidListingsOff();
          await requirePayouts(tx, userId);
        }
        await checkSubmissionRate(tx, userId, config.SUBMISSIONS_PER_DAY);
        const [updated] = await tx
          .update(listingVersions)
          .set({
            status: 'in_review',
            submittedAt: sql`now()`,
            rightsAttestedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(listingVersions.id, version.id))
          .returning();
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionSubmitted,
          actor: userActor(userId),
          aggregate: versionAggregate(version.id),
          payload: { listingId: listing.id, versionId: version.id, number: version.number },
        });
        return updated!;
      });
      return studioVersionView(row);
    },
  );

  r.delete(
    '/v1/marketplace/studio/versions/:id',
    { ...auth, schema: { params: IdParams } },
    async (req, reply) => {
      const userId = sessionUser(req);
      await db.transaction(async (tx) => {
        const { version, listing } = await ownVersion(tx, req.params.id, userId, true);
        if (version.status !== 'draft') throw notDraft();
        await tx.delete(listingVersions).where(eq(listingVersions.id, version.id));
        await appendEvent(tx, eventContext(req), {
          type: MARKETPLACE_EVENTS.versionDeleted,
          actor: userActor(userId),
          aggregate: versionAggregate(version.id),
          payload: { listingId: listing.id, versionId: version.id },
        });
      });
      return reply.code(204).send();
    },
  );
};

/** Stockage configuré, sinon 503 (le contenu d'un pack vit sur R2). */
export function requireStorage(deps: Pick<Deps, 'storage'>) {
  if (!deps.storage)
    throw new HttpError(
      503,
      'Service indisponible',
      'storage_unavailable',
      'Le stockage des fichiers n’est pas configuré sur ce serveur',
    );
  return deps.storage;
}

/** Nouveau numéro plus grand que tous les précédents. */
function checkIncreasing(existing: VersionRow[], number: string) {
  const latest = existing.reduce<string | null>(
    (max, v) => (max === null || compareVersions(v.number, max) > 0 ? v.number : max),
    null,
  );
  if (latest && compareVersions(number, latest) <= 0)
    throw new HttpError(
      422,
      'Numéro de version',
      'version_not_increasing',
      `Le numéro doit dépasser ${latest}`,
    );
}

/** Fiche et version prêtes pour la revue : contenu, couverture, prix, système. */
export function checkSubmittable(listing: ListingRow, version: VersionRow) {
  const refuse = (code: string, detail: string) =>
    new HttpError(422, 'Pack incomplet', code, detail);
  if (!version.contentKey || !version.counts) throw refuse('content_required', 'Le pack est vide');
  if (!listing.coverUrl) throw refuse('cover_required', 'Ajoutez une couverture');
  if (!listing.summary) throw refuse('summary_required', 'Ajoutez un résumé');
  if (!isValidPrice(listing.priceCents)) throw refuse('invalid_price', 'Prix hors bornes');
  if (version.systemId && listing.systemId !== version.systemId)
    throw refuse('system_mismatch', 'Le système du pack diffère de celui de la fiche');
  const kinds = packKinds(version.counts);
  if (!kinds.length) throw refuse('content_required', 'Le pack est vide');
}

/** Créateur prêt à encaisser (compte Stripe actif), sinon 422. */
async function requirePayouts(tx: Tx, userId: string) {
  const [creator] = await tx
    .select({ ready: creators.payoutsReady })
    .from(creators)
    .where(eq(creators.userId, userId));
  if (!creator?.ready)
    throw new HttpError(
      422,
      'Ventes non activées',
      'payouts_not_ready',
      'Activez les ventes (compte de paiement) avant de vendre ce pack',
    );
}

async function checkSubmissionRate(tx: Tx, userId: string, perDay: number) {
  const [row] = await tx
    .select({ n: count() })
    .from(listingVersions)
    .innerJoin(listings, eq(listings.id, listingVersions.listingId))
    .where(
      and(
        eq(listings.creatorId, userId),
        gte(listingVersions.submittedAt, sql`now() - interval '1 day'`),
      ),
    );
  if ((row?.n ?? 0) >= perDay)
    throw new HttpError(
      429,
      'Trop de soumissions',
      'submissions_limit',
      `${perDay} soumissions par jour au plus`,
    );
}
