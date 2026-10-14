'use client';

import { useTranslations } from 'next-intl';
import { EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { clock, partsOf, periodOf, worldTime } from '../state';
import { useWorldTime } from './use-world-time';
import { PERIOD_ICON, PERIOD_TONE } from './period-icon';

/** Jour et heure du monde, en haut à droite (le MJ le voit même caché aux joueurs). */
export function WorldTimeOverlay() {
  const t = useTranslations('table.worldTime');
  const { gm } = useTable();
  worldTime.useSync();
  const { value, minutes } = useWorldTime();
  const montre = value !== null && (gm || value.visible);
  const p = value ? partsOf(minutes) : null;

  const period = p ? periodOf(p.hour) : 'morning';
  const Icone = PERIOD_ICON[period];

  return (
    <AnimatePresence>
      {montre && p && (
        <motion.div
          key="world-time"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-none fixed right-3 top-3 z-30"
        >
          <div className="flex items-center gap-2.5 rounded-2xl border border-border-strong bg-popover/95 py-1.5 pl-2 pr-3.5 shadow-elevated backdrop-blur">
            <span
              className={cn(
                'grid size-7 place-items-center rounded-xl bg-surface-3',
                PERIOD_TONE[period],
              )}
            >
              <Icone className="size-4" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] font-medium text-muted-foreground">
                {t('day', { day: String(p.day) })} · {t(`periods.${period}`)}
              </span>
              <span className="block text-sm font-semibold tabular-nums">
                {clock(p.hour, p.minute)}
              </span>
            </span>
            {gm && !value.visible && (
              <EyeOff className="size-3.5 text-subtle" aria-label={t('hidden')} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
