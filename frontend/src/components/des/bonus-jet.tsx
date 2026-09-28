'use client';

/**
 * Bonus de jet du personnage, à côté du lanceur : les effets `sur: jet` actifs, avec leur
 * condition en clair. Une formule libre ne sait pas quand ils s'appliquent : on les montre
 * pour ne pas les oublier. Ceux qui visent une caractéristique de la formule passent en
 * tête ; un bonus chiffré se coche pour s'ajouter au prochain jet, les autres (dés de
 * dégâts, avantage…) restent un rappel. Rien n'est propre à un jeu : tout vient du moteur.
 */
import { listerEffets, type Fiche } from '@vtt/rules';
import { useMemo } from 'react';
import { clesJetsVises } from '@/components/fiche/blocks/effects/condition-text';
import { libelleEffet, precisionEffet } from '@/components/fiche/blocks/effects/model';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FOCUS } from './tactile';

export interface BonusJet {
  cle: string;
  source: string;
  libelle: string;
  precision: string | null;
  /** Règle écrite de la source : c'est elle qui dit vraiment quand le bonus compte. */
  description: string | null;
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
        description: (effet.description ?? e.possession?.entree.description ?? '').trim() || null,
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
  className,
}: {
  bonus: BonusJet[];
  choisis: ReadonlySet<string>;
  onBasculer: (cle: string) => void;
  className?: string;
}) {
  const concernes = useMemo(() => bonus.filter((b) => b.concerne).length, [bonus]);
  if (!bonus.length) return null;
  return (
    <aside aria-labelledby="bonus-jet-titre" className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 px-1.5 pb-1.5 pt-1">
        <h2 id="bonus-jet-titre" className="text-xs font-medium text-muted-foreground">
          Bonus de jet
        </h2>
        <p className="text-[11px] text-subtle">
          {concernes > 0
            ? `${concernes} pour cette formule · allumés, ils s’ajoutent à chaque jet`
            : 'Selon la situation · allumés, ils s’ajoutent à chaque jet'}
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {bonus.map((b) => (
          <LigneBonus
            key={b.cle}
            b={b}
            coche={choisis.has(b.cle)}
            onBasculer={() => onBasculer(b.cle)}
          />
        ))}
      </ul>
    </aside>
  );
}

/**
 * Une ligne compacte : un interrupteur ajoute le bonus au prochain jet ; la règle complète de
 * la source est dans l'infobulle du texte.
 */
function LigneBonus({
  b,
  coche,
  onBasculer,
}: {
  b: BonusJet;
  coche: boolean;
  onBasculer: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('min-w-0 flex-1 cursor-help rounded', FOCUS)}>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 truncate text-[13px] font-medium',
                  b.concerne || coche ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {b.libelle}
              </span>
              {b.concerne && (
                <span
                  aria-label="concerne cette formule"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
              )}
            </span>
            <span className="block truncate text-[11px] text-subtle">
              {b.source}
              {b.precision && ` · ${b.precision}`}
              {b.terme === null && ' · à la main'}
            </span>
          </span>
        </TooltipTrigger>
        {(b.description || b.precision) && (
          <TooltipContent side="left" className="max-w-sm space-y-1.5 py-2">
            <p className="font-medium">{b.source}</p>
            {b.description && (
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                {b.description}
              </p>
            )}
            {b.precision && <p className="text-subtle">{b.precision}</p>}
          </TooltipContent>
        )}
      </Tooltip>
      {b.terme !== null && (
        <Switch
          className="scale-90"
          checked={coche}
          onCheckedChange={onBasculer}
          aria-label={`${coche ? 'Retirer' : 'Ajouter'} ${b.libelle} (${b.source}) au prochain jet`}
        />
      )}
    </li>
  );
}
