'use client';

import type { Action, Widget } from '@vtt/rules';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActionsPanel, type ActionTarget } from '@/components/(dices)/actions-panel';
import { listCharacters } from '@/lib/characters';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';

type ActionsWidgetProps = Extract<Widget, { type: 'actions' }>;

/** Cibles fournies par la page (personnages engagés dans la salle) ; sinon, mes personnages. */
const TargetsContext = createContext<ActionTarget[] | null>(null);

export function ActionTargetsProvider({
  targets,
  children,
}: {
  targets: ActionTarget[];
  children: ReactNode;
}) {
  return <TargetsContext.Provider value={targets}>{children}</TargetsContext.Provider>;
}

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
 * Actions de la fiche : paramètres, aperçu du jet, lancer par le serveur et
 * résultat. Cibles : les personnages de la salle quand la page les fournit
 * (table de jeu), sinon mes autres personnages du même système.
 */
export function ActionsWidget({ widget }: { widget: ActionsWidgetProps }) {
  const s = useSheet();
  const provided = useContext(TargetsContext);
  const [own, setOwn] = useState<ActionTarget[]>([]);
  const targets = provided ?? own;
  const systemId = s.system.source.id;
  const selfId = s.character.id;

  useEffect(() => {
    if (provided) return;
    let active = true;
    listCharacters()
      .then((list) => {
        if (!active) return;
        setOwn(
          list
            .filter((c) => c.id !== selfId && c.systeme.id === systemId && !c.creation)
            .map((c) => ({ id: c.id, name: c.nom, type: c.type })),
        );
      })
      .catch(() => active && setOwn([]));
    return () => {
      active = false;
    };
  }, [selfId, systemId, provided]);

  if (!blockActions(s.system.actions, s.state.type, widget.actions).length) {
    return (
      <Block title={widget.titre}>
        <SheetEmpty>Aucune action pour ce type d&apos;entité.</SheetEmpty>
      </Block>
    );
  }
  return (
    <Block title={widget.titre}>
      <ActionsPanel
        characterId={selfId}
        system={s.system}
        presentation={s.presentation}
        sheet={s.sheet}
        name={s.character.nom}
        targets={targets}
        {...(widget.actions ? { actions: widget.actions } : {})}
        onApplied={() => s.reload()}
      />
    </Block>
  );
}
