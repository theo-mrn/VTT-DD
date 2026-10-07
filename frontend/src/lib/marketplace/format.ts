/**
 * Libellés et formats de la marketplace (prix, contenu, statuts), dans la langue de la page
 * (docs/i18n.md § 6) : traducteur d'exécution, lu après le chargement des données.
 */
import {
  marketplaceFee,
  type ContentWarning,
  type License,
  type ListingKind,
  type ListingStatus,
  type ModerationReason,
  type PackCounts,
  type ReportReason,
  type VersionStatus,
} from '@vtt/contracts';
import { formatter, lazyLabels, translate } from '@/i18n/runtime';

/** Centimes → « 4,99 € » ; 0 → « Gratuit ». */
export function priceLabel(cents: number, currency = 'eur'): string {
  if (cents <= 0) return translate('marketplace.common.price.free');
  return formatter().number(cents / 100, { style: 'currency', currency: currency.toUpperCase() });
}

/** Ce que touche le créateur sur une vente à ce prix (avant les frais de sa banque). */
export const creatorShare = (cents: number) => cents - marketplaceFee(cents);

/** « 12,50 » ou « 12.50 » (saisie) → 1250 ; null si illisible. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/\s|€/g, '').replace(',', '.');
  if (!t) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** 1250 → « 12,50 » (champ de saisie, séparateur décimal de la langue). */
export const priceInput = (cents: number) =>
  cents > 0
    ? formatter().number(cents / 100, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      })
    : '';

export const KIND_LABELS = lazyLabels<ListingKind>({
  scenes: 'marketplace.common.kinds.scenes',
  npcs: 'marketplace.common.kinds.npcs',
  objects: 'marketplace.common.kinds.objects',
});

export const LISTING_STATUS_LABELS = lazyLabels<ListingStatus>({
  draft: 'marketplace.common.listingStatus.draft',
  published: 'marketplace.common.listingStatus.published',
  unlisted: 'marketplace.common.listingStatus.unlisted',
  removed: 'marketplace.common.listingStatus.removed',
});

export const VERSION_STATUS_LABELS = lazyLabels<VersionStatus>({
  draft: 'marketplace.common.versionStatus.draft',
  in_review: 'marketplace.common.versionStatus.inReview',
  published: 'marketplace.common.versionStatus.published',
  rejected: 'marketplace.common.versionStatus.rejected',
});

/** Remplace `LICENSE_LABELS` de `@vtt/contracts` (français) à l'affichage. */
export const LICENSE_LABELS = lazyLabels<License>({
  personal: 'marketplace.common.licenses.personal',
  'cc-by-4.0': 'marketplace.common.licenses.ccBy',
  'cc-by-sa-4.0': 'marketplace.common.licenses.ccBySa',
  'cc-by-nc-4.0': 'marketplace.common.licenses.ccByNc',
  'cc0-1.0': 'marketplace.common.licenses.cc0',
  'ogl-1.0a': 'marketplace.common.licenses.ogl',
  orc: 'marketplace.common.licenses.orc',
});

/** Remplace `CONTENT_WARNING_LABELS` de `@vtt/contracts` (français) à l'affichage. */
export const CONTENT_WARNING_LABELS = lazyLabels<ContentWarning>({
  violence: 'marketplace.common.contentWarnings.violence',
  horror: 'marketplace.common.contentWarnings.horror',
  gore: 'marketplace.common.contentWarnings.gore',
  drugs: 'marketplace.common.contentWarnings.drugs',
  phobias: 'marketplace.common.contentWarnings.phobias',
});

/** Remplace `REPORT_REASON_LABELS` de `@vtt/contracts` (français) à l'affichage. */
export const REPORT_REASON_LABELS = lazyLabels<ReportReason>({
  copyright: 'marketplace.common.reportReasons.copyright',
  adult: 'marketplace.common.reportReasons.adult',
  hateful: 'marketplace.common.reportReasons.hateful',
  broken: 'marketplace.common.reportReasons.broken',
  misleading: 'marketplace.common.reportReasons.misleading',
  other: 'marketplace.common.reportReasons.other',
});

/** Remplace `MODERATION_REASON_LABELS` de `@vtt/contracts` (français) à l'affichage. */
export const MODERATION_REASON_LABELS = lazyLabels<ModerationReason>({
  rights: 'marketplace.common.moderationReasons.rights',
  adult: 'marketplace.common.moderationReasons.adult',
  hateful: 'marketplace.common.moderationReasons.hateful',
  quality: 'marketplace.common.moderationReasons.quality',
  broken: 'marketplace.common.moderationReasons.broken',
  misleading: 'marketplace.common.moderationReasons.misleading',
  other: 'marketplace.common.moderationReasons.other',
});

/** « 3 scènes · 12 PNJ · 40 objets » : ce que contient une version ; vide si rien. */
export function countsLabel(c: Pick<PackCounts, 'scenes' | 'npcTemplates' | 'objectTemplates'>) {
  return [
    c.scenes ? translate('marketplace.common.counts.scenes', { count: c.scenes }) : null,
    c.npcTemplates ? translate('marketplace.common.counts.npcs', { count: c.npcTemplates }) : null,
    c.objectTemplates
      ? translate('marketplace.common.counts.objects', { count: c.objectTemplates })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Note moyenne affichée : « 4,3 » ; null sans avis. */
export const ratingLabel = (rating: number | null) =>
  rating === null ? null : formatter().number(rating, { maximumFractionDigits: 1 });

/** Date courte : « 7 oct. 2026 » ; vide sans date. */
export const dateLabel = (iso: string | null) =>
  iso
    ? formatter().dateTime(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
