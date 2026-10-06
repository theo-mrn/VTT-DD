'use client';

/**
 * Surcouches React des modules (`engine.registerOverlay`) : panneaux flottants de la colonne
 * de gauche (bibliothèque des PNJ, fiche…), de la colonne de droite (calques…), et composants
 * sans emplacement (rendu libre, portail, ou composant sans rendu qui relie des données React à
 * un module).
 */
import type { MapOverlay } from '@/lib/map/engine/map-engine';
import { useExtensions, useMapEngine } from './engine-context';

/** Surcouches d'un emplacement, pour ce viewer, dans l'ordre. */
export function OverlaySlot({ slot }: Readonly<{ slot: MapOverlay['slot'] }>) {
  const engine = useMapEngine();
  const { overlays } = useExtensions();
  return overlays
    .filter((o) => o.slot === slot && (o.available ? o.available(engine.viewer) : true))
    .map((o) => <o.component key={o.id} engine={engine} />);
}

/** Colonne de gauche (si un module y a un panneau) et surcouches sans emplacement. */
export function MapOverlays() {
  const engine = useMapEngine();
  const { overlays } = useExtensions();
  const hasLeft = overlays.some(
    (o) => o.slot === 'left' && (o.available ? o.available(engine.viewer) : true),
  );
  return (
    <>
      {hasLeft && (
        <div className="pointer-events-none absolute bottom-24 left-3 top-20 z-10 flex items-start gap-3 lg:left-[5.75rem]">
          <OverlaySlot slot="left" />
        </div>
      )}
      <OverlaySlot slot="none" />
    </>
  );
}
