'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Vignette pré-calculée d'un skin (`public/dice/<skin>.png`) : une simple
 * image, aucun canevas WebGL (la grille de la boutique en affiche des dizaines,
 * et le survol 3D fait planter Chrome sous Windows). Image absente : silhouette
 * neutre. En petit (`small`, jusqu'à 64 px affichés), la variante WebP de 128 px
 * (`public/dice/thumbs/<skin>.webp`, quelques Ko) au lieu du PNG de 512 px.
 */
export function SkinThumbnail({
  skinId,
  alt = '',
  className,
  small = false,
}: {
  skinId: string;
  alt?: string;
  className?: string;
  /** Affichée à 64 px ou moins : vignette WebP de 128 px. */
  small?: boolean;
}) {
  const [absente, setAbsente] = useState<string | null>(null);

  if (absente === skinId)
    return (
      <svg viewBox="0 0 100 100" aria-hidden className={cn('text-subtle opacity-40', className)}>
        <polygon
          points="50,8 88,29 88,71 50,92 12,71 12,29"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
      </svg>
    );

  return (
    // Vignettes statiques servies telles quelles, sans optimisation d'image
    <img
      src={
        small
          ? `/dice/thumbs/${encodeURIComponent(skinId)}.webp`
          : `/dice/${encodeURIComponent(skinId)}.png`
      }
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setAbsente(skinId)}
      className={cn('object-contain', className)}
    />
  );
}
