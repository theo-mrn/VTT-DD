'use client';

import { useTranslations } from 'next-intl';
import { Hourglass } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { formatRemaining, timer as commandes } from '../state';
import { useTimer } from './use-timer';

/** Délai d'affichage de « Temps écoulé » avant que le minuteur disparaisse. */
const OVER_MS = 6000;

/**
 * Minuteur vu de toute la table : pastille en haut au centre, sous la barre du combat (état de
 * la table, serveur).
 */
export function TimerOverlay() {
  const t = useTranslations('table.timer');
  const { gm } = useTable();
  const { timer, remaining } = useTimer();

  // Fini et écarté (le temps de « Temps écoulé ») : l'échéance qu'on ne montre plus
  const [ecarte, setEcarte] = useState<number | null>(null);

  // Fini : « Temps écoulé » quelques secondes, puis le MJ l'arrête pour tous
  const fini = timer !== null && timer.endsAt !== null && remaining === 0;
  useEffect(() => {
    if (!fini) return;
    const echeance = timer.endsAt;
    const id = setTimeout(() => {
      // Le MJ l'arrête pour tous ; sans lui, chacun le retire de son écran
      if (gm) commandes.stop();
      setEcarte(echeance);
    }, OVER_MS);
    return () => clearTimeout(id);
  }, [fini, gm, timer]);

  const ratio = timer ? remaining / Math.max(1, timer.durationMs) : 0;
  const urgent = timer !== null && remaining <= 10_000;

  return (
    <AnimatePresence>
      {timer && !(ecarte !== null && timer.endsAt === ecarte) && (
        <motion.div
          key="timer"
          role="timer"
          aria-live="polite"
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          className="pointer-events-none fixed left-1/2 top-[4.75rem] z-30 -translate-x-1/2"
        >
          <div
            className={cn(
              'relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-popover/95 py-2 pl-3 pr-4 shadow-elevated backdrop-blur',
              fini
                ? 'animate-pulse border-destructive/60'
                : urgent
                  ? 'border-destructive/50'
                  : 'border-border-strong',
            )}
          >
            <span
              className={cn(
                'grid size-8 place-items-center rounded-xl',
                fini || urgent
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-primary/15 text-primary',
              )}
            >
              <Hourglass className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              {timer.label && (
                <span className="block max-w-56 truncate text-[11px] font-medium text-muted-foreground">
                  {timer.label}
                </span>
              )}
              <span
                className={cn(
                  'block text-xl font-semibold leading-tight tabular-nums tracking-tight',
                  (fini || urgent) && 'text-destructive',
                  timer.endsAt === null && 'opacity-60',
                )}
              >
                {fini ? t('over') : formatRemaining(remaining)}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-300 ease-linear',
                urgent ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
