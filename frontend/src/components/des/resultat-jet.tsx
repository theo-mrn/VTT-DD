'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Skull } from 'lucide-react';
import type { Critique, GroupeDes } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { DeVisuel, etatDe } from './de-visuel';

/** Dés d'un jet, groupés, avec l'état de chacun (écarté, explosif, critique). */
export function DesDuJet({
  groupes,
  taille = 'sm',
  roulement = false,
  max = 24,
}: {
  groupes: GroupeDes[];
  taille?: 'xs' | 'sm' | 'md' | 'lg';
  roulement?: boolean;
  /** Au-delà, les dés sont résumés (« +12 »). */
  max?: number;
}) {
  const seulD20 =
    groupes.filter((g) => g.faces === 20).flatMap((g) => g.dice.filter((d) => d.kept)).length === 1;
  const tous = groupes.flatMap((g, i) => g.dice.map((d, j) => ({ g, d, cle: `${i}-${j}` })));
  const visibles = tous.slice(0, max);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibles.map(({ g, d, cle }, k) => (
        <DeVisuel
          key={cle}
          faces={g.faces}
          valeur={d.value}
          etat={etatDe(g.faces, d, seulD20)}
          taille={taille}
          roulement={roulement}
          delai={roulement ? k * 45 : 0}
        />
      ))}
      {tous.length > max && <span className="text-xs text-subtle">+{tous.length - max} dés</span>}
    </div>
  );
}

/** Total d'un jet, mis en valeur (et coloré sur un critique). */
export function TotalJet({
  total,
  critique,
  taille = 'lg',
  cle,
}: {
  total: number;
  critique: Critique;
  taille?: 'md' | 'lg' | 'xl';
  /** Change à chaque jet pour rejouer l'apparition. */
  cle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={cle ?? total}
          initial={{ opacity: 0, y: 12, scale: 0.8, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className={cn(
            'font-mono font-bold leading-none tabular',
            taille === 'md' && 'text-3xl',
            taille === 'lg' && 'text-5xl',
            taille === 'xl' && 'text-7xl',
            critique === 'success' && 'text-gradient-primary',
            critique === 'failure' && 'text-destructive',
            !critique && 'text-foreground',
          )}
        >
          {total}
        </motion.span>
      </AnimatePresence>
      {critique && (
        <motion.span
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
            critique === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary-strong'
              : 'border-destructive/30 bg-destructive/10 text-destructive',
          )}
        >
          {critique === 'success' ? <Sparkles className="size-3" /> : <Skull className="size-3" />}
          {critique === 'success' ? 'Critique' : 'Échec critique'}
        </motion.span>
      )}
    </div>
  );
}
