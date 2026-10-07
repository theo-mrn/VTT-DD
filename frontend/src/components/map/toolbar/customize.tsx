'use client';

/**
 * Personnalisation de la barre d'outils (docs/carte.md § 6, Personnalisation) : les entrées de
 * ce viewer par groupe, glisser pour réordonner dans le groupe (ou Alt+↑↓), œil pour masquer
 * (la touche marche toujours), « Rétablir ». Ouverte d'un clic droit sur la barre.
 */
import { translate } from '@/i18n/runtime';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  canHide,
  hideEntry,
  moveEntry,
  slotLabel,
  type ToolbarGroup,
  type ToolbarLayout,
  type ToolbarSection,
  type ToolbarSlot,
} from '@/lib/map/engine/toolbar';
import { cn } from '@/lib/utils';

/** Nom d'un groupe de la barre (`map.toolbar.groups.<groupe>`). */
const groupLabel = (group: ToolbarGroup) => translate(`map.toolbar.groups.${group}`);

export function ToolbarCustomizer({
  sections,
  layout,
  onChange,
  onReset,
}: Readonly<{
  /** Barre de ce viewer, entrées masquées comprises. */
  sections: readonly ToolbarSection[];
  layout: ToolbarLayout;
  onChange(next: ToolbarLayout): void;
  onReset(): void;
}>) {
  const hidden = new Set(layout.hidden);
  const changed = layout.order.length > 0 || layout.hidden.length > 0;
  return (
    <div className="flex max-h-[min(32rem,70vh)] flex-col">
      <p className="px-2 pb-1 pt-1 text-sm font-semibold">{translate('map.toolbar.title')}</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {sections.map((section) => (
          <Group
            key={section.group}
            section={section}
            hidden={hidden}
            onMove={(id, to) =>
              onChange(
                moveEntry(
                  layout,
                  section.slots.map((s) => s.id),
                  id,
                  to,
                ),
              )
            }
            onHide={(id, hide) => onChange(hideEntry(layout, id, hide))}
          />
        ))}
      </div>
      <div className="flex justify-end border-t border-border pt-2">
        <Button variant="ghost" size="sm" disabled={!changed} onClick={onReset}>
          <RotateCcw />
          {translate('map.toolbar.reset')}
        </Button>
      </div>
    </div>
  );
}

function Group({
  section,
  hidden,
  onMove,
  onHide,
}: Readonly<{
  section: ToolbarSection;
  hidden: ReadonlySet<string>;
  onMove(id: string, to: number): void;
  onHide(id: string, hide: boolean): void;
}>) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const reset = () => {
    setDragging(null);
    setOver(null);
  };
  const drop = () => {
    if (dragging !== null && over !== null) {
      const from = section.slots.findIndex((s) => s.id === dragging);
      // Glissé vers le bas : la place visée compte l'entrée qui s'en va
      onMove(dragging, over > from ? over - 1 : over);
    }
    reset();
  };

  return (
    <section aria-label={groupLabel(section.group)}>
      <p className="px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {groupLabel(section.group)}
      </p>
      <ol className="space-y-0.5" onDragOver={(e) => dragging && e.preventDefault()} onDrop={drop}>
        {section.slots.map((slot, index) => (
          <Row
            key={slot.id}
            slot={slot}
            hidden={hidden.has(slot.id)}
            dropBefore={over === index && dragging !== slot.id}
            dropAfter={over === index + 1 && index === section.slots.length - 1}
            onDragStart={() => setDragging(slot.id)}
            onDragOverRow={(after) => dragging && setOver(after ? index + 1 : index)}
            onDragEnd={reset}
            onMove={(delta) => onMove(slot.id, index + delta)}
            onHide={(hide) => onHide(slot.id, hide)}
          />
        ))}
      </ol>
    </section>
  );
}

function Row({
  slot,
  hidden,
  dropBefore,
  dropAfter,
  onDragStart,
  onDragOverRow,
  onDragEnd,
  onMove,
  onHide,
}: Readonly<{
  slot: ToolbarSlot;
  hidden: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onDragStart(): void;
  onDragOverRow(after: boolean): void;
  onDragEnd(): void;
  onMove(delta: number): void;
  onHide(hide: boolean): void;
}>) {
  const { label, icon: Icon } = slotLabel(slot);
  const hideable = canHide(slot.id);
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onMove(e.key === 'ArrowUp' ? -1 : 1);
  };
  return (
    <li
      draggable
      tabIndex={0}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={onKey}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', slot.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        onDragOverRow(e.clientY > box.top + box.height / 2);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors',
        'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        dropBefore &&
          'before:absolute before:inset-x-2 before:-top-0.5 before:h-0.5 before:rounded-full before:bg-primary',
        dropAfter &&
          'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary',
      )}
    >
      <GripVertical
        className="size-4 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <Icon className={cn('size-4 shrink-0', hidden && 'opacity-40')} />
      <span
        className={cn('min-w-0 flex-1 truncate text-[13px]', hidden && 'text-muted-foreground')}
      >
        {label}
      </span>
      {hideable && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={hidden ? `Afficher ${label}` : `Masquer ${label}`}
          aria-pressed={hidden}
          onClick={() => onHide(!hidden)}
          className="size-7"
        >
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </li>
  );
}
