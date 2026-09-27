'use client';

import { useEffect, useState, type RefObject } from 'react';

/** Largeur d'un élément, suivie par ResizeObserver (le bloc change de taille dans la grille). */
export function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const obs = new ResizeObserver(([e]) => {
      if (e) setWidth(e.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return width;
}
