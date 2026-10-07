/**
 * Dates et durées lisibles, dans la langue de la page (docs/i18n.md § 5). Les mêmes fonctions
 * servent dans React (`useDates`) et hors React (`dates()`, traducteur d'exécution).
 */
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatter, translate } from './runtime';

type Format = ReturnType<typeof useFormatter>;
type Time = ReturnType<typeof useTranslations<'common.time'>>;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

function valid(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function build(format: Format, t: Time) {
  return {
    /** « 5 octobre 2026 » ; « — » sans date. */
    date(iso: string | null | undefined) {
      const d = valid(iso);
      return d ? format.dateTime(d, 'date') : '—';
    },
    /** « il y a 3 heures », « à l'instant » ; « jamais » sans date. */
    since(iso: string | null | undefined) {
      if (!iso) return t('never');
      const d = valid(iso);
      if (!d) return '—';
      const seconds = Math.round((d.getTime() - Date.now()) / 1000);
      if (Math.abs(seconds) < 60) return t('justNow');
      const now = new Date();
      for (const [unit, size] of UNITS)
        if (Math.abs(seconds) >= size) return format.relativeTime(d, { now, unit });
      return format.relativeTime(d, { now, unit: 'second' });
    },
    /** « dans 3 jours », « demain », « aujourd'hui » (jours calendaires). */
    inDays(iso: string) {
      const days = Math.round(
        (new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
      );
      if (days === 0) return t('today');
      const target = new Date(Date.now() + days * 86_400_000);
      return format.relativeTime(target, { now: new Date(), unit: 'day' });
    },
    /** Date et heure d'une session : « sam. 4 oct. · 20:30 ». */
    session(iso: string) {
      const d = new Date(iso);
      return t('session', {
        day: format.dateTime(d, { weekday: 'short', day: 'numeric', month: 'short' }),
        time: format.dateTime(d, 'time'),
      });
    },
    /** Durée en minutes : « 45 min », « 2 h », « 2 h 05 min ». */
    duration(minutes: number) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (h === 0) return t('minutes', { count: m });
      if (m === 0) return t('hours', { count: h });
      return t('hoursMinutes', { hours: String(h), minutes: String(m).padStart(2, '0') });
    },
  };
}

export type Dates = ReturnType<typeof build>;

/** Dans un composant. */
export function useDates(): Dates {
  const format = useFormatter();
  const t = useTranslations('common.time');
  return useMemo(() => build(format, t), [format, t]);
}

/** Hors React (navigateur seulement). */
export function dates(): Dates {
  return build(
    formatter() as Format,
    ((key: string, values?: Record<string, unknown>) =>
      (translate as (k: string, v?: Record<string, unknown>) => string)(
        `common.time.${key}`,
        values,
      )) as unknown as Time,
  );
}
