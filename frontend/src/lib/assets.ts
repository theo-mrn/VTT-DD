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
      // Adresses encodées (espaces → %20) : valides partout où une URL est attendue (fond de
      // carte, portrait, objet), le serveur refusant une adresse qui contient un espace
      return ((await res.json()) as Asset[]).map((a) => ({ ...a, path: encodeURI(a.path) }));
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

const CDN = 'https://assets.yner.fr/';

/**
 * Vignette d'une image de la bibliothèque, redimensionnée par le CDN (Cloudflare) : quelques Ko
 * au lieu d'un ou deux Mo. Toute autre adresse est rendue telle quelle.
 */
export function vignette(url: string, largeur: number): string {
  if (!surCdn(url)) return url;
  return `${CDN}cdn-cgi/image/width=${Math.round(largeur)},format=auto/${url.slice(CDN.length)}`;
}

/** L'adresse est servie par le CDN, qui sait la redimensionner. */
export function surCdn(url: string): boolean {
  return url.startsWith(CDN);
}

/**
 * Fond flouté d'une image : 96 px floutés par le CDN, quelques Ko, à agrandir en CSS sans
 * filtre (une petite image agrandie est déjà floue). Hors CDN, `null` : l'appelant garde un
 * flou CSS, sur un calque isolé.
 */
export function flou(url: string): string | null {
  if (!surCdn(url)) return null;
  return `${CDN}cdn-cgi/image/width=96,blur=20,format=auto/${url.slice(CDN.length)}`;
}
