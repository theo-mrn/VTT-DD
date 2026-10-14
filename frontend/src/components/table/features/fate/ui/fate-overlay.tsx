'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { useTable } from '../../../contexte';
import { fate } from '../state';
import { FateToken } from './fate-token';

/**
 * Réserve de jetons, chez tous, en bas à gauche ; une dépense s'annonce (« Aela dépense un
 * jeton »). L'état vit au serveur (état de la table).
 */
export function FateOverlay() {
  const t = useTranslations('table.fate');
  const { campagne } = useTable();
  const p = useStore(fate.store, (s) => s.value);

  // Annonce de chaque nouvelle dépense (pas de celle déjà là à l'arrivée)
  const vue = useRef<string | null | undefined>(undefined);
  const recue = p !== null;
  const derniere = p?.last ?? null;
  useEffect(() => {
    // Rien reçu encore : la première réserve reçue n'annonce rien
    if (!recue) return;
    const at = derniere?.at ?? null;
    if (vue.current === undefined || at === vue.current) {
      vue.current = at;
      return;
    }
    vue.current = at;
    if (derniere) {
      const nom = campagne.members.find((m) => m.userId === derniere.userId)?.name;
      toast(t('spent', { name: nom ?? t('someone') }));
    }
  }, [recue, derniere, t, campagne.members]);

  if (!p) return null;
  return (
    <div className="pointer-events-none fixed bottom-[calc(var(--table-dock-h)+1rem)] left-3 z-30 lg:left-20">
      <div className="flex items-center gap-1 rounded-2xl border border-border-strong bg-popover/95 p-1.5 shadow-elevated backdrop-blur">
        <span className="sr-only">{t('pool', { count: String(p.count), max: String(p.max) })}</span>
        <AnimatePresence initial={false}>
          {Array.from({ length: p.max }, (_, i) => (
            <motion.span
              key={`${i}-${i < p.count}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              <FateToken full={i < p.count} className="size-6" />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
