/**
 * Bibliothèque d'images de l'ancienne app (stockage R2), décrite par
 * public/asset-mappings.json : portraits, cartes, objets…
 */
'use client';

import { useQuery } from '@tanstack/react-query';

export interface Asset {
  name: string;
  /** URL publique (CDN). */
  path: string;
  localPath: string;
  category: string;
  type: string;
}

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      const res = await fetch('/asset-mappings.json');
      if (!res.ok) throw new Error('Bibliothèque d’images indisponible');
      return (await res.json()) as Asset[];
    },
    staleTime: Infinity,
  });
}

/** Portraits regroupés par dossier (« Elfe », « Nain »…). */
export function portraitsParDossier(assets: Asset[]): Map<string, Asset[]> {
  const r = new Map<string, Asset[]>();
  for (const a of assets) {
    if (a.type !== 'image' || !a.category.startsWith('Photos/')) continue;
    const dossier = a.category.slice('Photos/'.length);
    r.set(dossier, [...(r.get(dossier) ?? []), a]);
  }
  return r;
}
