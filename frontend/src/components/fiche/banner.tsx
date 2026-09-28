'use client';

/**
 * Pièces du bandeau de la fiche : identité (entrées uniques comme la race et le profil) en
 * texte, et barre de valeurs clés (attributs du bloc « details » de la présentation, puis
 * les ressources en « valeur / max » avec un filet). Sans cadres ni pastilles : des
 * séparateurs fins, des libellés discrets, des chiffres lisibles. Rien n'est propre à un jeu.
 */
import type { Widget } from '@vtt/rules';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import {
  estRessource,
  FichePossession,
  visiblePour,
  widgetsDe,
  type ContexteFiche,
} from './widgets';

type Details = Extract<Widget, { type: 'details' }>;

/** « Elfe · Barde » : chaque entrée ouvre son détail ; la sorte est dans l'infobulle. */
export function BannerIdentity({ ctx, widget }: { ctx: ContexteFiche; widget: Details }) {
  const possessions = [...ctx.fiche.possessions.values()].filter((p) =>
    widget.sortes.includes(p.sorte.id),
  );
  if (!possessions.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
      {possessions.map((p, i) => (
        <Fragment key={p.entree.id}>
          {i > 0 && (
            <span aria-hidden className="text-subtle">
              ·
            </span>
          )}
          <FichePossession ctx={ctx} id={p.entree.id}>
            <button
              type="button"
              title={p.sorte.nom}
              className="rounded font-medium text-foreground/90 underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="sr-only">{p.sorte.nom} : </span>
              {p.entree.nom}
            </button>
          </FichePossession>
        </Fragment>
      ))}
    </p>
  );
}

interface Stat {
  cle: string;
  label: string;
  valeur: string;
  /** Ressource : part restante (0 à 1) et couleur déclarée par la présentation. */
  jauge?: { part: number; couleur?: string | undefined };
}

function statsDuBandeau(ctx: ContexteFiche, widget: Details | undefined): Stat[] {
  const { fiche, presentation } = ctx;
  const stats: Stat[] = [];
  for (const cle of widget?.attributs ?? []) {
    const a = fiche.entite.attributs.get(cle);
    const v = fiche.valeurs.get(cle);
    if (!a || !v || v.valeur === '' || v.valeur === undefined || !visiblePour(ctx, cle)) continue;
    const valeur =
      a.nature === 'choix'
        ? (a.options.find((o) => o.valeur === v.valeur)?.nom ?? String(v.valeur))
        : String(v.valeur);
    stats.push({ cle, label: a.nom, valeur });
  }
  // Ressources : celles du premier bloc « ressources » de la présentation, trois au plus
  const bloc = widgetsDe(ctx).find((w) => w.type === 'ressources');
  const ressources = (
    bloc?.type === 'ressources'
      ? bloc.attributs
      : [...fiche.entite.attributs.values()]
          .filter((a) => a.nature === 'ressource')
          .map((a) => a.cle)
  )
    .filter((c) => visiblePour(ctx, c) && estRessource(ctx, c))
    .slice(0, 3);
  for (const cle of ressources) {
    const a = fiche.entite.attributs.get(cle);
    const v = fiche.valeurs.get(cle);
    if (!a || !v || typeof v.valeur !== 'number') continue;
    const max = v.max ?? v.valeur;
    stats.push({
      cle,
      label: a.nom,
      valeur: `${v.valeur} / ${max}`,
      jauge: {
        part: max > 0 ? Math.max(0, Math.min(1, v.valeur / max)) : 0,
        couleur: presentation?.ressources[cle]?.couleur,
      },
    });
  }
  return stats;
}

/** Valeurs clés en une rangée, séparées par des filets ; les ressources ont leur jauge. */
export function BannerStats({ ctx, widget }: { ctx: ContexteFiche; widget: Details | undefined }) {
  const stats = statsDuBandeau(ctx, widget);
  if (!stats.length) return null;
  return (
    <dl className="flex flex-wrap items-stretch gap-y-3">
      {stats.map((s, i) => (
        <div
          key={s.cle}
          className={cn(
            'flex min-w-[4.5rem] flex-col justify-center pr-5',
            i > 0 && 'border-l border-border pl-5',
            s.jauge && 'min-w-[9rem]',
          )}
        >
          <dt className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            {s.label}
          </dt>
          <dd className="font-mono text-lg font-semibold tabular-nums leading-tight text-foreground">
            {s.valeur}
          </dd>
          {s.jauge && (
            <div
              aria-hidden
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className={cn('h-full rounded-full', !s.jauge.couleur && 'bg-success')}
                style={{
                  width: `${s.jauge.part * 100}%`,
                  ...(s.jauge.couleur ? { background: s.jauge.couleur } : {}),
                }}
              />
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}
