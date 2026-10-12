'use client';

import { useTranslations } from 'next-intl';
import { Coffee, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { useTable } from '../../../contexte';
import { tablePause, togglePause } from '../state';

/**
 * Voile de pause, chez tous : la table est figée (le voile capte les clics). Le MJ garde un
 * bouton pour reprendre.
 */
export function PauseOverlay() {
  const t = useTranslations('table.pause');
  const { gm } = useTable();
  tablePause.useSync();
  const enPause = useStore(tablePause.store, (s) => s.value !== null);

  return (
    <AnimatePresence>
      {enPause && (
        <motion.div
          key="pause"
          role="alertdialog"
          aria-label={t('title')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="flex flex-col items-center text-center"
          >
            <motion.span
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="grid size-20 place-items-center rounded-3xl bg-primary/15 text-primary shadow-glow"
            >
              <Coffee className="size-9" aria-hidden />
            </motion.span>
            <p className="mt-6 font-display text-4xl font-semibold tracking-tight">{t('title')}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {gm ? t('gmHint') : t('playerHint')}
            </p>
            {gm && (
              <Button size="lg" className="mt-6" onClick={togglePause}>
                <Play />
                {t('resume')}
              </Button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
