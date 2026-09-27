'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte qui s'incline légèrement vers le pointeur, avec un reflet qui suit :
 * effet « carte à collectionner » pour le choix du héros. Désactivé si
 * l'utilisateur préfère réduire les animations (via CSS global).
 */
export function CarteInclinee({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [7, -7]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [0, 1], [-9, 9]), { stiffness: 200, damping: 18 });
  const reflet = useTransform(
    [x, y] as const,
    ([a, b]: number[]) =>
      `radial-gradient(circle at ${(a ?? 0.5) * 100}% ${(b ?? 0.5) * 100}%, hsl(0 0% 100% / 0.18), transparent 55%)`,
  );

  return (
    <motion.div
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        x.set(0.5);
        y.set(0.5);
      }}
      className={cn('relative [transform-style:preserve-3d]', className)}
    >
      {children}
      <motion.div
        aria-hidden
        style={{ background: reflet }}
        className="pointer-events-none absolute inset-0 rounded-2xl mix-blend-overlay"
      />
    </motion.div>
  );
}
