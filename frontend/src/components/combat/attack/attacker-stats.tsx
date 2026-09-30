'use client';

/**
 * Statistiques de l'attaquant (docs/combat.md § 2.1, A5 ; § 12.1) : ce que la présentation du
 * système met sur la fiche, lu sans une clé de jeu. Jauges « valeur / max » des ressources,
 * attributs de chaque bloc (caractéristiques, combat…) avec leur modificateur, et les valeurs
 * clés du profil en puces (reprises sous le nom dans l'en-tête).
 */
import type { Widget } from '@vtt/rules';
import {
  clesAttributs,
  clesRessources,
  estRessource,
  visiblePour,
  widgetsDe,
  type ContexteFiche,
} from '@/components/fiche/widgets';
import { cn } from '@/lib/utils';

export interface KeyStat {
  key: string;
  label: string;
  value: string;
  /** Ressource : part restante (0 à 1) et couleur déclarée par la présentation. */
  gauge?: { part: number; color?: string | undefined };
}

const shortName = (ctx: ContexteFiche, key: string) => {
  const a = ctx.fiche.entite.attributs.get(key);
  return a?.abrege ?? a?.nom ?? key;
};

function valueText(ctx: ContexteFiche, key: string): string | null {
  const a = ctx.fiche.entite.attributs.get(key);
  const v = ctx.fiche.valeurs.get(key);
  if (!a || !v || v.valeur === '' || v.valeur === undefined) return null;
  if (a.nature === 'choix')
    return a.options.find((o) => o.valeur === v.valeur)?.nom ?? String(v.valeur);
  return String(v.valeur);
}

/** Ressources (jauges « valeur / max ») : celles du premier bloc de ressources de la fiche. */
export function resourceStats(ctx: ContexteFiche, limit = 4): KeyStat[] {
  const bloc = widgetsDe(ctx).find(
    (w): w is Extract<Widget, { type: 'ressources' }> => w.type === 'ressources',
  );
  const keys = bloc
    ? clesRessources(ctx, bloc)
    : [...ctx.fiche.entite.attributs.values()]
        .filter((a) => a.nature === 'ressource' && visiblePour(ctx, a.cle))
        .map((a) => a.cle);
  const out: KeyStat[] = [];
  for (const key of keys.slice(0, limit)) {
    const v = ctx.fiche.valeurs.get(key);
    if (!v || typeof v.valeur !== 'number') continue;
    if (!estRessource(ctx, key)) {
      out.push({ key, label: shortName(ctx, key), value: String(v.valeur) });
      continue;
    }
    const max = v.max ?? v.valeur;
    out.push({
      key,
      label: shortName(ctx, key),
      value: `${v.valeur} / ${max}`,
      gauge: {
        part: max > 0 ? Math.max(0, Math.min(1, v.valeur / max)) : 0,
        color: ctx.presentation?.ressources[key]?.couleur,
      },
    });
  }
  return out;
}

/** Valeurs clés du profil (bloc « détails » de la présentation), en puces. */
export function profileStats(ctx: ContexteFiche): KeyStat[] {
  const bloc = widgetsDe(ctx).find(
    (w): w is Extract<Widget, { type: 'details' }> => w.type === 'details',
  );
  return (bloc?.attributs ?? []).flatMap((key) => {
    if (!visiblePour(ctx, key)) return [];
    const value = valueText(ctx, key);
    return value === null ? [] : [{ key, label: shortName(ctx, key), value }];
  });
}

export function Gauge({ stat, className }: { stat: KeyStat; className?: string }) {
  if (!stat.gauge) return null;
  return (
    <div aria-hidden className={cn('h-1 overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className={cn('h-full rounded-full', !stat.gauge.color && 'bg-success')}
        style={{
          width: `${stat.gauge.part * 100}%`,
          ...(stat.gauge.color ? { background: stat.gauge.color } : {}),
        }}
      />
    </div>
  );
}

/** Contenu du bouton « Statistiques » de l'en-tête. */
export function AttackerStats({ ctx, name }: { ctx: ContexteFiche; name: string }) {
  const resources = resourceStats(ctx, 6);
  const profile = profileStats(ctx);
  const blocks = widgetsDe(ctx).filter(
    (w): w is Extract<Widget, { type: 'attributs' }> => w.type === 'attributs',
  );
  return (
    <div className="space-y-4">
      <p className="font-display text-base font-semibold leading-tight">{name}</p>
      {resources.length > 0 && (
        <ul className="space-y-2">
          {resources.map((r) => (
            <li key={r.key} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
                  {r.label}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums">{r.value}</span>
              </div>
              <Gauge stat={r} className="mt-1" />
            </li>
          ))}
        </ul>
      )}
      {blocks.map((w, i) => {
        const keys = clesAttributs(ctx, w);
        if (!keys.length) return null;
        return (
          <section key={`${w.titre}-${i}`}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
              {w.titre}
            </p>
            <dl className="grid grid-cols-3 gap-1.5">
              {keys.map((key) => {
                const v = ctx.fiche.valeurs.get(key);
                const text = valueText(ctx, key);
                if (text === null) return null;
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center rounded-lg bg-surface-2 px-1 py-1.5"
                  >
                    <dt className="max-w-full truncate text-[10px] font-medium uppercase text-subtle">
                      {shortName(ctx, key)}
                    </dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums">
                      {text}
                      {v?.modificateur !== undefined && (
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          {v.modificateur >= 0 ? '+' : ''}
                          {v.modificateur}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
      {profile.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.map((p) => (
            <span
              key={p.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-[12px]"
            >
              <span className="text-subtle">{p.label}</span>
              <span className="font-medium">{p.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
