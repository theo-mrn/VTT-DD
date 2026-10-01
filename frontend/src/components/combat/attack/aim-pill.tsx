'use client';

/**
 * Pastille de visée (docs/combat.md § 12.1, « Viser sur la carte ») : le menu d'attaque se
 * réduit à elle le temps de cliquer les tokens (⇧ : plusieurs). Attaquant → cibles, leur
 * nombre, la distance, « Attaquer » ; depuis le menu, Échap ou « Attaquer » le rouvrent à la
 * même étape.
 *
 * Visée rapide (clic d'un joueur sur un PNJ) : le menu s'ouvre ainsi, ce PNJ en cible ; un
 * clic choisit une autre cible, ⇧ en ajoute ou en retire ; « Attaquer » ouvre le menu à
 * l'étape « Action », Échap, « Annuler » ou un clic dans le vide annulent sans rien déclarer.
 */
import { ArrowRight, Crosshair, Ruler, Swords, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { targetName } from '@/lib/combat/view';
import { useActiveMap } from '@/lib/map/active-map';
import { aimDistanceText } from '@/lib/map/modules/combat/aim-distance';
import type { AttackContext } from './use-attack-context';

/** Distance de l'attaquant aux cibles, suivie quand les tokens bougent. */
function useAimDistance(
  campaignId: string,
  attackerId: string | null,
  targetIds: readonly string[],
): string | null {
  const { engine } = useActiveMap(campaignId);
  const key = targetIds.join(',');
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!engine) return setText(null);
    const ids = key ? key.split(',') : [];
    const update = () => setText(aimDistanceText(engine, attackerId, ids));
    update();
    return engine.store.subscribe(update);
  }, [engine, attackerId, key]);
  return text;
}

export function AimPill({
  campaignId,
  ctx,
  attackerId,
  attackerName,
  attackerPortrait,
  targetIds,
  quick,
  onDone,
  onCancel,
}: {
  campaignId: string;
  ctx: AttackContext;
  attackerId: string | null;
  attackerName: string | null;
  attackerPortrait: string | null;
  targetIds: readonly string[];
  /** Visée rapide : Échap annule l'attaque (sinon : retour au menu). */
  quick: boolean;
  /** « Attaquer » : le menu se rouvre. */
  onDone: () => void;
  /** Échap : retour au menu, ou attaque annulée (visée rapide). */
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  const distance = useAimDistance(campaignId, attackerId, targetIds);

  // Échap (hors d'un geste de la carte, qui le garde pour lui) : retour au menu, ou annulation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border-strong bg-popover/95 py-1.5 pl-1.5 pr-1.5 shadow-elevated sm:gap-3">
        <Illustration
          largeur={36}
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
                  largeur={32}
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
          {distance && (
            <span className="flex items-center gap-1 font-mono text-[11.5px] tabular-nums text-muted-foreground">
              <Ruler className="size-3 shrink-0" aria-hidden />
              {distance}
            </span>
          )}
        </span>
        <Info texte="⇧ + clic : plusieurs cibles">
          <span tabIndex={0} className="rounded max-sm:hidden [@media(pointer:coarse)]:hidden">
            <Kbd>⇧</Kbd>
          </span>
        </Info>
        {quick && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="shrink-0 rounded-full"
            aria-label="Annuler l’attaque"
            onClick={onCancel}
          >
            <X />
          </Button>
        )}
        <Button
          size="sm"
          className="shrink-0 rounded-full"
          disabled={quick && n === 0}
          onClick={onDone}
        >
          <Swords /> Attaquer
        </Button>
      </div>
    </motion.div>,
    document.body,
  );
}
