'use client';

/**
 * Durée restante d'un état ou d'un bonus sur la fiche (docs/combat.md § 18) : sablier et libellé
 * court (« 2 rounds », « 1 tour »), le libellé complet au survol (« jusqu'à la fin de son
 * prochain tour »). Rien pour une durée jusqu'au retrait.
 */
import { Hourglass } from 'lucide-react';
import { durationShort, durationText, type Timer } from '@/lib/combat/durations';
import { cn } from '@/lib/utils';

export function DurationChip({
  timer,
  bearerId,
  nameOf,
  className,
}: Readonly<{
  timer: Timer;
  bearerId?: string;
  nameOf?: (id: string) => string | undefined;
  className?: string;
}>) {
  const short = durationShort(timer);
  if (!short) return null;
  const full = durationText(timer, {
    ...(bearerId ? { bearerId } : {}),
    ...(nameOf ? { nameOf } : {}),
  });
  return (
    <span
      title={full}
      aria-label={full}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-1.5 text-[11px] font-medium tabular-nums text-warning',
        className,
      )}
    >
      <Hourglass className="size-3" aria-hidden />
      {short}
    </span>
  );
}

/** Durée d'une possession ou d'un bonus libre de l'état d'une fiche, ou null sans durée. */
export function timerOf(x: { duree?: number; decompte?: Timer['timing'] }): Timer | null {
  if (x.duree === undefined) return null;
  return { duration: x.duree, ...(x.decompte ? { timing: x.decompte } : {}) };
}

/** Durée d'une entrée possédée pour un temps (le premier exemplaire qui en a une). */
export function PossessionDuration({
  exemplaires,
}: Readonly<{ exemplaires: readonly { duree?: number; decompte?: Timer['timing'] }[] }>) {
  const timer = exemplaires.map(timerOf).find((t) => t !== null);
  return timer ? <DurationChip timer={timer} /> : null;
}
