'use client';

/**
 * Bonus de jet du personnage, à côté du lanceur : les effets `sur: jet` actifs, avec leur
 * condition en clair. Une formule libre ne sait pas quand ils s'appliquent : on les montre
 * pour ne pas les oublier. Ceux qui visent une caractéristique de la formule passent en
 * tête ; un bonus chiffré se coche pour s'ajouter au prochain jet, les autres (dés de
 * dégâts, avantage…) restent un rappel. Rien n'est propre à un jeu : tout vient du moteur.
 */
import { listerEffets, type Fiche } from '@vtt/rules';
import { Check, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { clesJetsVises } from '@/components/fiche/blocks/effects/condition-text';
import { libelleEffet, precisionEffet } from '@/components/fiche/blocks/effects/model';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';

export interface BonusJet {
  cle: string;
  source: string;
  libelle: string;
  precision: string | null;
  /** Terme à ajouter à la formule (bonus chiffré), sinon rappel seulement. */
  terme: number | null;
  /** Vise une caractéristique présente dans la formule. */
  concerne: boolean;
}

/** Clés nues de la formule qui sont des attributs de la fiche (`1d20 + DEX` → DEX). */
function clesDeLaFormule(fiche: Fiche, formule: string): Set<string> {
  const r = new Set<string>();
  for (const m of formule.matchAll(/@?([A-Za-z_][\w]*)/g))
    if (fiche.entite.attributs.has(m[1]!)) r.add(m[1]!);
  return r;
}

export function bonusDeJet(fiche: Fiche | null, formule: string): BonusJet[] {
  if (!fiche) return [];
  const presentes = clesDeLaFormule(fiche, formule);
  const liste = listerEffets(fiche)
    .filter((e) => e.effet.sur === 'jet' && e.statut === 'actif')
    .map((e): BonusJet => {
      const effet = e.effet as Extract<typeof e.effet, { sur: 'jet' }>;
      const vises = [
        ...(effet.si !== undefined ? (clesJetsVises(fiche, effet.si) ?? []) : []),
        ...(effet.implique?.attribut ? [effet.implique.attribut] : []),
      ];
      const chiffre =
        effet.ajout && 'bonus' in effet.ajout && typeof e.valeur === 'number' && e.valeur !== 0;
      return {
        cle: e.cle,
        source: e.nom,
        libelle: libelleEffet(fiche, e),
        precision: precisionEffet(fiche, e),
        terme: chiffre ? Math.round((e.valeur as number) * 100) / 100 : null,
        concerne: vises.some((c) => presentes.has(c)),
      };
    });
  return [...liste.filter((b) => b.concerne), ...liste.filter((b) => !b.concerne)];
}

/** Formule avec les bonus cochés ajoutés (`1d20 + DEX + 3`). */
export function avecBonusChoisis(formule: string, bonus: BonusJet[], choisis: ReadonlySet<string>) {
  const termes = bonus.filter((b) => b.terme !== null && choisis.has(b.cle));
  return termes.reduce(
    (f, b) => `${f} ${b.terme! < 0 ? '-' : '+'} ${Math.abs(b.terme!)}`,
    formule.trim(),
  );
}

export function BonusJetListe({
  bonus,
  choisis,
  onBasculer,
}: {
  bonus: BonusJet[];
  choisis: ReadonlySet<string>;
  onBasculer: (cle: string) => void;
}) {
  const concernes = useMemo(() => bonus.filter((b) => b.concerne).length, [bonus]);
  if (!bonus.length) return null;
  return (
    <section
      aria-labelledby="bonus-jet-titre"
      className="rounded-2xl border border-border bg-card shadow-surface"
    >
      <div className="flex items-baseline gap-2 px-3 pb-1 pt-2">
        <h2 id="bonus-jet-titre" className="text-xs font-medium text-muted-foreground">
          Bonus de jet
        </h2>
        <span className="text-[11px] text-subtle">
          {concernes > 0
            ? `${concernes} pour cette formule`
            : 'selon la situation, à ajouter vous-même'}
        </span>
      </div>
      <ul className="max-h-56 overflow-y-auto px-1.5 pb-1.5 [scrollbar-width:thin]">
        {bonus.map((b) => {
          const coche = choisis.has(b.cle);
          const contenu = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  b.terme === null
                    ? 'border-transparent'
                    : coche
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border-strong text-subtle',
                )}
              >
                {b.terme !== null &&
                  (coche ? <Check className="size-3.5" /> : <Plus className="size-3.5" />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">
                  <span className={b.concerne ? 'text-foreground' : 'text-muted-foreground'}>
                    {b.libelle}
                  </span>
                  <span className="text-xs text-subtle"> · {b.source}</span>
                </span>
                {b.precision && (
                  <span className="block truncate text-[11px] text-subtle" title={b.precision}>
                    {b.precision}
                  </span>
                )}
              </span>
              {b.concerne && (
                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  cette formule
                </span>
              )}
            </>
          );
          return (
            <li key={b.cle}>
              {b.terme !== null ? (
                <button
                  type="button"
                  aria-pressed={coche}
                  onClick={() => onBasculer(b.cle)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2',
                    coche && 'bg-primary/[0.06]',
                    FOCUS,
                    TACTILE,
                  )}
                >
                  {contenu}
                </button>
              ) : (
                <div
                  className="flex items-center gap-2 px-1.5 py-1.5"
                  title="Rappel : à appliquer à la main"
                >
                  {contenu}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
