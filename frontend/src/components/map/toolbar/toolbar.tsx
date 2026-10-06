'use client';

/**
 * Barre d'outils de la carte (docs/carte.md § 6, Fonctions branchables) : les outils et les
 * entrées des modules, rangés par groupes (`toolbarGroups`) selon la disposition de
 * l'utilisateur, un séparateur entre deux groupes. Elle ne connaît aucune fonction. Les
 * réglages de l'outil actif s'affichent au-dessus ; un clic droit la personnalise.
 */
import { Fragment, useMemo, useState } from 'react';
import { PillGroup } from '@/components/ui/active-pill';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { toolbarGroups, type ToolbarSlot } from '@/lib/map/engine/toolbar';
import { toolbarLayoutStore, useToolbarLayout } from '@/lib/map/toolbar-layout';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import { cn } from '@/lib/utils';
import {
  useActiveToolId,
  useExtensions,
  useMapEngine,
  useMapUi,
  useToolDefinitions,
} from '../engine-context';
import { ToolbarCustomizer } from './customize';
import { ActionButton, focusMap, MenuButton, ToolbarButton, ToolbarSeparator } from './kit';

export function MapToolbar() {
  const engine = useMapEngine();
  const viewer = engine.viewer;
  const definitions = useToolDefinitions();
  const activeId = useActiveToolId();
  const { toolbarEntries } = useExtensions();
  const layout = useToolbarLayout();
  const [customizing, setCustomizing] = useState(false);

  const sections = useMemo(
    () => toolbarGroups(definitions, toolbarEntries, viewer, layout),
    [definitions, toolbarEntries, viewer, layout],
  );
  const allSections = useMemo(
    () => toolbarGroups(definitions, toolbarEntries, viewer, layout, true),
    [definitions, toolbarEntries, viewer, layout],
  );
  const active = definitions.find((d) => d.id === activeId);
  const Options = active?.options;

  // Un module l'efface (combat : attaque en cours) ; elle revient quand il la rend
  const hidden = useMapUi((s) => s.toolbarHiddenBy.length > 0);

  return (
    <div
      inert={hidden}
      aria-hidden={hidden || undefined}
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3',
        'transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
        hidden && 'translate-y-6 opacity-0',
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
      <Popover open={customizing} onOpenChange={setCustomizing}>
        <PillGroup>
          <PopoverAnchor asChild>
            <div
              role="toolbar"
              aria-label="Outils de la carte"
              onContextMenu={(e) => {
                e.preventDefault();
                setCustomizing(true);
              }}
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
          </PopoverAnchor>
        </PillGroup>
        <PopoverContent side="top" sideOffset={10} className="w-72 p-2">
          <ToolbarCustomizer
            sections={allSections}
            layout={layout}
            onChange={(next) => toolbarLayoutStore().set(next)}
            onReset={() => toolbarLayoutStore().reset()}
          />
        </PopoverContent>
      </Popover>
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
