'use client';

/**
 * Briques de la barre d'outils de la carte (docs/carte.md § 6, Fonctions branchables) : bouton
 * avec info-bulle et touche, séparateur, bouton à menu, bouton d'une action. Une entrée
 * `custom` d'un module s'en sert : elle ne refait pas son bouton.
 */
import { useState, type ReactNode } from 'react';
import { ActivePill } from '@/components/ui/active-pill';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { ActionStatus, MapAction, ToolbarEntry } from '@/lib/map/engine/toolbar';
import { cn } from '@/lib/utils';
import { useMapEngine } from '../engine-context';

/** Rend le focus à la carte après un clic dans la barre (les raccourcis reprennent). */
export function focusMap(engine: MapEngine) {
  engine.canvas?.parentElement?.focus({ preventScroll: true });
}

export function ToolbarSeparator() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

function Tip({ label, shortcut }: Readonly<{ label: string; shortcut?: string }>) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </span>
  );
}

export function ToolbarButton({
  label,
  shortcut,
  active,
  glide,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  shortcut?: string;
  active?: boolean;
  /** Outil : la pastille glisse d'un outil à l'autre (un seul actif à la fois). */
  glide?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}>) {
  return (
    <Info texte={<Tip label={label} shortcut={shortcut} />}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        aria-keyshortcuts={shortcut}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'relative isolate',
          active && 'text-primary hover:text-primary',
          active && (glide ? 'hover:bg-transparent' : 'bg-primary/15 hover:bg-primary/20'),
        )}
      >
        {active && glide && <ActivePill className="bg-primary/15" />}
        {children}
      </Button>
    </Info>
  );
}

const NO_STATUS = (): ActionStatus => ({});

/** Bouton d'une action : libellé, touche, grisé et enfoncé selon son `useStatus`. */
export function ActionButton({ action }: Readonly<{ action: MapAction }>) {
  const engine = useMapEngine();
  const useStatus = action.useStatus ?? NO_STATUS;
  const status = useStatus(engine);
  const Icon = action.icon;
  return (
    <ToolbarButton
      label={status.label ?? action.label}
      shortcut={action.shortcut?.label ?? action.hint}
      active={status.active}
      disabled={status.enabled === false}
      onClick={() => {
        action.run(engine);
        focusMap(engine);
      }}
    >
      <Icon />
    </ToolbarButton>
  );
}

type MenuEntry = Extract<ToolbarEntry, { kind: 'menu' }>;

/** Bouton qui ouvre le menu d'une entrée `menu`, au-dessus de la barre. */
export function MenuButton({ entry }: Readonly<{ entry: MenuEntry }>) {
  const engine = useMapEngine();
  const [open, setOpen] = useState(false);
  const useStatus = entry.useStatus ?? NO_STATUS;
  const status = useStatus(engine);
  const label = status.label ?? entry.label;
  const Icon = entry.icon;
  const Content = entry.content;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(status.active && 'text-primary')}
          >
            <Icon />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className={cn('w-64 p-2', entry.className)}>
        <Content engine={engine} />
      </PopoverContent>
    </Popover>
  );
}
