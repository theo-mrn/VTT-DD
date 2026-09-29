'use client';

/**
 * Cadre commun des panneaux de la carte (inspecteur, calques, bibliothèque des personnages,
 * fiche) : en-tête avec icône, titre, raccourci et fermeture, contenu défilant. On le déplace en
 * glissant son en-tête, il reste dans la fenêtre, et un double clic sur l'en-tête le remet en
 * place (`usePanelDrag`, position gardée par panneau dans ce navigateur).
 */
import { X } from 'lucide-react';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { usePanelDrag } from './use-panel-drag';

export function MapPanel({
  id,
  label,
  icon: Icon,
  title,
  subtitle,
  shortcut,
  closeLabel,
  onClose,
  onKeyDown,
  className,
  children,
}: {
  /** Clé de la position gardée (`vtt:map:panel:<id>`). */
  id: string;
  /** Nom accessible du panneau. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  shortcut?: string;
  closeLabel: string;
  onClose: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** Largeur (`w-80`, `w-[36rem]`…). */
  className?: string;
  children: ReactNode;
}) {
  const drag = usePanelDrag<HTMLElement>(id);
  return (
    <aside
      ref={drag.ref}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto flex max-h-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border-strong bg-background/95 shadow-elevated backdrop-blur-md',
        drag.dragging && 'select-none shadow-2xl',
        className,
      )}
    >
      <header
        {...drag.handleProps}
        title={
          drag.moved
            ? 'Glisser pour déplacer · double clic : remettre en place'
            : 'Glisser pour déplacer'
        }
        className={cn(
          'flex touch-none items-center gap-3 border-b border-border px-4 py-3',
          drag.dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {shortcut && <Kbd aria-hidden>{shortcut}</Kbd>}
        <Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
          <X />
        </Button>
      </header>
      {children}
    </aside>
  );
}
