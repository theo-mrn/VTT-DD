'use client';

import { motion } from 'framer-motion';
import { RotateCcw, UserRound } from 'lucide-react';
import { forwardRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import type { Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { DeVisuel } from './de-visuel';
import { DesDuJet, TotalJet } from './resultat-jet';
import { depuis, useMaintenant } from './temps';
import { infoVisibilite } from './visibilite';

/** Phrase lue par les lecteurs d'écran à chaque nouveau jet. */
function annonce(jet: Jet): string {
  const crit =
    jet.critical === 'success'
      ? ', réussite critique'
      : jet.critical === 'failure'
        ? ', échec critique'
        : '';
  return `${jet.label ? `${jet.label} : ` : ''}${jet.total}${crit} (${jet.formula})`;
}

/**
 * Résultat du dernier jet, en grand : total, dés qui roulent puis se posent,
 * formule. Un critique dore la carte, un échec critique la teinte de rouge.
 */
export const CarteResultat = forwardRef<
  HTMLElement,
  {
    jet: Jet | null;
    /** Vrai pour un jet qui vient d'être lancé (dés animés). */
    anime: boolean;
    onRelancer: () => void;
    enCours: boolean;
  }
>(function CarteResultat({ jet, anime, onRelancer, enCours }, ref) {
  const maintenant = useMaintenant(15_000);
  const critique = jet?.critical ?? null;
  const vis = jet ? infoVisibilite(jet.visibility) : null;

  return (
    <section
      ref={ref}
      aria-labelledby="titre-resultat"
      className={cn(
        'relative isolate scroll-mt-20 overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-500',
        critique === 'success' && 'border-primary/40 shadow-glow',
        critique === 'failure' &&
          'border-destructive/35 shadow-[0_0_0_1px_hsl(var(--destructive)/0.2),0_8px_32px_-8px_hsl(var(--destructive)/0.35)]',
        !critique && 'border-border shadow-surface',
      )}
    >
      <h2 id="titre-resultat" className="sr-only">
        Résultat
      </h2>
      {/* Seule cette phrase est annoncée : les dés qui défilent resteraient muets */}
      <p aria-live="polite" aria-atomic className="sr-only">
        {jet && anime ? annonce(jet) : ''}
      </p>

      <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-70 mask-radial" />
      <motion.div
        key={`${jet?.id ?? 'vide'}-${critique}`}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 -z-10"
        style={{
          background:
            critique === 'success'
              ? 'radial-gradient(70% 90% at 12% 0%, hsl(var(--primary) / 0.22), transparent 70%)'
              : critique === 'failure'
                ? 'radial-gradient(70% 90% at 12% 0%, hsl(var(--destructive) / 0.16), transparent 70%)'
                : 'radial-gradient(70% 90% at 12% 0%, hsl(var(--primary) / 0.07), transparent 70%)',
        }}
      />
      {critique === 'success' && anime && jet && (
        // Un seul reflet qui traverse la carte, pas une animation en boucle
        <motion.div
          key={`reflet-${jet.id}`}
          aria-hidden
          initial={{ x: '-120%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 1.1, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-y-0 -z-10 w-2/3 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
        />
      )}

      {jet ? (
        <motion.div
          key={jet.id}
          animate={critique === 'failure' && anime ? { x: [0, -5, 5, -3, 3, 0] } : undefined}
          transition={{ duration: 0.45, delay: 0.5 }}
          className="flex min-h-[236px] flex-col gap-5 p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
                Dernier jet
                <span className="normal-case tracking-normal">
                  {' '}
                  · {depuis(jet.createdAt, maintenant)}
                </span>
              </p>
              <p className="truncate text-[15px] font-semibold text-foreground">
                {jet.label || 'Jet libre'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {jet.characterName && (
                <Badge ton="neutre" taille="md" className="hidden max-w-[160px] sm:inline-flex">
                  <UserRound />
                  <span className="truncate">{jet.characterName}</span>
                </Badge>
              )}
              {vis && (
                <Info texte={vis.aide}>
                  <span className="hidden sm:inline-flex">
                    <Badge ton="neutre" taille="md">
                      {vis.icone && <vis.icone />}
                      {vis.libelle}
                    </Badge>
                  </span>
                </Info>
              )}
              <Button variant="secondary" size="sm" onClick={onRelancer} loading={enCours}>
                {!enCours && <RotateCcw aria-hidden />}
                Relancer
                <Kbd aria-hidden className="-mr-1 hidden sm:inline-flex">
                  R
                </Kbd>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <div className="shrink-0 space-y-2">
              <TotalJet total={jet.total} critique={critique} taille="xl" cle={jet.id} />
              <p className="max-w-[280px] break-words font-mono text-sm text-muted-foreground">
                {jet.formula}
              </p>
            </div>
            <PisteDes jet={jet} anime={anime} />
          </div>
        </motion.div>
      ) : (
        <EtatVideResultat />
      )}
    </section>
  );
});

/** Les dés posés dans un creux de la carte, avec leur somme. */
function PisteDes({ jet, anime }: { jet: Jet; anime: boolean }) {
  const nbDes = jet.groups.reduce((n, g) => n + g.dice.length, 0);
  const somme = jet.groups.reduce((n, g) => n + g.total, 0);
  // Peu de dés : on les montre en grand, beaucoup : ils se serrent
  const taille = nbDes <= 3 ? 'lg' : nbDes <= 8 ? 'md' : 'sm';

  return (
    <div className="flex min-h-[112px] min-w-0 flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-background/50 px-3 py-4 shadow-[inset_0_1px_3px_0_hsl(0_0%_0%/0.4)]">
      {nbDes ? (
        <>
          <div className="[&>div]:justify-center">
            <DesDuJet groupes={jet.groups} taille={taille} roulement={anime} max={18} />
          </div>
          <p className="text-[11px] text-subtle">
            {nbDes} dé{nbDes > 1 ? 's' : ''} ·{' '}
            <span className="font-mono text-muted-foreground tabular">{somme}</span>{' '}
            {nbDes > 1 ? 'aux dés' : 'au dé'}
          </p>
        </>
      ) : (
        <p className="text-xs text-subtle">Aucun dé : valeur fixe.</p>
      )}
    </div>
  );
}

function EtatVideResultat() {
  return (
    <div className="flex min-h-[236px] flex-col items-center justify-center gap-5 px-6 py-8 text-center sm:flex-row sm:gap-7 sm:text-left">
      <div className="relative shrink-0">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-2xl"
        />
        <span className="block animate-float">
          <DeVisuel faces={20} taille="xl" className="text-xl" />
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold">La table est prête</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Composez votre jet sur le plateau et lancez : le résultat s’affichera ici.
        </p>
        <p className="flex items-center justify-center gap-2 pt-1.5 text-xs text-subtle sm:justify-start">
          <Kbd>↵</Kbd> lancer
          <span aria-hidden className="text-border-strong">
            ·
          </span>
          <Kbd>R</Kbd> relancer
        </p>
      </div>
    </div>
  );
}
