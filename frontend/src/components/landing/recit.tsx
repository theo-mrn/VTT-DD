'use client';

/**
 * Récit épinglé des sections jouées au défilement (scène de la taverne, dés) : la section fait
 * plusieurs écrans de haut, son contenu reste à l'écran et chaque part égale du trajet joue un
 * chapitre. Le trajet passe par un ressort : l'animation suit le défilement sans à-coups.
 */
import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import type { ReactNode, RefObject } from 'react';

/** Avancement lissé (0 à 1) d'une section épinglée, du haut de l'écran à sa fin. */
export function useTrajet(ref: RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  return useSpring(scrollYProgress, { stiffness: 60, damping: 20, restDelta: 0.001 });
}

/** Bornes du chapitre `index` sur `total`, sur le trajet (0 à 1). */
export const borne = (index: number, total: number): [number, number] => [
  index / total,
  (index + 1) / total,
];

/** Texte d'un chapitre : affiché pendant sa part du trajet, superposé aux autres. */
export function Chapitre({
  p,
  index,
  total,
  children,
}: Readonly<{ p: MotionValue<number>; index: number; total: number; children: ReactNode }>) {
  const [debut, fin] = borne(index, total);
  const premier = index === 0;
  const dernier = index === total - 1;
  const opacity = useTransform(
    p,
    [debut - 0.03, debut + 0.02, fin - 0.02, fin + 0.03],
    [premier ? 1 : 0, 1, 1, dernier ? 1 : 0],
  );
  const y = useTransform(p, [debut - 0.03, debut + 0.02], [premier ? 0 : 16, 0]);
  return (
    <motion.div className="[grid-area:1/1]" style={{ opacity, y }}>
      {children}
    </motion.div>
  );
}

/** Jauge d'un chapitre, remplie pendant sa part du trajet. */
export function Jauge({
  p,
  index,
  total,
}: Readonly<{ p: MotionValue<number>; index: number; total: number }>) {
  const scaleX = useTransform(p, borne(index, total), [0, 1]);
  return (
    <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
      <motion.span className="absolute inset-0 origin-left bg-primary" style={{ scaleX }} />
    </span>
  );
}
