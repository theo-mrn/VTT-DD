'use client';

import { motion } from 'framer-motion';
import { Box, EyeOff, RotateCcw, Skull, Sparkles } from 'lucide-react';
import { forwardRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import type { Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { depuis, useMaintenant } from './temps';
import { TACTILE } from './tactile';
import { ValeursDes } from './valeurs-des';
import { infoVisibilite } from './visibilite';

/** Phrase lue par les lecteurs d'écran à chaque nouveau jet. */
function annonce(jet: Jet): string {
  const crit =
    jet.critical === 'success'
      ? ', réussite critique'
      : jet.critical === 'failure'
        ? ', échec critique'
        : '';
  const resultat = jet.hidden
    ? 'résultat caché, visible par le MJ'
    : (jet.symbolResult ?? String(jet.total));
  return `${jet.label ? `${jet.label} : ` : ''}${resultat}${crit} (${jet.formula})`;
}

/** Halo chaud en haut à gauche, teinté par un critique. */
function halo(critique: Jet['critical']): string {
  if (critique === 'success')
    return 'radial-gradient(80% 120% at 0% 0%, hsl(var(--primary) / 0.24), transparent 70%)';
  if (critique === 'failure')
    return 'radial-gradient(80% 120% at 0% 0%, hsl(var(--destructive) / 0.18), transparent 70%)';
  return 'radial-gradient(80% 120% at 0% 0%, hsl(var(--primary) / 0.09), transparent 70%)';
}

/**
 * Dernier résultat, en bandeau : total en grand, dés en chiffres, formule et
 * « relancer ». Il n'arrive qu'une fois les dés 3D arrêtés (leurs faces font
 * le jet) ; pendant qu'ils roulent, le bandeau le dit et l'ancien jet pâlit.
 */
export const ResultatCompact = forwardRef<
  HTMLElement,
  {
    jet: Jet | null;
    /** Vrai pour un jet qui vient d'être lancé (annonce et entrée animée). */
    anime: boolean;
    onRelancer: () => void;
    /** Les dés roulent (ou le jet part au service) : le résultat n'est pas encore connu. */
    enCours: boolean;
  }
>(function ResultatCompact({ jet, anime, onRelancer, enCours }, ref) {
  const maintenant = useMaintenant(15_000);
  const critique = jet?.critical ?? null;
  const vis = jet ? infoVisibilite(jet.visibility) : null;

  return (
    <section
      ref={ref}
      aria-labelledby="titre-resultat"
      className={cn(
        'relative isolate scroll-mt-20 overflow-hidden rounded-t-2xl border-b transition-colors duration-500',
        critique === 'success' && 'border-primary/40',
        critique === 'failure' && 'border-destructive/40',
        !critique && 'border-border',
      )}
    >
      <h2 id="titre-resultat" className="sr-only">
        Dernier résultat
      </h2>
      {/* Seule cette phrase est annoncée */}
      <p aria-live="polite" aria-atomic className="sr-only">
        {jet && anime ? annonce(jet) : ''}
      </p>
      <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-70 mask-radial" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 transition-[background] duration-500"
        style={{ background: halo(critique) }}
      />

      {jet ? (
        <motion.div
          key={jet.id}
          animate={critique === 'failure' && anime ? { x: [0, -4, 4, -2, 2, 0] } : undefined}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex items-start gap-3 p-3 [@container(min-width:26rem)]:gap-4 [@container(min-width:26rem)]:p-4"
        >
          <div className={cn('shrink-0 transition-opacity', enCours && 'opacity-40')}>
            <Total jet={jet} anime={anime} />
          </div>

          <div
            className={cn('min-w-0 flex-1 space-y-1.5 transition-opacity', enCours && 'opacity-40')}
          >
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {jet.label || 'Jet libre'}
              </span>
              {critique && (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider',
                    critique === 'success'
                      ? 'border-primary/30 bg-primary/10 text-primary-strong'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  {critique === 'success' ? (
                    <Sparkles className="size-3" aria-hidden />
                  ) : (
                    <Skull className="size-3" aria-hidden />
                  )}
                  {critique === 'success' ? 'Critique' : 'Échec critique'}
                </span>
              )}
            </p>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-subtle">
              <span className="max-w-full truncate font-mono text-muted-foreground">
                {jet.formula}
              </span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">{depuis(jet.createdAt, maintenant)}</span>
              {jet.characterName && (
                <>
                  <span aria-hidden>·</span>
                  <span className="max-w-[12rem] truncate">{jet.characterName}</span>
                </>
              )}
              {vis?.icone && (
                <Info texte={vis.aide}>
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>·</span>
                    <vis.icone className="size-3" aria-hidden />
                    <span className="sr-only [@container(min-width:26rem)]:not-sr-only">
                      {vis.libelle}
                    </span>
                  </span>
                </Info>
              )}
            </p>
            {jet.hidden ? (
              <p className="text-[11px] text-subtle">Dés cachés : seul le MJ les voit.</p>
            ) : (
              <ValeursDes groupes={jet.groups} />
            )}
          </div>

          <Info
            texte={
              <span className="flex items-center gap-2">
                Relancer <Kbd>R</Kbd>
              </span>
            }
          >
            <button
              type="button"
              onClick={onRelancer}
              disabled={enCours}
              aria-label="Relancer ce jet"
              aria-keyshortcuts="R"
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2/80 text-muted-foreground transition-colors',
                'hover:bg-surface-3 hover:text-foreground disabled:opacity-45',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                TACTILE,
              )}
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </Info>
        </motion.div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold">
              {enCours ? 'Les dés roulent…' : 'La table est prête'}
            </p>
            <p className="text-xs text-muted-foreground">
              {enCours
                ? 'Le résultat s’affiche dès que les dés s’arrêtent.'
                : 'Choisissez des dés ou écrivez une formule, puis lancez.'}
            </p>
          </div>
          <p className="hidden shrink-0 items-center gap-1.5 text-[11px] text-subtle [@container(min-width:26rem)]:flex">
            <Kbd>↵</Kbd> lancer
            <span aria-hidden className="text-border-strong">
              ·
            </span>
            <Kbd>R</Kbd> relancer
          </p>
        </div>
      )}

      {enCours && jet && (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-14 flex items-center justify-center">
          <p className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/90 px-2.5 py-1 text-xs font-medium text-primary shadow-surface">
            <Box
              className="size-3.5 animate-spin [animation-duration:2.4s] motion-reduce:animate-none"
              aria-hidden
            />
            Les dés roulent…
          </p>
        </div>
      )}
    </section>
  );
});

/** Total du jet : chiffres en grand, symboles, ou résultat caché. */
function Total({ jet, anime }: { jet: Jet; anime: boolean }) {
  if (jet.hidden || jet.total === null)
    return (
      <span className="flex h-12 min-w-12 items-center justify-center rounded-xl border border-border bg-surface-2/70 text-muted-foreground">
        <EyeOff className="size-5" aria-hidden />
        <span className="sr-only">Résultat caché</span>
      </span>
    );
  return (
    <motion.span
      key={jet.id}
      initial={anime ? { opacity: 0, y: 8, scale: 0.85 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className={cn(
        'block min-w-12 text-center font-mono font-bold leading-none tabular',
        jet.symbolResult
          ? 'max-w-[9rem] font-sans text-lg leading-tight'
          : 'text-[2.75rem] [@container(min-width:26rem)]:text-5xl',
        jet.critical === 'success' && 'text-gradient-primary',
        jet.critical === 'failure' && 'text-destructive',
        !jet.critical && 'text-foreground',
      )}
    >
      {jet.symbolResult ?? jet.total}
    </motion.span>
  );
}
