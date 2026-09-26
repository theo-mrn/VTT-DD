'use client';

import type { Action, Widget } from '@vtt/rules';
import { Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';
import { secondaryButton, text, textMuted } from './styles';

type ActionsWidgetProps = Extract<Widget, { type: 'actions' }>;

/** Actions du système utilisables par ce type d'entité (liste du bloc, sinon toutes). */
export function blockActions(actions: Map<string, Action>, type: string, ids?: string[]): Action[] {
  const list = ids
    ? ids.flatMap((id) => {
        const a = actions.get(id);
        return a ? [a] : [];
      })
    : [...actions.values()];
  return list.filter((a) => a.pour.includes(type));
}

/**
 * Emplacement des actions de la fiche. Le lanceur (paramètres, jet, résultat)
 * sera branché ici : en attendant, la liste s'affiche avec un bouton désactivé.
 */
export function ActionsWidget({ widget }: { widget: ActionsWidgetProps }) {
  const { system, state } = useSheet();
  const actions = blockActions(system.actions, state.type, widget.actions);

  return (
    <Block title={widget.titre}>
      {actions.length ? (
        <ul className="divide-y divide-[color:var(--fiche-bordure)]">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn(text, 'block truncate text-sm')}>{a.nom}</span>
                {a.description && (
                  <span className={cn(textMuted, 'line-clamp-1 block text-xs')}>
                    {a.description}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled
                className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
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
        <SheetEmpty>Aucune action pour ce type d&apos;entité.</SheetEmpty>
      )}
    </Block>
  );
}
