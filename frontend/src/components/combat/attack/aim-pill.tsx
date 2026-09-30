'use client';

/**
 * Pastille de visée (docs/combat.md § 12.1, « Viser sur la carte ») : le menu d'attaque se
 * réduit à elle le temps de cliquer les tokens (⇧ : plusieurs). Attaquant → cibles, leur
 * nombre, « Valider » ; Échap ou « Valider » rouvrent le menu à la même étape.
 */
import { ArrowRight, Check, Crosshair } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { targetName } from '@/lib/combat/view';
import type { AttackContext } from './use-attack-context';

export function AimPill({
  ctx,
  attackerId,
  attackerName,
  attackerPortrait,
  targetIds,
  onDone,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  attackerName: string | null;
  attackerPortrait: string | null;
  targetIds: readonly string[];
  onDone: () => void;
}) {
  const reduced = useReducedMotion();

  // Échap (hors d'un geste de la carte, qui le garde pour lui) : retour au menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  if (typeof document === 'undefined') return null;
  const n = targetIds.length;
  const name = attackerName ?? (attackerId ? ctx.known.get(attackerId)?.name : null) ?? '?';
  return createPortal(
    <motion.div
      role="toolbar"
      aria-label="Visée sur la carte"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--table-dock-h,0px)+0.75rem)] z-50 flex justify-center lg:bottom-6"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border-strong bg-popover/95 py-1.5 pl-1.5 pr-1.5 shadow-elevated backdrop-blur-md sm:gap-3">
        <Illustration
          src={attackerPortrait ?? (attackerId ? ctx.known.get(attackerId)?.portraitUrl : null)}
          graine={name}
          alt={name}
          className="size-9 shrink-0 rounded-full ring-2 ring-primary"
        />
        <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden />
        {n > 0 ? (
          <ul className="flex shrink-0 -space-x-2" aria-label="Cibles">
            {targetIds.slice(0, 4).map((id, i) => (
              <li key={id} style={{ zIndex: 4 - i }}>
                <Illustration
                  src={ctx.known.get(id)?.portraitUrl}
                  graine={targetName(id, ctx.known)}
                  alt={targetName(id, ctx.known)}
                  className="size-8 rounded-full ring-2 ring-destructive/80 ring-offset-1 ring-offset-popover"
                />
              </li>
            ))}
          </ul>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-destructive/50 text-destructive/70">
            <Crosshair className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 text-[13px] leading-tight" aria-live="polite">
          <span className="block font-medium">
            {n === 0
              ? 'Aucune cible'
              : n === 1
                ? targetName(targetIds[0]!, ctx.known)
                : `${n} cibles`}
          </span>
          <span className="hidden text-[11.5px] text-muted-foreground sm:block">
            Cliquez les tokens · <Kbd>⇧</Kbd> plusieurs · <Kbd>Échap</Kbd> retour
          </span>
        </span>
        <Button size="sm" className="shrink-0 rounded-full" onClick={onDone}>
          <Check /> Valider
        </Button>
      </div>
    </motion.div>,
    document.body,
  );
}
