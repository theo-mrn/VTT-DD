/**
 * Bibliothèque partagée (service library, docs/bibliotheque.md) : fonds de scène communs à toutes
 * les campagnes, cherchés par ce qu'ils montrent, filtrés par facette, 30 par page.
 */
'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  Background,
  BackgroundFacets,
  BackgroundKind,
  BackgroundMood,
  BackgroundPage,
  BackgroundPlace,
  BackgroundSetting,
  BackgroundTime,
  LibraryLang,
} from '@vtt/contracts';
import { activeLocale } from '@/i18n/runtime';
import { api, ApiError } from './api';

export interface BackgroundFilters {
  q: string;
  /** Plans de carte (vus du dessus) ou illustrations (décors vus de face). */
  kind: BackgroundKind;
  collection: string | null;
  place: BackgroundPlace | null;
  setting: BackgroundSetting | null;
  time: BackgroundTime | null;
  mood: BackgroundMood | null;
  /** null : fixes et animés. */
  animated: boolean | null;
}

export const NO_FILTERS: BackgroundFilters = {
  q: '',
  kind: 'map',
  collection: null,
  place: null,
  setting: null,
  time: null,
  mood: null,
  animated: null,
};

const lang = (): LibraryLang => (activeLocale() === 'en' ? 'en' : 'fr');

const keys = {
  all: ['library', 'backgrounds'] as const,
  list: (f: BackgroundFilters, l: LibraryLang) => [...keys.all, 'list', l, f] as const,
  facets: (kind: BackgroundKind) => [...keys.all, 'facets', kind] as const,
  byUrl: (url: string, l: LibraryLang) => [...keys.all, 'url', l, url] as const,
};

function query(f: BackgroundFilters, page: number, l: LibraryLang): string {
  const p = new URLSearchParams({ lang: l, kind: f.kind, page: String(page) });
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.collection) p.set('collection', f.collection);
  if (f.place) p.set('place', f.place);
  if (f.setting) p.set('setting', f.setting);
  if (f.time) p.set('time', f.time);
  if (f.mood) p.set('mood', f.mood);
  if (f.animated !== null) p.set('animated', f.animated ? '1' : '0');
  return p.toString();
}

/** Fonds qui répondent aux filtres, page après page ; l'ancienne liste reste pendant la frappe. */
export function useBackgrounds(f: BackgroundFilters, enabled = true) {
  const l = lang();
  return useInfiniteQuery({
    queryKey: keys.list(f, l),
    queryFn: ({ pageParam }) =>
      api<BackgroundPage>(`/v1/library/backgrounds?${query(f, pageParam, l)}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Nombre de fonds par valeur de facette pour un usage (menus des filtres, onglets). */
export function useBackgroundFacets(kind: BackgroundKind, enabled = true) {
  return useQuery({
    queryKey: keys.facets(kind),
    queryFn: () => api<BackgroundFacets>(`/v1/library/backgrounds/facets?kind=${kind}`),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    enabled,
  });
}

/** Fond de la bibliothèque dont une variante a cette adresse ; null pour un fichier importé. */
export function useBackgroundByUrl(url: string | null) {
  const l = lang();
  return useQuery({
    queryKey: keys.byUrl(url ?? '', l),
    queryFn: async () => {
      try {
        return await api<Background>(
          `/v1/library/backgrounds/lookup?${new URLSearchParams({ url: url!, lang: l })}`,
        );
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
        throw e;
      }
    },
    enabled: !!url,
    staleTime: 10 * 60_000,
  });
}
