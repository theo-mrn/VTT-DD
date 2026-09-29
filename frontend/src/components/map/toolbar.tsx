'use client';

/**
 * Barre d'outils de la carte (docs/carte.md § 6) : les outils fournis par les modules (outil
 * actif, raccourci affiché), annuler et refaire, l'emplacement « Vue » (module vision),
 * « Calques » (panneau des calques du MJ, K), « Affichage » (familles affichées, MJ),
 * « Montrer mon curseur » et « Recadrer ». Les réglages de l'outil actif s'affichent au-dessus.
 */
import { Focus, Layers, MousePointerClick, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import { DISPLAY_TOGGLES, displayOf, isDisplayed } from '@/lib/map/engine/planes';
import { cn } from '@/lib/utils';
import {
  useActiveToolId,
  useCommandsState,
  useExtensions,
  useMapEngine,
  useMapState,
  useMapUi,
  useToolDefinitions,
} from './engine-context';

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '')
    ? '⌘'
    : 'Ctrl+';

function Separator() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Info
      texte={
        <span className="flex items-center gap-2">
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        aria-keyshortcuts={shortcut}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
        )}
      >
        {children}
      </Button>
    </Info>
  );
}

export function MapToolbar() {
  const engine = useMapEngine();
  const viewer = engine.viewer;
  const gm = viewer.role === 'gm';
  const definitions = useToolDefinitions();
  const activeId = useActiveToolId();
  const commands = useCommandsState();
  const { toolbarItems } = useExtensions();
  const layersOpen = useMapUi((s) => s.layersPanel);
  const shareCursor = useMapUi((s) => s.shareCursor);

  const tools = useMemo(
    () =>
      definitions.filter(
        (d) => !d.hidden && (d.available ? d.available(viewer) : viewer.role === 'gm'),
      ),
    [definitions, viewer],
  );
  const active = definitions.find((d) => d.id === activeId);
  const Options = active?.options;
  const items = (slot: 'view' | 'end') =>
    toolbarItems.filter((i) => i.slot === slot && (i.available ? i.available(viewer) : true));

  const focusMap = () => engine.canvas?.parentElement?.focus({ preventScroll: true });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3">
      {Options && (
        <div className="pointer-events-auto max-w-full rounded-xl border border-border-strong bg-background/90 px-2 py-1.5 shadow-elevated backdrop-blur-md">
          <Options engine={engine} />
        </div>
      )}
      <div
        role="toolbar"
        aria-label="Outils de la carte"
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border-strong bg-background/90 p-1.5 shadow-elevated backdrop-blur-md [scrollbar-width:none]"
      >
        {tools.map((def) => {
          const Icon = def.icon;
          return (
            <ToolbarButton
              key={def.id}
              label={def.label}
              shortcut={def.shortcut?.label}
              active={def.id === activeId}
              onClick={() => {
                engine.tools.activate(def.id);
                focusMap();
              }}
            >
              <Icon />
            </ToolbarButton>
          );
        })}

        {viewer.role !== 'spectator' && (
          <>
            <Separator />
            <ToolbarButton
              label={commands.undoLabel ? `Annuler « ${commands.undoLabel} »` : 'Annuler'}
              shortcut={`${MOD}Z`}
              disabled={!commands.canUndo}
              onClick={() => void engine.commands.undo()}
            >
              <Undo2 />
            </ToolbarButton>
            <ToolbarButton
              label={commands.redoLabel ? `Refaire « ${commands.redoLabel} »` : 'Refaire'}
              shortcut={`${MOD}⇧Z`}
              disabled={!commands.canRedo}
              onClick={() => void engine.commands.redo()}
            >
              <Redo2 />
            </ToolbarButton>
          </>
        )}

        {(items('view').length > 0 || gm) && <Separator />}
        {items('view').map((item) => (
          <item.component key={item.id} engine={engine} />
        ))}
        {gm && (
          <>
            <ToolbarButton
              label="Calques"
              shortcut="K"
              active={layersOpen}
              onClick={() => engine.toggleLayersPanel()}
            >
              <Layers />
            </ToolbarButton>
            <DisplayMenu />
          </>
        )}

        <Separator />
        {viewer.role !== 'spectator' && (
          <ToolbarButton
            label={shareCursor ? 'Cacher mon curseur' : 'Montrer mon curseur'}
            active={shareCursor}
            onClick={() => engine.setShareCursor(!shareCursor)}
          >
            <MousePointerClick />
          </ToolbarButton>
        )}
        <ToolbarButton label="Recadrer la vue" onClick={() => engine.fitView()}>
          <Focus />
        </ToolbarButton>
        {items('end').map((item) => (
          <item.component key={item.id} engine={engine} />
        ))}
      </div>
    </div>
  );
}

/** « Affichage » (MJ) : familles entières affichées ou masquées pour toute la table. */
function DisplayMenu() {
  const engine = useMapEngine();
  const scene = useMapState((s) => s.scene);
  const display = displayOf(scene);
  return (
    <Popover>
      <Info texte="Affichage">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Affichage">
            <SlidersHorizontal />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className="w-64 p-3">
        <p className="mb-1 text-sm font-semibold">Affichage</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Familles montrées à toute la table. Les calques se gèrent à part (K).
        </p>
        <ul className="space-y-2">
          {DISPLAY_TOGGLES.map((t) => {
            const shown = isDisplayed(display, t.key);
            return (
              <li key={t.key} className="flex items-center justify-between gap-3">
                <label htmlFor={`display-${t.key}`} className="text-[13px]">
                  {t.label}
                </label>
                <Switch
                  id={`display-${t.key}`}
                  checked={shown}
                  onCheckedChange={(on) =>
                    void engine.updateScene('Affichage', { display: { ...display, [t.key]: on } })
                  }
                />
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
