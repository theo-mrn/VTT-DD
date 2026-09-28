'use client';

/**
 * Vue « Capacités » : les entrées acquises de toutes les sortes du bloc, en liste dense. Nom,
 * provenance (voie et rang), activation (valeur du champ de filtre), rang, un indicateur
 * discret de bonus (ils se gèrent dans le bloc Bonus) et un interrupteur pour celles qui
 * s'activent. Le détail s'ouvre au clic sur le nom.
 */
import { BadgePlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SheetWrites } from '../tree/writes';
import type { OwnedItem } from './abilities';
import { RankMarks } from './parts';

export function OwnedList({
  items,
  showFilterLabel,
  writes,
  onOpen,
}: {
  items: OwnedItem[];
  /** La valeur du filtre est un champ (activation…) : montrée sur la ligne. */
  showFilterLabel: (item: OwnedItem) => boolean;
  writes: SheetWrites | undefined;
  onOpen: (item: OwnedItem) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const { card } = item;
        const on = card.activable && card.active;
        const { total, active } = card.bonusCount;
        const bonusText =
          total === 0
            ? ''
            : `${total} bonus${active < total ? `, ${active} actif${active > 1 ? 's' : ''}` : ''}`;
        const meta = item.path ? `${item.path.name} · rang ${item.path.rank}` : null;
        return (
          <li key={card.entry.id} className="flex min-h-11 items-center gap-2 py-0.5 sm:min-h-10">
            <button
              type="button"
              onClick={() => onOpen(item)}
              className={cn(
                'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left',
                'transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[13px] font-medium',
                    on ? 'text-primary-strong' : 'text-foreground',
                  )}
                >
                  {card.entry.nom}
                </span>
                {meta && <span className="block truncate text-[11px] text-subtle">{meta}</span>}
              </span>
              {showFilterLabel(item) && (
                <span className="hidden shrink-0 rounded border border-border-strong px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground xs:inline">
                  {item.filterLabel}
                </span>
              )}
              {total > 0 && (
                <span title={bonusText} className="flex shrink-0 items-center">
                  <BadgePlus
                    className={cn('size-3', active > 0 ? 'text-primary/70' : 'text-subtle/60')}
                    aria-hidden
                  />
                  <span className="sr-only">{bonusText}</span>
                </span>
              )}
              {card.maxRank !== undefined && card.maxRank > 1 && (
                <RankMarks rank={card.rank} max={card.maxRank} />
              )}
            </button>
            {card.activable && (
              <Switch
                checked={on}
                disabled={!writes}
                onCheckedChange={(v) => writes?.setActive(card.entry.id, v)}
                aria-label={`${on ? 'Désactiver' : 'Activer'} ${card.entry.nom}`}
                className="mr-1 after:absolute after:-inset-3 after:content-[''] relative"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
