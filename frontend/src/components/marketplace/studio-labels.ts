'use client';

/**
 * Libellés du studio et de la modération dans la langue de la page : prix, dates, contenu d'une
 * version, statuts, licences, avertissements et motifs (docs/i18n.md § 5 et § 6). Les textes
 * sont ceux de `marketplace.common`, partagés avec la boutique.
 */
import type {
  ContentWarning,
  License,
  ListingStatus,
  ModerationReason,
  PackCounts,
  ReportReason,
  VersionStatus,
} from '@vtt/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';

/** Licence → clé du catalogue (les identifiants portent des points, interdits dans une clé). */
const LICENSE_KEYS = {
  personal: 'personal',
  'cc-by-4.0': 'ccBy',
  'cc-by-sa-4.0': 'ccBySa',
  'cc-by-nc-4.0': 'ccByNc',
  'cc0-1.0': 'cc0',
  'ogl-1.0a': 'ogl',
  orc: 'orc',
} as const satisfies Record<License, string>;

export function useStudioLabels() {
  const t = useTranslations('marketplace.common');
  const format = useFormatter();
  return useMemo(
    () => ({
      /** Centimes → « 4,99 € » ; 0 → « Gratuit ». */
      price(cents: number, currency = 'eur') {
        if (cents <= 0) return t('price.free');
        return format.number(cents / 100, { style: 'currency', currency: currency.toUpperCase() });
      },
      /** Date courte : « 7 oct. 2026 ». */
      date(iso: string | null) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return format.dateTime(d, { day: 'numeric', month: 'short', year: 'numeric' });
      },
      /** « 3 scènes · 12 PNJ · 40 objets » : ce que contient une version. */
      counts(c: Pick<PackCounts, 'scenes' | 'npcTemplates' | 'objectTemplates'>) {
        return [
          c.scenes ? t('counts.scenes', { count: c.scenes }) : null,
          c.npcTemplates ? t('counts.npcs', { count: c.npcTemplates }) : null,
          c.objectTemplates ? t('counts.objects', { count: c.objectTemplates }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
      },
      listingStatus: (s: ListingStatus) => t(`listingStatus.${s}`),
      versionStatus: (s: VersionStatus) => t(`versionStatus.${s === 'in_review' ? 'inReview' : s}`),
      license: (l: License) => t(`licenses.${LICENSE_KEYS[l]}`),
      warning: (w: ContentWarning) => t(`contentWarnings.${w}`),
      moderationReason: (r: ModerationReason) => t(`moderationReasons.${r}`),
      reportReason: (r: ReportReason) => t(`reportReasons.${r}`),
      /** « v1.2.0 ». */
      version: (n: string) => t('version', { number: n }),
    }),
    [t, format],
  );
}
