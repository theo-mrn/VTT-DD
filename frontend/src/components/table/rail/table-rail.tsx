'use client';

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Map as IconeCarte,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { cn } from '@/lib/utils';
import { panelDomId } from '../panels/panel-host';
import type { TablePanel } from '../panels/registry';
import { usePanelStore } from '../panels/store';
import { QUICK_NOTE_SHORTCUT } from '../panels/use-table-shortcuts';
import type { RailItem, useRailLayout } from './rail-preferences';

type RailLayout = ReturnType<typeof useRailLayout>;

/**
 * Navigation de la table : rail vertical flottant à gauche (grand écran), dock en bas avec un
 * bouton Carte (mobile). Mêmes panneaux, même ordre personnalisé.
 */
export const TableRail = memo(function TableRail({ layout }: { layout: RailLayout }) {
  const visibles = layout.items.filter((i) => !i.hidden);
  return (
    <>
      <nav
        aria-label="Panneaux de la table"
        className="fixed left-3 top-1/2 z-40 hidden max-h-[calc(100dvh-8rem)] -translate-y-1/2 flex-col items-center gap-1 overflow-y-auto rounded-2xl border border-border-strong bg-popover/95 p-1.5 shadow-elevated lg:flex"
      >
        <PillGroup>
          {visibles.map((i) => (
            <RailButton key={i.panel.id} panel={i.panel} variante="rail" />
          ))}
        </PillGroup>
        <span aria-hidden className="my-1 h-px w-6 bg-border-strong" />
        <RailCustomizer layout={layout} cote="right" />
      </nav>

      <nav
        aria-label="Panneaux de la table"
        className="fixed inset-x-0 bottom-0 z-50 flex h-[var(--table-dock-h)] items-start border-t border-border-strong bg-popover/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
      >
        <div className="no-scrollbar flex w-full items-center gap-0.5 overflow-x-auto">
          <DockMap />
          <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-border-strong" />
          <PillGroup>
            {visibles.map((i) => (
              <RailButton key={i.panel.id} panel={i.panel} variante="dock" />
            ))}
          </PillGroup>
          <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-border-strong" />
          <RailCustomizer layout={layout} cote="top" />
        </div>
      </nav>
    </>
  );
});

function Pastille({ nombre }: Readonly<{ nombre: number }>) {
  return (
    <span
      // Nouvelle valeur : la pastille « saute » (remontée à chaque changement)
      key={nombre}
      aria-hidden
      className="duration-300 ease-out animate-in zoom-in-50 absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-popover"
    >
      {nombre > 99 ? '99+' : nombre}
    </span>
  );
}

function RailButton({
  panel,
  variante,
}: Readonly<{ panel: TablePanel; variante: 'rail' | 'dock' }>) {
  const actif = usePanelStore((s) => s.active === panel.id);
  const monte = usePanelStore((s) => s.mounted.includes(panel.id));
  const badge = usePanelStore((s) => s.badges[panel.id] ?? 0);
  const toggle = usePanelStore((s) => s.toggle);
  const Icone = panel.icon;
  const nouveautes = badge > 0 ? ` (${badge} nouveauté${badge > 1 ? 's' : ''})` : '';

  const bouton = (
    <button
      type="button"
      onClick={() => toggle(panel.id)}
      aria-expanded={actif}
      aria-controls={monte ? panelDomId(panel.id) : undefined}
      aria-keyshortcuts={panel.shortcut?.label}
      aria-label={`${panel.label}${nouveautes}`}
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center transition-[color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95',
        variante === 'rail'
          ? 'size-11 rounded-xl'
          : 'h-12 min-w-14 flex-1 flex-col gap-0.5 rounded-xl px-1 text-[10px] font-medium',
        actif ? 'text-primary' : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
    >
      {actif && <ActivePill className="bg-primary/15" />}
      {variante === 'rail' && actif && (
        <ActivePill
          id="rail-marker"
          className="inset-auto -left-1.5 top-3 z-0 h-5 w-1 rounded-l-none rounded-r-full bg-primary"
        />
      )}
      <Icone className="size-5" aria-hidden />
      {variante === 'dock' && <span className="max-w-full truncate">{panel.label}</span>}
      {badge > 0 && <Pastille nombre={badge} />}
    </button>
  );

  if (variante === 'dock') return bouton;
  return (
    <Info
      cote="right"
      texte={
        <span className="flex items-center gap-2">
          {panel.label}
          {panel.shortcut && <Kbd>{panel.shortcut.label}</Kbd>}
        </span>
      }
    >
      {bouton}
    </Info>
  );
}

/** Mobile : revenir à la carte (ferme le panneau ouvert). */
function DockMap() {
  const surCarte = usePanelStore((s) => s.active === null);
  const close = usePanelStore((s) => s.close);
  return (
    <button
      type="button"
      onClick={close}
      aria-pressed={surCarte}
      className={cn(
        'flex h-12 min-w-14 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        surCarte ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
      )}
    >
      <IconeCarte className="size-5" aria-hidden />
      Carte
    </button>
  );
}

/** Ordre et masquage des panneaux du rail, par boutons (pas de glisser-déposer). */
function RailCustomizer({ layout, cote }: Readonly<{ layout: RailLayout; cote: 'right' | 'top' }>) {
  const { items, move, setHidden, reset, customized } = layout;
  const tousVisibles = items.filter((i) => !i.hidden).length;
  return (
    <Popover>
      <Info texte={cote === 'right' ? 'Personnaliser le rail' : null} cote="right">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Personnaliser la barre des panneaux"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-surface-3 data-[state=open]:text-foreground',
              cote === 'right' ? 'size-11' : 'h-12 w-11',
            )}
          >
            <Settings2 className="size-[18px]" aria-hidden />
          </button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side={cote} align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Barre des panneaux</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ordre et panneaux affichés, pour cette campagne. Un panneau masqué s’ouvre toujours avec
            sa touche.
          </p>
        </div>
        <ul className="max-h-[50dvh] overflow-y-auto p-1.5" aria-label="Panneaux">
          {items.map((i, index) => (
            <LigneCustomizer
              key={i.panel.id}
              item={i}
              premier={index === 0}
              dernier={index === items.length - 1}
              dernierVisible={!i.hidden && tousVisibles === 1}
              onMove={(delta) => move(i.panel.id, delta)}
              onHidden={(h) => setHidden(i.panel.id, h)}
            />
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            Note rapide <Kbd>{QUICK_NOTE_SHORTCUT.label}</Kbd>
          </span>
          <Button variant="ghost" size="xs" onClick={reset} disabled={!customized}>
            <RotateCcw />
            Réinitialiser
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LigneCustomizer({
  item: { panel, hidden },
  premier,
  dernier,
  dernierVisible,
  onMove,
  onHidden,
}: Readonly<{
  item: RailItem;
  premier: boolean;
  dernier: boolean;
  dernierVisible: boolean;
  onMove: (delta: -1 | 1) => void;
  onHidden: (hidden: boolean) => void;
}>) {
  const Icone = panel.icon;
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <Icone
        className={cn('size-4 shrink-0', hidden ? 'text-subtle' : 'text-primary')}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 truncate text-sm', hidden && 'text-subtle line-through')}>
        {panel.label}
      </span>
      {panel.shortcut && <Kbd aria-hidden>{panel.shortcut.label}</Kbd>}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onMove(-1)}
        disabled={premier}
        aria-label={`Monter ${panel.label}`}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onMove(1)}
        disabled={dernier}
        aria-label={`Descendre ${panel.label}`}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onHidden(!hidden)}
        disabled={dernierVisible}
        aria-pressed={!hidden}
        aria-label={hidden ? `Afficher ${panel.label}` : `Masquer ${panel.label}`}
      >
        {hidden ? <EyeOff /> : <Eye />}
      </Button>
    </li>
  );
}
