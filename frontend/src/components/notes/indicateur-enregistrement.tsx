'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleAlert, GitCompareArrows, RotateCw } from 'lucide-react';
import type { EtatEnregistrement } from './enregistrement';

/** État de l'enregistrement automatique, discret tant que tout va bien. */
export function IndicateurEnregistrement({
  etat,
  onReessayer,
}: Readonly<{
  etat: EtatEnregistrement;
  onReessayer: () => void;
}>) {
  // En attente et en cours se confondent à l'écran : pas de clignotement entre les deux
  const cle = etat === 'en-cours' ? 'en-attente' : etat;

  return (
    <div aria-live="polite" className="flex h-7 items-center whitespace-nowrap text-xs">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={cle}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="flex items-center gap-1.5"
        >
          {cle === 'enregistre' && (
            <>
              <Check className="size-3.5 text-success/80" aria-hidden />
              <span className="text-subtle">Enregistré</span>
            </>
          )}
          {cle === 'en-attente' && (
            <>
              <span className="relative flex size-2 items-center justify-center" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/50 motion-reduce:hidden" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-muted-foreground">Enregistrement…</span>
            </>
          )}
          {cle === 'conflit' && (
            <>
              <GitCompareArrows className="size-3.5 text-warning" aria-hidden />
              <span className="text-warning">Modifiée ailleurs</span>
            </>
          )}
          {cle === 'erreur' && (
            <>
              <CircleAlert className="size-3.5 text-destructive" aria-hidden />
              <span className="text-destructive">Non enregistré</span>
              <button
                type="button"
                onClick={onReessayer}
                className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <RotateCw className="size-3" />
                Réessayer
              </button>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
