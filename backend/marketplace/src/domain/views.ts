/**
 * Lignes de la base → formes de l'API (`@vtt/contracts/marketplace`). Aucune requête ici, sauf
 * `creatorSummaries` qui lit les créateurs d'un lot de fiches en une fois.
 */
import {
  normalizeText,
  type ContentWarning,
  type CreatorProfile,
  type CreatorSummary,
  type License,
  type ListingCard,
  type ListingKind,
  type ModerationReason,
  type PackCounts,
  type PublicVersion,
  type Review,
  type StudioListing,
  type StudioVersion,
} from '@vtt/contracts';
import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/outbox.js';
import {
  creators,
  type CreatorRow,
  type ListingRow,
  type ReviewRow,
  type VersionRow,
} from '../db/schema.js';
import { averageRating, iso } from '../modules/common.js';

export const DELETED_CREATOR = 'Créateur supprimé';

/** Texte de recherche d'une fiche : titre, résumé, étiquettes et nom du créateur, sans accents. */
export function searchTextOf(
  l: Pick<ListingRow, 'title' | 'summary' | 'tags'>,
  creatorName: string | null,
): string {
  return normalizeText([l.title, l.summary, ...l.tags, creatorName ?? ''].join(' '));
}

export function creatorView(c: CreatorRow): CreatorProfile {
  return {
    userId: c.userId,
    slug: c.slug,
    displayName: c.displayName,
    bio: c.bio,
    payoutsReady: c.payoutsReady,
    createdAt: c.createdAt.toISOString(),
    version: c.version,
  };
}

export async function creatorSummaries(
  db: Db | Tx,
  ids: readonly string[],
): Promise<Map<string, CreatorSummary>> {
  const unique = [...new Set(ids)];
  const rows = unique.length
    ? await db.select().from(creators).where(inArray(creators.userId, unique))
    : [];
  const map = new Map<string, CreatorSummary>();
  for (const id of unique) map.set(id, { userId: id, slug: '', displayName: DELETED_CREATOR });
  for (const c of rows)
    map.set(c.userId, { userId: c.userId, slug: c.slug, displayName: c.displayName });
  return map;
}

const EMPTY_COUNTS: PackCounts = { scenes: 0, npcTemplates: 0, objectTemplates: 0, assets: 0 };

export function cardView(
  l: ListingRow,
  creator: CreatorSummary | undefined,
  owned: boolean,
): ListingCard {
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    coverUrl: l.coverUrl,
    systemId: l.systemId,
    kinds: l.kinds as ListingKind[],
    priceCents: l.priceCents,
    currency: l.currency,
    contentWarnings: l.contentWarnings as ContentWarning[],
    ratingCount: l.ratingCount,
    rating: averageRating(l.ratingCount, l.ratingSum),
    acquisitionsCount: l.acquisitionsCount,
    creator: creator ?? { userId: l.creatorId, slug: '', displayName: DELETED_CREATOR },
    publishedAt: iso(l.publishedAt),
    owned,
  };
}

export function publicVersionView(v: VersionRow): PublicVersion {
  return {
    id: v.id,
    number: v.number,
    notes: v.notes,
    counts: v.counts ?? EMPTY_COUNTS,
    systemId: v.systemId,
    publishedAt: iso(v.publishedAt),
  };
}

export function studioVersionView(v: VersionRow): StudioVersion {
  return {
    id: v.id,
    listingId: v.listingId,
    number: v.number,
    notes: v.notes,
    status: v.status,
    counts: v.counts ?? null,
    contentBytes: v.contentBytes,
    systemId: v.systemId,
    submittedAt: iso(v.submittedAt),
    reviewedAt: iso(v.reviewedAt),
    reviewReason: (v.reviewReason as ModerationReason | null) ?? null,
    reviewNote: v.reviewNote,
    publishedAt: iso(v.publishedAt),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export function studioListingView(l: ListingRow): Omit<StudioListing, 'versions'> {
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    description: l.description,
    systemId: l.systemId,
    license: l.license as License,
    attribution: l.attribution,
    priceCents: l.priceCents,
    currency: l.currency,
    tags: l.tags,
    contentWarnings: l.contentWarnings as ContentWarning[],
    coverUrl: l.coverUrl,
    gallery: l.gallery,
    status: l.status,
    kinds: l.kinds as ListingKind[],
    currentVersionId: l.currentVersionId,
    acquisitionsCount: l.acquisitionsCount,
    ratingCount: l.ratingCount,
    rating: averageRating(l.ratingCount, l.ratingSum),
    removedReason: (l.removedReason as ModerationReason | null) ?? null,
    publishedAt: iso(l.publishedAt),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    version: l.version,
  };
}

export function reviewView(r: ReviewRow): Review {
  return {
    listingId: r.listingId,
    userId: r.userId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
