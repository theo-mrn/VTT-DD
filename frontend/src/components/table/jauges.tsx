'use client';

import { widgetsDe, type ContexteFiche } from '@/components/fiche/widgets';
import { cn } from '@/lib/utils';

/** Ressources principales d'une fiche (celles du bloc « ressources » de la présentation). */
export function ressourcesPrincipales(ctx: ContexteFiche, nombre = 3): string[] {
  const w = widgetsDe(ctx).find((x) => x.type === 'ressources');
  // Des ressources seulement : un bloc en valeur peut aussi lister la Défense
  return w?.type === 'ressources'
    ? w.attributs
        .filter((c) => ctx.fiche.entite.attributs.get(c)?.nature === 'ressource')
        .slice(0, nombre)
    : [];
}

/** Petite jauge (en-tête, cartes) : libellé court, barre, valeur sur maximum. */
export function MiniJauge({
  libelle,
  valeur,
  max,
  couleur,
  montant = false,
  className,
}: Readonly<{
  libelle: string;
  valeur: number;
  max: number;
  /** Couleur déclarée par la présentation du système. */
  couleur?: string;
  /** La jauge monte quand ça va mal (stress…). */
  montant?: boolean;
  className?: string;
}>) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (valeur / max) * 100)) : 0;
  return (
    <div className={cn('min-w-0', className)} title={`${libelle} : ${valeur} / ${max}`}>
      <div className="flex items-baseline justify-between gap-2 text-[10px] leading-none">
        <span className="truncate font-medium uppercase tracking-wide text-subtle">{libelle}</span>
        <span className="font-mono text-foreground tabular">
          {valeur}
          <span className="text-subtle">/{max}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            !couleur && (montant ? 'bg-warning' : 'bg-success'),
          )}
          style={{ width: `${pct}%`, ...(couleur ? { background: couleur } : {}) }}
        />
      </div>
    </div>
  );
}

/** Jauges des ressources principales d'une fiche calculée. */
export function JaugesFiche({
  ctx,
  nombre = 3,
  className,
}: Readonly<{
  ctx: ContexteFiche;
  nombre?: number;
  className?: string;
}>) {
  const cles = ressourcesPrincipales(ctx, nombre);
  if (!cles.length) return null;
  return (
    <div className={cn('flex gap-3', className)}>
      {cles.map((cle) => {
        const a = ctx.fiche.entite.attributs.get(cle);
        const v = ctx.fiche.valeurs.get(cle);
        if (!a || !v || typeof v.valeur !== 'number') return null;
        const style = ctx.presentation?.ressources[cle];
        const montant =
          (style?.sens ??
            (a.nature === 'ressource' && a.recuperation === 'min' ? 'montant' : 'descendant')) ===
          'montant';
        return (
          <MiniJauge
            key={cle}
            libelle={a.abrege ?? a.nom}
            valeur={v.valeur}
            max={v.max ?? v.valeur}
            couleur={style?.couleur}
            montant={montant}
            className="w-20"
          />
        );
      })}
    </div>
  );
}

/** Valeur « 12/14 » d'un résumé de personnage, lue comme une jauge. */
export function jaugeDeResume(valeur: string): { valeur: number; max: number } | null {
  const m = /^\s*(-?\d+)\s*\/\s*(\d+)\s*$/.exec(valeur);
  return m ? { valeur: Number(m[1]), max: Number(m[2]) } : null;
}
