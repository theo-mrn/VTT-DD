'use client';

/**
 * Inspecteur de la carte (docs/carte.md § 6) : double clic sur une entité, ou « Inspecter »
 * dans son menu. Panneau flottant à droite ; ses sections viennent des modules (fiche d'un PNJ,
 * propriétés d'un objet…), chacune déclarant la sélection à laquelle elle s'applique.
 */
import { SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import {
  useEntities,
  useExtensions,
  useMapEngine,
  useMapUi,
  useSelectionIds,
} from './engine-context';
import { MapPanel } from './map-panel';

export function MapInspector() {
  const engine = useMapEngine();
  const ids = useMapUi((s) => s.inspector);
  const selection = useSelectionIds();
  const entities = useEntities(ids);
  const { inspectorSections } = useExtensions();
  const sections = useMemo(
    () => inspectorSections.filter((s) => entities.length && s.appliesTo(entities, engine.viewer)),
    [inspectorSections, entities, engine],
  );
  if (!ids || !entities.length) return null;
  // La sélection elle-même : ses réglages sont dans le panneau de la sélection
  if (sameIds(ids, selection)) return null;

  const single = entities.length === 1 ? entities[0]! : null;
  const title = single
    ? (single.kind.name?.(single.data, engine.kindContext()) ?? single.kind.label)
    : `${entities.length} éléments`;
  const subtitle = single
    ? single.kind.label
    : [...new Set(entities.map((e) => e.kind.label))].join(', ');

  return (
    <MapPanel
      id="inspector"
      label={`Inspecteur : ${title}`}
      icon={SlidersHorizontal}
      title={title}
      subtitle={subtitle}
      closeLabel="Fermer l’inspecteur"
      onClose={() => engine.closeInspector()}
      className="w-80"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {sections.length ? (
          sections.map((section) => (
            <section key={section.id} aria-label={section.title} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">
                {section.title}
              </h3>
              <section.component engine={engine} entities={entities} />
            </section>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Rien à régler ici.</p>
        )}
      </div>
    </MapPanel>
  );
}

export const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));
