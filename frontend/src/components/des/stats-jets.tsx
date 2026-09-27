'use client';

import { BarChart3, Skull, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { statistiques, type Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';

const MOYENNE_ATTENDUE = 10.5;
const nombre = (n: number, decimales = 1) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: decimales });
const pourcent = (part: number, total: number) =>
  total ? `${nombre((part / total) * 100, 0)} %` : '—';

/** Statistiques des jets de l'historique : volume, critiques, et honnêteté des d20. */
export function StatsJets({ jets }: { jets: Jet[] }) {
  const stats = useMemo(() => statistiques(jets), [jets]);
  const nbD20 = stats.repartitionD20.reduce((s, n) => s + n, 0);

  if (!stats.nombre)
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 shadow-surface">
          <BarChart3 className="size-5 text-subtle" aria-hidden />
        </div>
        <p className="text-sm font-medium">Pas encore de statistiques</p>
        <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
          Lancez quelques dés : moyenne, critiques et répartition des d20 apparaîtront ici.
        </p>
      </div>
    );

  const ecart = stats.moyenneD20 !== null ? stats.moyenneD20 - MOYENNE_ATTENDUE : null;

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-2">
        <TuileStat libelle="Jets" valeur={nombre(stats.nombre, 0)}>
          {nbD20 ? `${nombre(nbD20, 0)} d20 retenus` : 'Aucun d20'}
        </TuileStat>
        <TuileStat
          libelle="Moyenne d20"
          valeur={stats.moyenneD20 !== null ? nombre(stats.moyenneD20) : '—'}
        >
          {ecart === null ? (
            'attendue : 10,5'
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                ecart > 0.05 && 'text-success',
                ecart < -0.05 && 'text-destructive',
              )}
            >
              {ecart > 0.05 ? (
                <TrendingUp className="size-3" aria-hidden />
              ) : ecart < -0.05 ? (
                <TrendingDown className="size-3" aria-hidden />
              ) : null}
              {ecart >= 0 ? '+' : '−'}
              {nombre(Math.abs(ecart))} vs 10,5
            </span>
          )}
        </TuileStat>
        <TuileStat
          libelle="Critiques"
          icone={<Sparkles className="size-3.5 text-primary" aria-hidden />}
          valeur={nombre(stats.critiques, 0)}
        >
          {pourcent(stats.critiques, stats.nombre)} des jets
        </TuileStat>
        <TuileStat
          libelle="Échecs critiques"
          icone={<Skull className="size-3.5 text-destructive" aria-hidden />}
          valeur={nombre(stats.echecsCritiques, 0)}
        >
          {pourcent(stats.echecsCritiques, stats.nombre)} des jets
        </TuileStat>
      </div>

      {nbD20 > 0 ? (
        <>
          <RepartitionD20 repartition={stats.repartitionD20} total={nbD20} />
          {stats.moyenneD20 !== null && <JaugeChance moyenne={stats.moyenneD20} total={nbD20} />}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-xs text-subtle">
          Aucun d20 dans l’historique : la répartition apparaîtra avec votre premier d20.
        </p>
      )}
    </div>
  );
}

function TuileStat({
  libelle,
  valeur,
  icone,
  children,
}: {
  libelle: string;
  valeur: string;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {libelle}
      </p>
      <p className="mt-1.5 font-mono text-2xl font-semibold leading-none tracking-tight">
        {valeur}
      </p>
      <p className="mt-1.5 truncate text-[11px] text-subtle">{children}</p>
    </div>
  );
}

/**
 * Histogramme des 20 faces : une seule série (gris), le 1 et le 20 mis en
 * évidence, une ligne pour la fréquence attendue d'un dé équilibré. Le
 * survol (ou le toucher) détaille une face ; un tableau caché sert les
 * lecteurs d'écran.
 */
function RepartitionD20({ repartition, total }: { repartition: number[]; total: number }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const attendu = total / 20;
  const plafond = Math.max(...repartition, attendu) * 1.1;
  const hauteur = (n: number) => `${(n / plafond) * 100}%`;
  const detail = survol !== null ? repartition[survol - 1]! : null;

  return (
    <figure className="space-y-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">Répartition des d20</span>
        <span className="min-h-4 text-right text-[11px] text-subtle tabular" aria-hidden>
          {detail !== null ? (
            <>
              <span className="font-mono font-semibold text-foreground">{survol}</span> ·{' '}
              {nombre(detail, 0)} fois ({pourcent(detail, total)})
            </>
          ) : (
            `${nombre(total, 0)} dés · touchez une barre`
          )}
        </span>
      </figcaption>

      <div aria-hidden className="relative h-36" onPointerLeave={() => setSurvol(null)}>
        {/* Quadrillage discret : base et fréquence attendue */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-border-strong" />
        <div
          className="absolute inset-x-0 z-10 h-px bg-foreground/35"
          style={{ bottom: hauteur(attendu) }}
        />

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {repartition.map((n, i) => {
            const face = i + 1;
            const actif = survol === face;
            return (
              <div
                key={face}
                onPointerEnter={() => setSurvol(face)}
                onPointerDown={() => setSurvol(face)}
                className="flex h-full flex-1 cursor-default items-end justify-center"
              >
                <div
                  className={cn(
                    'w-full max-w-[24px] rounded-t-[4px] transition-[background-color,height] duration-500 ease-out',
                    face === 20 && (actif ? 'bg-primary-strong' : 'bg-primary'),
                    face === 1 && (actif ? 'bg-destructive' : 'bg-destructive/80'),
                    face !== 1 &&
                      face !== 20 &&
                      (actif ? 'bg-muted-foreground' : 'bg-muted-foreground/40'),
                    n === 0 && 'h-[2px] rounded-none bg-border-strong',
                  )}
                  style={n ? { height: hauteur(n) } : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div aria-hidden className="flex gap-[2px] font-mono text-[10px] text-subtle">
        {repartition.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {[1, 5, 10, 15, 20].includes(i + 1) ? i + 1 : ''}
          </span>
        ))}
      </div>

      <div aria-hidden className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-primary" /> 20 naturel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-destructive/80" /> 1 naturel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-3 bg-foreground/50" /> dé équilibré ({nombre(attendu)})
        </span>
      </div>

      <table className="sr-only">
        <caption>Répartition des d20 retenus, sur {total} dés</caption>
        <thead>
          <tr>
            <th scope="col">Face</th>
            <th scope="col">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {repartition.map((n, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Où tombe la moyenne des d20 entre 1 et 20, face à 10,5. */
function JaugeChance({ moyenne, total }: { moyenne: number; total: number }) {
  const position = (v: number) => `${((v - 1) / 19) * 100}%`;
  const ecart = moyenne - MOYENNE_ATTENDUE;
  // Sous une vingtaine de dés, l'écart n'a pas de sens : on le dit plutôt que d'en tirer un verdict
  const verdict =
    total < 20
      ? 'Encore trop peu de d20 pour juger.'
      : ecart > 1
        ? 'Les dés vous sourient.'
        : ecart < -1
          ? 'Les dés vous boudent.'
          : 'Des dés parfaitement honnêtes.';

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium">Chance</p>
        <p className="text-[11px] text-muted-foreground">{verdict}</p>
      </div>
      <div
        role="img"
        aria-label={`Moyenne des d20 : ${nombre(moyenne)}, pour 10,5 attendu`}
        className="relative h-2 rounded-full bg-gradient-to-r from-destructive/30 via-surface-3 to-primary/40"
      >
        <span
          aria-hidden
          className="absolute -top-1 h-4 w-px bg-foreground/40"
          style={{ left: position(MOYENNE_ATTENDUE) }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-surface transition-[left] duration-700 ease-out"
          style={{ left: position(Math.min(20, Math.max(1, moyenne))) }}
        />
      </div>
      <div aria-hidden className="flex justify-between font-mono text-[10px] text-subtle">
        <span>1</span>
        <span>10,5</span>
        <span>20</span>
      </div>
    </div>
  );
}
