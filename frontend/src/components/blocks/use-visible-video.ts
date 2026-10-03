'use client';
import React from 'react';
import { prefersReducedMotion } from '@/lib/perf/device';

/** Économie de données demandée par le navigateur. */
function prefersSaveData(): boolean {
  const nav =
    typeof navigator === 'undefined'
      ? null
      : (navigator as Navigator & {
          connection?: { saveData?: boolean };
        });
  return Boolean(nav?.connection?.saveData);
}

/**
 * Vidéo décorative en boucle qui ne joue que lorsqu'elle est à l'écran et que
 * l'onglet est visible : hors champ ou onglet masqué, elle est mise en pause
 * (le décodage vidéo coûte du CPU et du GPU à chaque image). Avec le
 * mouvement réduit ou l'économie de données, elle ne démarre jamais : seule
 * son affiche (`poster`) est montrée. Le lecteur ne doit pas porter `autoPlay`.
 */
export function useVisibleVideo(rootMargin = '100px') {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (prefersReducedMotion() || prefersSaveData()) {
      video.pause();
      return;
    }

    let visible = false;
    const update = () => {
      if (visible && !document.hidden) {
        video.play().catch(() => {
          // Lecture refusée (politique du navigateur) : l'affiche reste.
        });
      } else if (!video.paused) {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { rootMargin },
    );
    observer.observe(video);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [rootMargin]);

  return ref;
}
