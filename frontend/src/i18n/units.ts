/**
 * Tailles de fichiers dans la langue de la page (« 1,5 Mo », « 1.5 MB »), en base 1024 comme
 * `formatBytes` de @vtt/contracts (resté côté services pour leurs messages).
 */
'use client';

import { useLocale } from 'next-intl';
import { useCallback } from 'react';
import { activeLocale } from './runtime';

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

export function formatBytesIn(locale: string, bytes: number): string {
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  let digits = 2;
  if (i === 0 || v >= 100) digits = 0;
  else if (v >= 10) digits = 1;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: UNITS[i],
    unitDisplay: 'short',
    maximumFractionDigits: digits,
  }).format(v);
}

/** Dans un composant. */
export function useFormatBytes(): (bytes: number) => string {
  const locale = useLocale();
  return useCallback((bytes: number) => formatBytesIn(locale, bytes), [locale]);
}

/** Hors React. */
export function formatBytes(bytes: number): string {
  return formatBytesIn(activeLocale(), bytes);
}
