'use client';

import { MotionConfig, motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Courbe commune de la landing : arrivée lestée, qui ralentit en se posant. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Apparition au défilement, une seule fois : la section monte de 32 px en s'affichant. Avec les
 * animations réduites, seule l'opacité change.
 */
export function Apparition({
  children,
  className,
  delai = 0,
}: Readonly<{ children: ReactNode; className?: string; delai?: number }>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: EASE, delay: delai }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
