'use client';

import { Suspense } from 'react';
import { tableFeatures } from '.';

/**
 * Surcouches des fonctions (`overlay` d'un manifeste) : toujours montées au-dessus de la carte,
 * chez tous (un minuteur lancé par le MJ se voit des joueurs), que la fonction soit masquée du
 * rail ou non ; la surcouche décide elle-même de ce qu'elle montre selon le rôle.
 */
export function OverlayHost() {
  return (
    <>
      {tableFeatures.map((f) => {
        const Overlay = 'overlay' in f ? f.overlay : undefined;
        return Overlay ? (
          <Suspense key={f.id} fallback={null}>
            <Overlay />
          </Suspense>
        ) : null;
      })}
    </>
  );
}
