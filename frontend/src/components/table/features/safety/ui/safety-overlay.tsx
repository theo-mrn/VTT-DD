'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useTable } from '../../../contexte';
import { boundaries, XCARD_KIND, xcards } from '../state';

/**
 * Tient les lignes et voiles à jour chez tous ; chez le MJ, la carte X levée s'affiche en grand,
 * sans le nom de qui l'a levée.
 */
export function SafetyOverlay() {
  const t = useTranslations('table.safety');
  const { campagne, gm } = useTable();
  boundaries.useSync();
  const raised = useStore(xcards, (s) => s.raised);

  // Une liste de sortes vide écoute tout : seul le MJ traite, et seulement la carte X
  useCampaignEphemeral(campagne.id, [XCARD_KIND], (m) => {
    if (!gm || m.kind !== XCARD_KIND) return;
    xcards.setState((s) => ({ raised: [...s.raised, Date.now()] }));
  });

  return (
    <AnimatePresence>
      {gm && raised.length > 0 && (
        <motion.div
          key="xcard"
          role="alert"
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          className="fixed left-1/2 top-[8.75rem] z-40 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/50 bg-popover/95 p-3 shadow-elevated backdrop-blur">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive text-lg font-black text-destructive-foreground">
              X
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t('raised')}
                {raised.length > 1 && ` ×${raised.length}`}
              </p>
              <p className="text-xs text-muted-foreground">{t('raisedHint')}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('dismiss')}
              onClick={() => xcards.setState({ raised: [] })}
            >
              <X />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
