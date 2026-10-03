'use client';

/**
 * Petites pièces du panneau Combat, partagées par l'ordre du tour, les cartes compactes et la
 * fiche détaillée : puces de situation, jauge de la ressource principale, valeurs clés de la
 * présentation, ressources ± en fenêtre surgissante (l'ancien « + » de la ligne).
 */
import type { ResourceGauge } from '@/lib/map/modules/tokens/model';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BlocRessources, widgetsDe } from '@/components/fiche/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SituationChip } from './situation';
import type { KeyStat } from './use-cast';

/** Puces de situation (surpris, a agi, visé ce round…), l'explication en infobulle. */
export function SituationChips({
  chips,
  className,
}: Readonly<{
  chips: readonly SituationChip[];
  className?: string;
}>) {
  if (!chips.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {chips.map((c) => (
        <Info key={c.kind} texte={c.hint}>
          <Badge ton={c.tone} className="cursor-help">
            <span className="sr-only">{c.hint}</span>
            <span aria-hidden>{c.label}</span>
          </Badge>
        </Info>
      ))}
    </span>
  );
}

/** Barre d'une jauge : couleur de la présentation, sinon selon le sens (qui se vide, se remplit). */
export function GaugeBar({
  ratio,
  color,
  rising,
  className,
}: Readonly<{
  ratio: number;
  color: string | null;
  rising: boolean;
  className?: string;
}>) {
  const part = Math.max(0, Math.min(1, ratio));
  // Sans couleur déclarée : une jauge qui se vide rougit en bas, une qui se remplit en haut
  const danger = rising ? part >= 0.75 : part <= 0.25;
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-surface-3', className)}>
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
          !color && gaugeTone(danger, rising),
        )}
        style={{ width: `${part * 100}%`, ...(color ? { background: color } : {}) }}
      />
    </span>
  );
}

/** Ressource principale : libellé, valeur / max, jauge. */
export function Gauge({
  gauge,
  className,
}: Readonly<{ gauge: ResourceGauge; className?: string }>) {
  const ratio = gauge.max > 0 ? gauge.value / gauge.max : 0;
  return (
    <span
      className={cn('flex w-20 shrink-0 flex-col gap-0.5', className)}
      title={`${gauge.label} : ${gauge.value} / ${gauge.max}`}
    >
      <span className="flex items-baseline justify-between gap-1 text-[10px] leading-none">
        <span className="truncate text-subtle">{gauge.label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {gauge.value}/{gauge.max}
        </span>
      </span>
      <GaugeBar ratio={ratio} color={gauge.color} rising={gauge.rising} />
    </span>
  );
}

/** Valeurs clés (ressources et valeurs du bloc « ressources » de la présentation). */
export function KeyStats({
  stats,
  size = 'sm',
}: Readonly<{
  stats: readonly KeyStat[];
  size?: 'sm' | 'md';
}>) {
  if (!stats.length) return null;
  return (
    <dl className="flex items-stretch divide-x divide-border">
      {stats.map((s) => (
        <div
          key={s.key}
          className={cn(
            'flex flex-col justify-center px-2.5 first:pl-0 last:pr-0',
            s.gauge && (size === 'md' ? 'min-w-[6.5rem]' : 'min-w-[4.5rem]'),
          )}
        >
          <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-subtle">
            {s.label}
          </dt>
          <dd
            className={cn(
              'font-mono font-semibold tabular-nums leading-tight text-foreground',
              size === 'md' ? 'text-base' : 'text-sm',
            )}
          >
            {s.value}
          </dd>
          {s.gauge && (
            <GaugeBar
              ratio={s.gauge.ratio}
              color={s.gauge.color}
              rising={s.gauge.rising}
              className="mt-1 h-1"
            />
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * « + » d'une ligne de l'ordre : les ressources de la fiche, modifiables sans quitter la liste
 * (l'ancien tiroir ±1 des PV). La fiche n'est lue qu'à l'ouverture.
 */
export function ResourcesPopover({
  characterId,
  name,
  className,
}: Readonly<{
  characterId: string;
  name: string;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Ressources">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn('relative z-10 shrink-0', className)}
            aria-label={`Ressources de ${name}`}
          >
            <Plus />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="end" className="w-80 p-0">
        {open && <ResourcesBody characterId={characterId} name={name} />}
      </PopoverContent>
    </Popover>
  );
}

function ResourcesBody({ characterId, name }: Readonly<{ characterId: string; name: string }>) {
  const { ctx, perso } = useFicheCalculee(characterId);
  const bloc = ctx ? widgetsDe(ctx).find((w) => w.type === 'ressources') : undefined;
  return (
    <div>
      <p className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">{name}</p>
      {perso.isError && <p className="p-4 text-[13px] text-destructive">Fiche indisponible.</p>}
      {!perso.isError && !ctx && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {!perso.isError && ctx && bloc?.type === 'ressources' && bloc.attributs.length > 0 && (
        <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
          <BlocRessources ctx={ctx} widget={bloc} />
        </div>
      )}
      {!perso.isError && ctx && !(bloc?.type === 'ressources' && bloc.attributs.length) && (
        <p className="p-4 text-[13px] text-subtle">Aucune ressource suivie par ce système.</p>
      )}
    </div>
  );
}

function gaugeTone(danger: boolean, rising: boolean): string {
  if (danger) return 'bg-destructive';
  return rising ? 'bg-warning' : 'bg-success';
}
