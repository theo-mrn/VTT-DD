/**
 * Polices d'un système de jeu (docs/ressources.md, présentation `theme.polices`) : les fichiers
 * qu'il apporte sont déclarés au navigateur (`FontFace`, chargés à la première utilisation), et
 * sa typographie (texte courant, titres) s'applique à toute la table tant qu'elle est ouverte,
 * comme dans l'ancienne app. Ses familles sont aussi proposées pour les textes de la carte.
 */
'use client';

import type { Presentation } from '@vtt/rules';
import { useEffect, useMemo } from 'react';
import { fontsChanged } from '@/lib/map/modules/drawings/text-layout';

const declared = new Set<string>();

/** Adresse d'un fichier de police d'un système (copié par scripts/systemes.mjs). */
export const systemFontUrl = (systemId: string, fichier: string) =>
  `/systemes/polices/${encodeURIComponent(systemId)}/${encodeURIComponent(fichier)}`;

/** Déclare les polices du système au navigateur (une fois chacune) ; renvoie leurs familles. */
export function declareSystemFonts(
  systemId: string,
  presentation: Presentation | null | undefined,
): string[] {
  const fichiers = presentation?.theme?.polices.fichiers ?? [];
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts)
    return fichiers.map((f) => f.famille);
  for (const f of fichiers) {
    const key = `${systemId}/${f.fichier}`;
    if (declared.has(key)) continue;
    declared.add(key);
    try {
      document.fonts.add(
        new FontFace(f.famille, `url(${systemFontUrl(systemId, f.fichier)})`, {
          weight: f.graisse ?? 'normal',
          style: f.style ?? 'normal',
          display: 'swap',
        }),
      );
    } catch {
      declared.delete(key);
    }
  }
  return [...new Set(fichiers.map((f) => f.famille))];
}

/** Familles de polices du système (déclarées au passage). */
export function useSystemFontFamilies(
  systemId: string | null | undefined,
  presentation: Presentation | null | undefined,
): string[] {
  return useMemo(
    () => (systemId ? declareSystemFonts(systemId, presentation) : []),
    [systemId, presentation],
  );
}

/**
 * Typographie du système sur toute la page tant que le composant est monté (table) : `corps`
 * devient la police du texte courant (`--font-sans`), `titres` celle des titres
 * (`--font-display`), chacune avec la police de l'application en secours.
 */
export function useSystemTypography(
  systemId: string | null | undefined,
  presentation: Presentation | null | undefined,
) {
  const corps = presentation?.theme?.polices.corps;
  const titres = presentation?.theme?.polices.titres;
  useSystemFontFamilies(systemId, presentation);
  useEffect(() => {
    if (!corps && !titres) return;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const set: string[] = [];
    const apply = (name: string, family: string | undefined) => {
      if (!family) return;
      const base = style.getPropertyValue(name).trim() || 'sans-serif';
      root.style.setProperty(name, `"${family.replace(/["\\]/g, '')}", ${base}`);
      set.push(name);
    };
    apply('--font-sans', corps);
    apply('--font-display', titres);
    fontsChanged();
    return () => {
      for (const name of set) root.style.removeProperty(name);
      fontsChanged();
    };
  }, [corps, titres]);
}
