'use client';

/**
 * Barre d'outils de la carte (docs/carte.md § 6, Fonctions branchables) : les outils et les
 * entrées des modules, rangés par groupes (`toolbarGroups`), un séparateur entre deux groupes.
 * Elle ne connaît aucune fonction. Les réglages de l'outil actif s'affichent au-dessus.
 */
import { Fragment, useMemo } from 'react';
import { useStore } from 'zustand';
import { PillGroup } from '@/components/ui/active-pill';
import { attackMenuStore } from '@/lib/combat/attack-menu-store';
import { toolbarGroups, type ToolbarSlot } from '@/lib/map/engine/toolbar';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import { cn } from '@/lib/utils';
import {
  useActiveToolId,
  useExtensions,
  useMapEngine,
  useToolDefinitions,
} from '../engine-context';
import { ActionButton, focusMap, MenuButton, ToolbarButton, ToolbarSeparator } from './kit';

export function MapToolbar() {
  const engine = useMapEngine();
  const viewer = engine.viewer;
  const definitions = useToolDefinitions();
  const activeId = useActiveToolId();
  const { toolbarEntries } = useExtensions();

  const sections = useMemo(
    () => toolbarGroups(definitions, toolbarEntries, viewer),
    [definitions, toolbarEntries, viewer],
  );
  const active = definitions.find((d) => d.id === activeId);
  const Options = active?.options;

  // Attaque en cours (menu ouvert, visée, dés) : la barre s'efface, elle revient à la fin
  const campaignId = engine.store.getState().campaignId;
  const attacking = useStore(
    attackMenuStore,
    (s) => s.flow.phase !== 'closed' && s.flow.campaignId === campaignId,
  );

  return (
    <div
      inert={attacking}
      aria-hidden={attacking || undefined}
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3',
        'transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
        attacking && 'translate-y-6 opacity-0',
      )}
    >
      {Options && (
        <div
          key={activeId}
          className="pointer-events-auto max-w-full rounded-xl border border-border-strong bg-background/95 px-2 py-1.5 shadow-elevated duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2"
        >
          <Options engine={engine} />
        </div>
      )}
      <PillGroup>
        <div
          role="toolbar"
          aria-label="Outils de la carte"
          className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border-strong bg-background/95 p-1.5 shadow-elevated [scrollbar-width:none]"
        >
          {sections.map((section, i) => (
            <Fragment key={section.group}>
              {i > 0 && <ToolbarSeparator />}
              {section.slots.map((slot) => (
                <Slot key={slot.id} slot={slot} activeId={activeId} />
              ))}
            </Fragment>
          ))}
        </div>
      </PillGroup>
    </div>
  );
}

function Slot({ slot, activeId }: Readonly<{ slot: ToolbarSlot; activeId: string }>) {
  const engine = useMapEngine();
  switch (slot.kind) {
    case 'tool': {
      const Icon = slot.tool.icon;
      return (
        <ToolbarButton
          label={slot.tool.label}
          shortcut={slot.tool.shortcut?.label}
          active={slot.id === activeId}
          glide
          onClick={() => {
            // Recliquer sur l'outil actif le referme (son menu avec) : retour à la sélection
            engine.tools.activate(
              slot.id === activeId && slot.id !== SELECT_TOOL_ID ? SELECT_TOOL_ID : slot.id,
            );
            focusMap(engine);
          }}
        >
          <Icon />
        </ToolbarButton>
      );
    }
    case 'action':
      return <ActionButton action={slot.action} />;
    case 'menu':
      return <MenuButton entry={slot} />;
    case 'custom':
      return <slot.component engine={engine} />;
  }
}
