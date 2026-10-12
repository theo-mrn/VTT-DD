'use client';

/**
 * Carte d'un PNJ dans la bibliothèque : un clic l'arme (puis un clic sur la scène la pose),
 * un glisser la dépose sur la scène. Entrée ou Espace l'arment aussi au clavier.
 */
import { translate } from '@/i18n/runtime';
import { Skull } from 'lucide-react';
import type { DragEvent } from 'react';
import { Thumb } from '@/components/resources/parts';
import type { PlacementSource } from '../engine/state';
import { cn } from '@/lib/utils';

/** Type des données glissées depuis la bibliothèque vers la scène. */
export const NPC_DRAG_TYPE = 'application/x-vtt-npc';

/** Diamètre de l'aperçu glissé (px CSS). */
const DRAG_SIZE = 56;

/**
 * Aperçu du glisser : le portrait de la carte en rond (comme le jeton), au lieu de la carte
 * entière. Dessiné dans un canevas posé hors écran le temps que le navigateur le capture.
 */
export function setRoundDragImage(e: DragEvent) {
  const img = (e.currentTarget as HTMLElement).querySelector('img');
  if (!img?.complete || !img.naturalWidth) return;
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = DRAG_SIZE * ratio;
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    width: `${DRAG_SIZE}px`,
    height: `${DRAG_SIZE}px`,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = (DRAG_SIZE * ratio) / 2;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * ratio, 0, Math.PI * 2);
  ctx.clip();
  // Recadrage carré, centré (haut de l'image pour un portrait)
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    img.naturalHeight > img.naturalWidth ? 0 : (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    r * 2,
    r * 2,
  );
  ctx.restore();
  ctx.beginPath();
  ctx.arc(r, r, r - ratio, 0, Math.PI * 2);
  ctx.lineWidth = 2 * ratio;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();
  document.body.appendChild(canvas);
  e.dataTransfer.setDragImage(canvas, DRAG_SIZE / 2, DRAG_SIZE / 2);
  setTimeout(() => canvas.remove(), 0);
}

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
      aria-label={translate('map.tokens.library.pick', {
        name: subtitle ? `${source.name}, ${subtitle}` : source.name,
      })}
      onClick={onArm}
      onDragStart={(e) => {
        setRoundDragImage(e);
        drag.onDragStart(e, source);
      }}
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
