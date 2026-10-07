/** Libellés et formats de la marketplace (prix, contenu, statuts). */
import {
  marketplaceFee,
  type ListingKind,
  type ListingStatus,
  type PackCounts,
  type VersionStatus,
} from '@vtt/contracts';

/** Centimes → « 4,99 € » ; 0 → « Gratuit ». */
export function priceLabel(cents: number, currency = 'eur'): string {
  if (cents <= 0) return 'Gratuit';
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
}

/** Ce que touche le créateur sur une vente à ce prix (avant les frais de sa banque). */
export const creatorShare = (cents: number) => cents - marketplaceFee(cents);

/** « 12,50 » (saisie) → 1250 ; null si illisible. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/\s|€/g, '').replace(',', '.');
  if (!t) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** 1250 → « 12,50 » (champ de saisie). */
export const priceInput = (cents: number) =>
  cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '';

export const KIND_LABELS: Record<ListingKind, string> = {
  scenes: 'Scènes',
  npcs: 'PNJ',
  objects: 'Objets',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Brouillon',
  published: 'En vente',
  unlisted: 'Retiré',
  removed: 'Retiré par la modération',
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: 'Brouillon',
  in_review: 'En revue',
  published: 'Publiée',
  rejected: 'Refusée',
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 3 scènes · 12 PNJ · 40 objets » : ce que contient une version. */
export function countsLabel(c: Pick<PackCounts, 'scenes' | 'npcTemplates' | 'objectTemplates'>) {
  return [
    c.scenes ? plural(c.scenes, 'scène', 'scènes') : null,
    c.npcTemplates ? plural(c.npcTemplates, 'PNJ', 'PNJ') : null,
    c.objectTemplates ? plural(c.objectTemplates, 'objet', 'objets') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Note moyenne affichée : « 4,3 » ; null sans avis. */
export const ratingLabel = (rating: number | null) =>
  rating === null ? null : rating.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Date courte : « 7 oct. 2026 ». */
export const dateLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
