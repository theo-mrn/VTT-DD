'use client';

/**
 * Inspecteur de la carte (docs/carte.md § 6) : double clic sur une entité, ou « Inspecter »
 * dans son menu. Panneau flottant à droite ; ses sections viennent des modules (fiche d'un PNJ,
 * propriétés d'un objet…), chacune déclarant la sélection à laquelle elle s'applique.
 */
import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useEntities, useExtensions, useMapEngine, useMapUi } from './engine-context';

export function MapInspector() {
  const engine = useMapEngine();
  const ids = useMapUi((s) => s.inspector);
  const entities = useEntities(ids);
  const { inspectorSections } = useExtensions();
  const sections = useMemo(
    () => inspectorSections.filter((s) => entities.length && s.appliesTo(entities, engine.viewer)),
    [inspectorSections, entities, engine],
  );
  if (!ids || !entities.length) return null;

  const single = entities.length === 1 ? entities[0]! : null;
  const title = single
    ? (single.kind.name?.(single.data, engine.kindContext()) ?? single.kind.label)
    : `${entities.length} éléments`;
  const subtitle = single
    ? single.kind.label
    : [...new Set(entities.map((e) => e.kind.label))].join(', ');

  return (
    <aside
      aria-label={`Inspecteur : ${title}`}
      className="pointer-events-auto flex max-h-full w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border-strong bg-background/95 shadow-elevated backdrop-blur-md"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <SlidersHorizontal className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer l’inspecteur"
          onClick={() => engine.closeInspector()}
        >
          <X />
        </Button>
      </header>
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
    </aside>
  );
}
