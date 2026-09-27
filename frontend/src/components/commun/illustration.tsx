'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Teinte stable dérivée d'un texte : chaque campagne ou héros garde sa couleur. */
export function teinte(graine: string): number {
  let h = 0;
  for (let i = 0; i < graine.length; i++) h = (h * 31 + graine.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function degradeDe(graine: string) {
  const h = teinte(graine);
  return `radial-gradient(120% 90% at 20% 0%, hsl(${h} 55% 30% / 0.9), transparent 60%), radial-gradient(100% 80% at 100% 100%, hsl(${(h + 50) % 360} 60% 22% / 0.9), transparent 55%), linear-gradient(160deg, hsl(${h} 30% 12%), hsl(${(h + 30) % 360} 25% 6%))`;
}

/**
 * Image de couverture (campagne, portrait, race…) avec repli élégant : un
 * dégradé propre à `graine` et une initiale, si l'image manque ou échoue.
 */
export function Illustration({
  src,
  graine,
  alt = '',
  initiale,
  className,
  classeImage,
  voile = false,
  children,
  position = 'center',
}: {
  src: string | null | undefined;
  graine: string;
  alt?: string;
  /** Lettre affichée sur le dégradé de repli (par défaut, la première de `graine`). */
  initiale?: string | false;
  className?: string;
  classeImage?: string;
  /** Voile sombre en bas, pour poser du texte sur l'image. */
  voile?: boolean;
  children?: ReactNode;
  position?: 'center' | 'top';
}) {
  const [echec, setEchec] = useState<string | null>(null);
  const image = src && echec !== src ? src : null;
  const lettre = initiale === false ? null : (initiale ?? graine.trim().charAt(0).toUpperCase());

  return (
    <div className={cn('relative isolate overflow-hidden bg-surface-2', className)}>
      {image ? (
        <img
          src={image}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setEchec(image)}
          className={cn(
            'absolute inset-0 size-full object-cover',
            position === 'top' && 'object-top',
            classeImage,
          )}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 [container-type:size]"
          style={{ background: degradeDe(graine) }}
        >
          <div className="absolute inset-0 bg-dots opacity-40 mask-radial" />
          {lettre && (
            <span className="absolute inset-0 flex items-center justify-center font-display text-[clamp(1rem,min(40cqh,28cqw),7rem)] font-semibold text-white/15">
              {lettre}
            </span>
          )}
        </div>
      )}
      {voile && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
        />
      )}
      {children}
    </div>
  );
}
