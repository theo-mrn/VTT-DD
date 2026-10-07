'use client';

/**
 * Vue « Capacités » : les entrées acquises de toutes les sortes du bloc, en liste dense. Nom,
 * provenance (voie et rang), activation (valeur du champ de filtre), rang, un indicateur
 * discret de bonus (ils se gèrent dans le bloc Bonus), le temps restant d'une activation à
 * durée, les utilisations restantes d'un usage limité et un interrupteur pour celles qui
 * s'activent. Le détail s'ouvre au clic sur le nom.
 */
import { useTranslations } from 'next-intl';
import { BadgePlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { PossessionDuration } from '@/components/combat/duration-chip';
import { cn } from '@/lib/utils';
import type { SheetWrites } from '../tree/writes';
import type { OwnedItem } from './abilities';
import { RankMarks } from './parts';
import { UsesChip } from './uses';

export function OwnedList({
  items,
  showFilterLabel,
  writes,
  onOpen,
}: Readonly<{
  items: OwnedItem[];
  /** La valeur du filtre est un champ (activation…) : montrée sur la ligne. */
  showFilterLabel: (item: OwnedItem) => boolean;
  writes: SheetWrites | undefined;
  onOpen: (item: OwnedItem) => void;
}>) {
  const t = useTranslations();
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const { card } = item;
        const on = card.activable && card.active;
        const { total, active } = card.bonusCount;
        const bonusText = bonusSummary(total, active);
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
              {on && card.possession && (
                <PossessionDuration exemplaires={card.possession.exemplaires} />
              )}
              {card.uses && (
                <UsesChip
                  uses={card.uses}
                  {...(writes?.use && !card.activable
                    ? { onUse: () => writes.use?.(card.entry.id, false) }
                    : {})}
                />
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
                aria-label={`${on ? t('sheet.effects.disable') : t('sheet.effects.enable')} ${card.entry.nom}`}
                className="mr-1 after:absolute after:-inset-3 after:content-[''] relative"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** « 3 bonus, 1 actif » : le nombre d'actifs seulement quand ils ne le sont pas tous. */
function bonusSummary(total: number, active: number): string {
  if (total === 0) return '';
  if (active >= total) return `${total} bonus`;
  return `${total} bonus, ${active} ${active > 1 ? 'actifs' : 'actif'}`;
}
