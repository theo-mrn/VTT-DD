'use client';

import type { Action, Widget } from '@vtt/rules';
import { useEffect, useState } from 'react';
import { ActionsPanel, type ActionTarget } from '@/components/(dices)/actions-panel';
import { listCharacters } from '@/lib/characters';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';

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
 * Actions de la fiche : paramètres, aperçu du jet, lancer par le serveur et
 * résultat. Cibles : mes autres personnages du même système (les salles de
 * campagne élargiront la liste aux personnages engagés).
 */
export function ActionsWidget({ widget }: { widget: ActionsWidgetProps }) {
  const s = useSheet();
  const [targets, setTargets] = useState<ActionTarget[]>([]);
  const systemId = s.system.source.id;
  const selfId = s.character.id;

  useEffect(() => {
    let active = true;
    listCharacters()
      .then((list) => {
        if (!active) return;
        setTargets(
          list
            .filter((c) => c.id !== selfId && c.systeme.id === systemId && !c.creation)
            .map((c) => ({ id: c.id, name: c.nom, type: c.type })),
        );
      })
      .catch(() => active && setTargets([]));
    return () => {
      active = false;
    };
  }, [selfId, systemId]);

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
