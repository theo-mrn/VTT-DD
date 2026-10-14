'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from 'zustand';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { clocks } from '../state';
import { ClockFace } from './clock-face';

/** Horloges montrées à la table, en bas à droite (le MJ voit aussi les siennes, estompées). */
export function ClocksOverlay() {
  const t = useTranslations('table.clocks');
  const { gm } = useTable();
  clocks.useSync();
  const liste = useStore(clocks.store, (s) => s.value) ?? [];
  const montrees = liste.filter((c) => gm || c.visible);

  return (
    <div className="pointer-events-none fixed bottom-[calc(var(--table-dock-h)+4.5rem)] right-3 z-30 flex flex-col items-end gap-1.5">
      <AnimatePresence initial={false}>
        {montrees.map((c) => (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className={cn(
              'flex items-center gap-2.5 rounded-2xl border border-border-strong bg-popover/95 py-1.5 pl-1.5 pr-3 shadow-elevated backdrop-blur',
              !c.visible && 'opacity-60',
            )}
          >
            <ClockFace
              segments={c.segments}
              filled={c.filled}
              className="size-9"
              label={t('progress', {
                name: c.name,
                filled: String(c.filled),
                segments: String(c.segments),
              })}
            />
            <span className="leading-tight">
              <span className="block max-w-40 truncate text-[13px] font-semibold">{c.name}</span>
              <span className="block text-[11px] tabular-nums text-muted-foreground">
                {c.filled}/{c.segments}
              </span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
