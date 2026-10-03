'use client';

/**
 * Carte d'un PNJ dans la bibliothèque : un clic l'arme (puis un clic sur la scène la pose),
 * un glisser la dépose sur la scène. Entrée ou Espace l'arment aussi au clavier.
 */
import { Skull } from 'lucide-react';
import type { DragEvent } from 'react';
import { Thumb } from '@/components/resources/parts';
import type { PlacementSource } from '@/lib/map/modules/tokens/state';
import { cn } from '@/lib/utils';

/** Type des données glissées depuis la bibliothèque vers la scène. */
export const NPC_DRAG_TYPE = 'application/x-vtt-npc';

export interface CardDrag {
  onDragStart(e: DragEvent, source: PlacementSource): void;
  onDragEnd(): void;
}

export function LibraryCard({
  source,
  subtitle,
  stats,
  armed,
  drag,
  onArm,
}: Readonly<{
  source: PlacementSource;
  subtitle: string | null;
  stats: readonly { key: string; label: string; value: string }[];
  armed: boolean;
  drag: CardDrag;
  onArm(): void;
}>) {
  return (
    <button
      type="button"
      draggable
      aria-pressed={armed}
      aria-label={`${source.name}${subtitle ? `, ${subtitle}` : ''} : choisir pour la pose`}
      onClick={onArm}
      onDragStart={(e) => drag.onDragStart(e, source)}
      onDragEnd={drag.onDragEnd}
      className={cn(
        'group flex w-full cursor-grab items-center gap-3 rounded-xl border p-2 text-left transition-colors active:cursor-grabbing',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        armed
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-card hover:border-border-strong hover:bg-surface-2',
      )}
    >
      <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2">
        <Skull className="absolute size-4 text-subtle/60" aria-hidden />
        <Thumb
          src={source.imageUrl}
          alt=""
          className="relative size-full object-cover"
          fallback={null}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{source.name}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
        {stats.length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-subtle">
            {stats.map((s) => (
              <span key={s.key}>
                {s.label} <span className="font-medium text-foreground">{s.value}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
