'use client';

import { MotionConfig, motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Courbe commune des apparitions : départ vif, arrivée douce. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Apparition au défilement (une fois), désactivée si l'utilisateur réduit les animations. */
export function Apparition({
  children,
  className,
  delai = 0,
}: Readonly<{ children: ReactNode; className?: string; delai?: number }>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: EASE, delay: delai }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
