'use client';

import type { Action, Widget } from '@vtt/rules';
import { Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { Bloc, VideFiche } from './elements';
import { boutonSecondaire, texte, texteSecondaire } from './styles';

type WidgetActionsProps = Extract<Widget, { type: 'actions' }>;

/** Actions du système utilisables par ce type d'entité (liste du bloc, sinon toutes). */
export function actionsDuBloc(
  actions: Map<string, Action>,
  type: string,
  ids?: string[],
): Action[] {
  const liste = ids
    ? ids.flatMap((id) => {
        const a = actions.get(id);
        return a ? [a] : [];
      })
    : [...actions.values()];
  return liste.filter((a) => a.pour.includes(type));
}

/**
 * Emplacement des actions de la fiche. Le lanceur (paramètres, jet, résultat)
 * sera branché ici : en attendant, la liste s'affiche avec un bouton désactivé.
 */
export function WidgetActions({ widget }: { widget: WidgetActionsProps }) {
  const { systeme, etat } = useFiche();
  const actions = actionsDuBloc(systeme.actions, etat.type, widget.actions);

  return (
    <Bloc titre={widget.titre}>
      {actions.length ? (
        <ul className="divide-y divide-[color:var(--fiche-bordure)]">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn(texte, 'block truncate text-sm')}>{a.nom}</span>
                {a.description && (
                  <span className={cn(texteSecondaire, 'line-clamp-1 block text-xs')}>
                    {a.description}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled
                className={cn(boutonSecondaire, 'min-h-8 px-2.5 text-xs')}
                title="Le lanceur d'actions arrive bientôt"
                aria-label={`${a.nom} : bientôt disponible`}
              >
                <Dices />
                Bientôt
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <VideFiche>Aucune action pour ce type d&apos;entité.</VideFiche>
      )}
    </Bloc>
  );
}
