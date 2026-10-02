'use client';

/**
 * Pastille de l'élément actif d'un groupe (barre d'outils, sélecteur segmenté, puces) : elle
 * glisse d'un élément à l'autre au lieu de sauter. Le groupe est délimité par `PillGroup` (un
 * par instance : deux groupes ne s'échangent pas leur pastille) ; l'élément qui la porte doit
 * être `relative isolate`, la pastille passe sous son contenu. Pas de `translate` dans
 * `className` : motion anime la position par `transform`. Réduite aux préférences du
 * système (`MotionConfig reducedMotion="user"`, `fournisseurs.tsx`).
 */
import { LayoutGroup, motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PillGroup({ children }: { children: ReactNode }) {
  return <LayoutGroup id={useId()}>{children}</LayoutGroup>;
}

/** `id` : plusieurs pastilles par élément (fond et repère) glissent chacune de leur côté. */
export function ActivePill({ className, id = 'active-pill' }: { className?: string; id?: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
      className={cn('absolute inset-0 -z-10 rounded-[inherit]', className)}
    />
  );
}
