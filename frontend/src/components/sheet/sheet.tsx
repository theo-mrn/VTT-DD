'use client';

/**
 * Fiche du personnage, reprise de l'ancienne app : barre des personnages,
 * cadre doré, portrait et résumé en tête, puis les blocs de la présentation
 * (`presentation.fiches[type].widgets`) dans leur ordre, chacun rendu par le
 * composant de son type (voir registry.ts). Rien ici ne connaît le jeu.
 */
import type { Widget } from '@vtt/rules';
import { AlertTriangle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { sheetWidgets } from '@/lib/systems';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './avatar';
import { useSheet } from './context';
import { SheetFrame, WidgetBoundary } from './frame';
import { widgetComponent } from './registry';
import { SheetToolbar } from './sheet-toolbar';
import { text } from './styles';
import { DetailsPanel } from './widget-details';

/** Cadre aux couleurs du système (le thème global de l'app n'est pas touché). */
export function ThemeFrame({ children, className }: { children: ReactNode; className?: string }) {
  const { variables } = useSheet();
  return (
    <div
      style={variables}
      className={cn(
        text,
        'rounded-3xl bg-[color:var(--fiche-fond)] p-2 font-[family-name:var(--fiche-police-corps)] sm:p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Blocs larges : ils occupent toute la largeur de la fiche. */
export const isWideWidget = (w: Widget) =>
  w.type === 'arbres' || (w.type === 'attributs' && (w.colonnes ?? 0) >= 5);

/** Rend un bloc avec le composant enregistré pour son type. */
export function WidgetRenderer({ widget }: { widget: Widget }) {
  const sheet = useSheet();
  const Component = widgetComponent(widget);
  return (
    <WidgetBoundary title={widget.titre}>
      <Component widget={widget} sheet={sheet} />
    </WidgetBoundary>
  );
}

function CalculationErrors() {
  const { json } = useSheet();
  if (!json.erreurs.length) return null;
  return (
    <details className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
      <summary className="flex cursor-pointer items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Le calcul de la fiche signale {json.erreurs.length} problème
        {json.erreurs.length > 1 ? 's' : ''}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
        {json.erreurs.map((e, i) => (
          <li key={i}>
            <code>{e.ou}</code> : {e.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Blocs de la présentation, en deux colonnes sur grand écran (les larges traversent). */
export function GeneratedSheet({ widgets }: { widgets?: Widget[] }) {
  const { ready, state } = useSheet();
  const list = widgets ?? sheetWidgets(ready, state.type);
  return (
    <div className="gap-4 md:gap-5 lg:columns-2">
      {list.map((w, i) => (
        <div
          key={`${w.type}-${i}`}
          className={cn('mb-4 break-inside-avoid md:mb-5', isWideWidget(w) && '[column-span:all]')}
        >
          <WidgetRenderer widget={w} />
        </div>
      ))}
    </div>
  );
}

/** Fiche complète : barre, cadre, portrait et résumé, puis les autres blocs. */
export function CharacterSheet() {
  const { ready, system, state, character, readOnly, variables } = useSheet();
  const widgets = sheetWidgets(ready, state.type);
  // Le premier bloc « details » rejoint le portrait en tête, comme dans l'ancienne fiche
  const detailsIndex = widgets.findIndex((w) => w.type === 'details');
  const details = detailsIndex >= 0 ? widgets[detailsIndex] : undefined;
  const rest = widgets.filter((_, i) => i !== detailsIndex);

  return (
    <div style={variables} className="relative p-0 sm:p-2">
      <SheetToolbar />

      {state.creation && (
        <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:color-mix(in_srgb,var(--fiche-accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] px-4 py-3 text-sm text-[color:var(--fiche-accent)]">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            La création de ce personnage n&apos;est pas terminée.
          </span>
          {!readOnly && (
            <Link
              href={`/characters/${character.id}/creation`}
              className="rounded-lg bg-[color:var(--fiche-accent)] px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-[color:var(--fiche-accent-survol)]"
            >
              Reprendre la création
            </Link>
          )}
        </div>
      )}

      <SheetFrame>
        <div className="space-y-4 md:space-y-6">
          <CalculationErrors />
          <div className="grid gap-4 sm:grid-cols-3 md:gap-5">
            <CharacterAvatar className="aspect-square w-full max-w-64 justify-self-center sm:max-w-none" />
            <WidgetBoundary title="Profil">
              <DetailsPanel
                widget={details?.type === 'details' ? details : undefined}
                heading={
                  <>
                    {character.nom}
                    <span className="mt-0.5 block font-[family-name:var(--fiche-police-corps)] text-xs font-normal opacity-80">
                      {system.entites.get(state.type)?.type.nom ?? state.type} · {system.source.nom}
                    </span>
                  </>
                }
                infos
                className="sm:col-span-2"
              />
            </WidgetBoundary>
          </div>
          <GeneratedSheet widgets={rest} />
        </div>
      </SheetFrame>
    </div>
  );
}
