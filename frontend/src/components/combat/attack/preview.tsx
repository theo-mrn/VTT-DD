'use client';

/**
 * Aperçu du jet de l'attaquant (docs/combat.md § 5.2) : formule avec les valeurs de sa fiche
 * (« 1d20 + 5 »), ou pool de dés à symboles aux couleurs de la présentation (bouton « Lancer »).
 */
import type { Presentation } from '@vtt/rules';
import type { RollPreview } from '@/lib/combat/actions';
import { cn } from '@/lib/utils';

export function DieSwatch({
  color,
  className,
}: Readonly<{
  color?: string;
  className?: string;
}>) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-white/15',
        !color && 'bg-surface-3',
        className,
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

/** Aperçu en une ligne (pastille d'une carte, bouton « Lancer »). */
export function PreviewText({
  preview,
  presentation,
  compact = false,
}: Readonly<{
  preview: RollPreview;
  presentation: Presentation | null;
  compact?: boolean;
}>) {
  if (preview.kind === 'numeric')
    return <span className="truncate font-mono tabular-nums">{preview.formula}</span>;
  const sorte = (id: string) => presentation?.des?.sortes[id];
  const parts = [
    ...preview.dice.map((d) => ({ die: d.die, name: d.name, count: d.count, up: false })),
    ...preview.upgrades.map((u) => ({ die: u.to, name: u.name, count: u.count, up: true })),
  ];
  if (!parts.length) return <span className="text-muted-foreground">Aucun dé</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      {parts.map((p, i) => (
        <span key={`${p.die}-${i}`} className="inline-flex items-center gap-1">
          {p.up && <span className="text-subtle">↑</span>}
          <DieSwatch color={sorte(p.die)?.couleur} />
          <span className="font-mono tabular-nums">{p.count ?? '?'}</span>
          {!compact && <span>{sorte(p.die)?.court ?? p.name}</span>}
        </span>
      ))}
    </span>
  );
}
