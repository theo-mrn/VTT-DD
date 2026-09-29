'use client';

/**
 * Surcouches React des modules (`engine.registerOverlay`) : panneaux flottants de la colonne
 * de gauche (bibliothèque des PNJ, fiche…) et composants sans emplacement (rendu libre, ou
 * composant sans rendu qui relie des données React à un module).
 */
import { useExtensions, useMapEngine } from './engine-context';

export function MapOverlays() {
  const engine = useMapEngine();
  const { overlays } = useExtensions();
  const shown = overlays.filter((o) => (o.available ? o.available(engine.viewer) : true));
  const left = shown.filter((o) => o.slot === 'left');
  const free = shown.filter((o) => o.slot === 'none');
  return (
    <>
      {left.length > 0 && (
        <div className="pointer-events-none absolute bottom-24 left-3 top-20 z-10 flex items-start gap-3 lg:left-[5.75rem]">
          {left.map((o) => (
            <o.component key={o.id} engine={engine} />
          ))}
        </div>
      )}
      {free.map((o) => (
        <o.component key={o.id} engine={engine} />
      ))}
    </>
  );
}
