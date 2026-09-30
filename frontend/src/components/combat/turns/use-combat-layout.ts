/**
 * Largeur du panneau Combat, mesurée (requête de conteneur) : la mise en page (`layout.ts`)
 * suit la place qu'a le panneau, pas la taille de l'écran. Mesure avant le premier affichage
 * (pas de saut), puis à chaque redimensionnement ; seul un changement de mise en page
 * provoque un nouveau rendu.
 */
'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { combatLayout, type CombatLayout } from './layout';

const same = (a: CombatLayout, b: CombatLayout) =>
  a.mode === b.mode && a.reportColumns === b.reportColumns && a.compactHeader === b.compactHeader;

export function useCombatLayout<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [layout, setLayout] = useState<CombatLayout>(() => combatLayout(0));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) =>
      setLayout((current) => {
        const next = combatLayout(width);
        return same(current, next) ? current : next;
      });
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) measure(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, layout] as const;
}
