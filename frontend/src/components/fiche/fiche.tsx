'use client';

/**
 * Fiche générée depuis la présentation : chaque bloc (`widget`) est rendu par
 * son composant, sans rien connaître du jeu. Le cadre pose le thème du
 * système en variables CSS.
 */
import type { Widget } from '@vtt/rules';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { widgetsFiche } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { texte } from './styles';
import { WidgetActions } from './widget-actions';
import { WidgetArbres } from './widget-arbres';
import { WidgetAttributs } from './widget-attributs';
import { WidgetDetails } from './widget-details';
import { WidgetMonnaies } from './widget-monnaies';
import { WidgetPossessions } from './widget-possessions';
import { WidgetRessources } from './widget-ressources';
import { WidgetTexte } from './widget-texte';

/** Cadre aux couleurs du système (le thème global de l'app n'est pas touché). */
export function CadreTheme({ children, className }: { children: ReactNode; className?: string }) {
  const { variables } = useFiche();
  return (
    <div
      style={variables}
      className={cn(
        texte,
        'rounded-3xl bg-[color:var(--fiche-fond)] p-2 font-[family-name:var(--fiche-police-corps)] sm:p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Blocs larges : ils occupent toute la largeur de la fiche. */
const estLarge = (w: Widget) =>
  w.type === 'arbres' || (w.type === 'attributs' && (w.colonnes ?? 0) >= 5);

export function RenduWidget({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'attributs':
      return <WidgetAttributs widget={widget} />;
    case 'ressources':
      return <WidgetRessources widget={widget} />;
    case 'possessions':
      return <WidgetPossessions widget={widget} />;
    case 'arbres':
      return <WidgetArbres widget={widget} />;
    case 'monnaies':
      return <WidgetMonnaies widget={widget} />;
    case 'details':
      return <WidgetDetails widget={widget} />;
    case 'actions':
      return <WidgetActions widget={widget} />;
    case 'texte':
      return <WidgetTexte widget={widget} />;
  }
}

export function FicheGeneree() {
  const { pret, etat, json } = useFiche();
  const widgets = widgetsFiche(pret, etat.type);

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
          <div
            key={i}
            className={cn('mb-4 break-inside-avoid', estLarge(w) && '[column-span:all]')}
          >
            <RenduWidget widget={w} />
          </div>
        ))}
      </div>
    </div>
  );
}
