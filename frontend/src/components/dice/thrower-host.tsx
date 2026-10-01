'use client';

/**
 * Point de montage du lanceur 3D, une seule fois pour toute l'app
 * (`Fournisseurs`) : passer de l'app à la table ne recrée ni le contexte
 * WebGL, ni la carte d'environnement, ni le moteur physique, ni les shaders
 * compilés. Table de dés, lanceur rapide et boutique s'en servent par
 * `lib/dice-throw.ts`. Rien n'est chargé avant la première demande (lancer
 * ou préchauffage) : le module WebGL (three, cannon, carte d'environnement)
 * reste hors du bundle initial. Les demandes arrivées pendant le chargement
 * attendent dans le store et sont prises dès que le lanceur est monté.
 */
import dynamic from 'next/dynamic';
import { useDiceThrowStore } from '@/lib/dice-throw';

const DiceThrower = dynamic(() => import('./three/thrower'), { ssr: false });

export function DiceThrowerHost() {
  const active = useDiceThrowStore((s) => s.active);
  return active ? <DiceThrower /> : null;
}
