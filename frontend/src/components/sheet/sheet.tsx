'use client';

/**
 * Fiche générée depuis la présentation : chaque bloc (`widget`) est rendu par
 * son composant, sans rien connaître du jeu. Le cadre pose le thème du
 * système en variables CSS.
 */
import type { Widget } from '@vtt/rules';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { sheetWidgets } from '@/lib/systems';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { text } from './styles';
import { ActionsWidget } from './widget-actions';
import { TreesWidget } from './widget-trees';
import { AttributesWidget } from './widget-attributes';
import { DetailsWidget } from './widget-details';
import { CurrenciesWidget } from './widget-currencies';
import { PossessionsWidget } from './widget-possessions';
import { ResourcesWidget } from './widget-resources';
import { TextWidget } from './widget-text';

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
const isWide = (w: Widget) =>
  w.type === 'arbres' || (w.type === 'attributs' && (w.colonnes ?? 0) >= 5);

export function WidgetRenderer({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'attributs':
      return <AttributesWidget widget={widget} />;
    case 'ressources':
      return <ResourcesWidget widget={widget} />;
    case 'possessions':
      return <PossessionsWidget widget={widget} />;
    case 'arbres':
      return <TreesWidget widget={widget} />;
    case 'monnaies':
      return <CurrenciesWidget widget={widget} />;
    case 'details':
      return <DetailsWidget widget={widget} />;
    case 'actions':
      return <ActionsWidget widget={widget} />;
    case 'texte':
      return <TextWidget widget={widget} />;
  }
}

export function GeneratedSheet() {
  const { ready, state, json } = useSheet();
  const widgets = sheetWidgets(ready, state.type);

  return (
    <div className="space-y-4">
      {json.erreurs.length > 0 && (
        <details className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
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
      )}
      {/* Deux colonnes sur grand écran : les blocs s'enchaînent sans trous, les larges traversent */}
      <div className="gap-4 lg:columns-2">
        {widgets.map((w, i) => (
          <div key={i} className={cn('mb-4 break-inside-avoid', isWide(w) && '[column-span:all]')}>
            <WidgetRenderer widget={w} />
          </div>
        ))}
      </div>
    </div>
  );
}
