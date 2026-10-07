'use client';

/**
 * Bonus de jet du personnage, à côté du lanceur : tous ses effets `sur: jet`, actifs ou non, et
 * les capacités qui s'invoquent au jet (présentation du système, `des.invocations`). Une formule
 * libre ne sait pas quand ils s'appliquent : on les montre pour ne pas les oublier.
 * - En tête, ceux qui visent une caractéristique de la formule ; puis les autres actifs, les
 *   capacités à invoquer, et enfin les inactifs (capacité éteinte, effet coupé, objet rangé),
 *   grisés avec leur raison.
 * - Un bonus chiffré s'allume pour s'ajouter aux jets, actif ou non (« pour ce jet ») ; les
 *   autres (dés de dégâts, avantage…) restent un rappel.
 * - Une capacité éteinte s'active d'ici pour de bon (« Activer » : la fiche change, un usage
 *   est consommé, sa durée commence) ; un effet coupé se réactive.
 * - Usages limités et durée restante de la source sont montrés sur la ligne. Un bonus dont la
 *   source a des usages limités sert une fois : le jet en consomme une utilisation et l'éteint.
 * Rien n'est propre à un jeu : tout vient du moteur et de la présentation.
 */
import { useTranslations } from 'next-intl';
import {
  evaluerChampEntree,
  listerEffets,
  usagesDe,
  type EffetListe,
  type Fiche,
  type Presentation,
  type Usages,
} from '@vtt/rules';
import { Power } from 'lucide-react';
import { useMemo } from 'react';
import { DurationChip, timerOf } from '@/components/combat/duration-chip';
import { clesJetsVises } from '@/components/fiche/blocks/effects/condition-text';
import {
  libelleEffet,
  precisionEffet,
  raisonInactif,
} from '@/components/fiche/blocks/effects/model';
import { UsesChip } from '@/components/fiche/blocks/skills/uses';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Info, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Timer } from '@/lib/combat/durations';
import { cn } from '@/lib/utils';
import { FOCUS } from './tactile';

/** Où en est la source du bonus. */
export type EtatBonus = 'actif' | 'invocation' | 'inactif';

export interface BonusJet {
  /** Clé de l'effet (`<source>/<index>`), ou `invocation:<entrée>`. */
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
  etat: EtatBonus;
  /** Pourquoi il ne s'applique pas (inactif). */
  raison: string | null;
  /** Entrée source (usages limités, activation, durée). */
  entree: string | null;
  /** La source s'active sur la fiche (capacité à activer éteinte). */
  activable: boolean;
  /** Effet coupé à la main, à réactiver (sa clé). */
  reactivable: string | null;
  usages: Usages | null;
  minuterie: Timer | null;
}

/** Clés nues de la formule qui sont des attributs de la fiche (`1d20 + DEX` → DEX). */
function clesDeLaFormule(fiche: Fiche, formule: string): Set<string> {
  const r = new Set<string>();
  for (const m of formule.matchAll(/@?([A-Za-z_]\w*)/g))
    if (fiche.entite.attributs.has(m[1]!)) r.add(m[1]!);
  return r;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Entrée source d'un effet listé (entrée possédée ou exemplaire), sinon null. */
function entreeDe(e: EffetListe): string | null {
  return e.possession?.entree.id ?? null;
}

function minuterieDe(e: Pick<EffetListe, 'possession'>): Timer | null {
  for (const x of e.possession?.exemplaires ?? []) {
    const t = timerOf(x);
    if (t) return t;
  }
  return null;
}

/** Un effet de jet listé par le moteur, en bonus du lanceur. */
function depuisEffet(fiche: Fiche, e: EffetListe, presentes: Set<string>): BonusJet {
  const effet = e.effet as Extract<EffetListe['effet'], { sur: 'jet' }>;
  const vises = [
    ...(effet.si !== undefined ? (clesJetsVises(fiche, effet.si) ?? []) : []),
    ...(effet.implique?.attribut ? [effet.implique.attribut] : []),
  ];
  const chiffre =
    effet.ajout && 'bonus' in effet.ajout && typeof e.valeur === 'number' && e.valeur !== 0;
  const entree = entreeDe(e);
  const p = e.possession;
  const eteinte = e.statut === 'inactif' && e.raison === 'inactive' && !!p?.sorte.activable;
  return {
    cle: e.cle,
    source: e.nom,
    libelle: libelleEffet(fiche, e),
    precision: precisionEffet(fiche, e),
    description: (effet.description ?? p?.entree.description ?? '').trim() || null,
    terme: chiffre ? arrondi(e.valeur as number) : null,
    concerne: vises.some((c) => presentes.has(c)),
    etat: e.statut === 'actif' ? 'actif' : 'inactif',
    raison: e.statut === 'desactive' ? null : e.statut === 'inactif' ? raisonInactif(e) : null,
    entree,
    activable: eteinte,
    reactivable: e.statut === 'desactive' ? e.cle : null,
    usages: entree ? (usagesDe(fiche, entree) ?? null) : null,
    minuterie: minuterieDe(e),
  };
}

/** Capacités possédées qui s'invoquent au jet (`presentation.des.invocations`). */
function invocations(fiche: Fiche, presentation: Presentation | null): BonusJet[] {
  const decl = presentation?.des?.invocations;
  if (!decl) return [];
  const sortie: BonusJet[] = [];
  for (const p of fiche.possessions.values()) {
    if (!p.entree.etiquettes.includes(decl.etiquette)) continue;
    if (p.sorte.rangs ? p.rang < 1 : false) continue;
    const bonus = evaluerChampEntree(fiche, p.entree.id, decl.bonus);
    const avantage = decl.avantage
      ? Number(p.possession?.champs[decl.avantage] ?? p.entree.champs[decl.avantage] ?? 0)
      : 0;
    const terme = typeof bonus === 'number' && bonus !== 0 ? arrondi(bonus) : null;
    if (terme === null && !avantage) continue;
    sortie.push({
      cle: `invocation:${p.entree.id}`,
      source: p.entree.nom,
      libelle:
        terme !== null
          ? `${terme < 0 ? '−' : '+'}${Math.abs(terme)}`
          : `${avantage > 0 ? '+' : '−'}${Math.abs(avantage)} d20`,
      precision: null,
      description: p.entree.description?.trim() || null,
      terme,
      concerne: false,
      etat: 'invocation',
      raison: null,
      entree: p.entree.id,
      activable: false,
      reactivable: null,
      usages: usagesDe(fiche, p.entree.id) ?? null,
      minuterie: minuterieDe({ possession: p }),
    });
  }
  return sortie.sort((a, b) => a.source.localeCompare(b.source, 'fr'));
}

/**
 * Bonus de jet de la fiche pour cette formule : actifs (ceux qui la concernent d'abord),
 * capacités à invoquer, puis inactifs. Les effets d'une entrée à rangs sans rang (pas
 * vraiment possédée) et les règles du système n'en sont pas.
 */
export function bonusDeJet(
  fiche: Fiche | null,
  formule: string,
  presentation: Presentation | null = null,
): BonusJet[] {
  if (!fiche) return [];
  const presentes = clesDeLaFormule(fiche, formule);
  const effets = listerEffets(fiche)
    .filter((e) => e.effet.sur === 'jet' && e.genre !== 'regle' && e.raison !== 'non-effective')
    .map((e) => depuisEffet(fiche, e, presentes));
  const actifs = effets.filter((b) => b.etat === 'actif');
  return [
    ...actifs.filter((b) => b.concerne),
    ...actifs.filter((b) => !b.concerne),
    ...invocations(fiche, presentation),
    ...effets.filter((b) => b.etat === 'inactif'),
  ];
}

/** Formule avec les bonus cochés ajoutés (`1d20 + DEX + 3`). */
export function avecBonusChoisis(formule: string, bonus: BonusJet[], choisis: ReadonlySet<string>) {
  const termes = bonus.filter((b) => b.terme !== null && choisis.has(b.cle));
  return termes.reduce(
    (f, b) => `${f} ${b.terme! < 0 ? '-' : '+'} ${Math.abs(b.terme!)}`,
    formule.trim(),
  );
}

/**
 * Bonus retenus pour un jet dont la source a des usages limités et ne s'active pas : le jet
 * consomme une utilisation de chacune (une fois par entrée), puis ils s'éteignent.
 */
export function bonusAUsage(bonus: BonusJet[], choisis: ReadonlySet<string>): BonusJet[] {
  const vus = new Set<string>();
  return bonus.filter((b) => {
    if (!choisis.has(b.cle) || b.terme === null || !b.usages || !b.entree) return false;
    if (b.activable || vus.has(b.entree)) return false;
    vus.add(b.entree);
    return true;
  });
}

/** Activer la source d'un bonus : capacité éteinte, ou effet coupé. */
export interface ActionsBonus {
  activer(entree: string): void;
  reactiver(cle: string): void;
}

export function BonusJetListe({
  bonus,
  choisis,
  onBasculer,
  actions,
  className,
}: Readonly<{
  bonus: BonusJet[];
  choisis: ReadonlySet<string>;
  onBasculer: (cle: string) => void;
  /** Absent : fiche en lecture seule, pas d'activation d'ici. */
  actions?: ActionsBonus;
  className?: string;
}>) {
  const t = useTranslations('dice.bonuses');
  const concernes = useMemo(() => bonus.filter((b) => b.concerne).length, [bonus]);
  if (!bonus.length) return null;
  const groupes: [EtatBonus, BonusJet[]][] = (
    [
      ['actif', bonus.filter((b) => b.etat === 'actif')],
      ['invocation', bonus.filter((b) => b.etat === 'invocation')],
      ['inactif', bonus.filter((b) => b.etat === 'inactif')],
    ] as [EtatBonus, BonusJet[]][]
  ).filter(([, l]) => l.length > 0);
  return (
    <aside aria-labelledby="bonus-jet-titre" className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 px-1.5 pb-1.5 pt-1">
        <h2 id="bonus-jet-titre" className="text-xs font-medium text-muted-foreground">
          {t('title')}
        </h2>
        <p className="text-[11px] text-subtle">
          {concernes > 0 ? t('relevant', { count: concernes }) : t('situational')}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:thin]">
        {groupes.map(([etat, liste]) => (
          <section key={etat} aria-label={t(`groups.${etat}`)}>
            {groupes.length > 1 && (
              <h3 className="px-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {t(`groups.${etat}`)}
              </h3>
            )}
            <ul>
              {liste.map((b) => (
                <LigneBonus
                  key={b.cle}
                  b={b}
                  coche={choisis.has(b.cle)}
                  onBasculer={() => onBasculer(b.cle)}
                  actions={actions}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

/**
 * Une ligne compacte : la règle complète de la source dans l'infobulle du texte ; usages et
 * durée de la source ; « Activer » pour une source éteinte ; un interrupteur ajoute le bonus
 * aux jets.
 */
function LigneBonus({
  b,
  coche,
  onBasculer,
  actions,
}: Readonly<{
  b: BonusJet;
  coche: boolean;
  onBasculer: () => void;
  actions: ActionsBonus | undefined;
}>) {
  const t = useTranslations('dice.bonuses');
  const inactif = b.etat === 'inactif';
  const activer =
    actions && b.activable && b.entree
      ? () => actions.activer(b.entree!)
      : actions && b.reactivable
        ? () => actions.reactiver(b.reactivable!)
        : null;
  const epuise = b.usages !== null && b.usages.restants <= 0;
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('min-w-0 flex-1 cursor-help rounded', FOCUS)}>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 truncate text-[13px] font-medium',
                  inactif && !coche
                    ? 'text-subtle'
                    : b.concerne || coche
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {b.libelle}
              </span>
              {b.concerne && (
                <span
                  aria-label={t('concerns')}
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
              )}
            </span>
            <span className="block truncate text-[11px] text-subtle">
              {b.source}
              {b.precision && ` · ${b.precision}`}
              {b.raison && ` · ${b.raison}`}
              {b.reactivable && t('disabled')}
              {b.terme === null && t('manual')}
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
      {b.minuterie && <DurationChip timer={b.minuterie} />}
      {b.usages && <UsesChip uses={b.usages} />}
      {activer && (
        <Info texte={t('activate', { source: b.source })}>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t('activate', { source: b.source })}
            disabled={b.activable && epuise}
            onClick={activer}
          >
            <Power />
          </Button>
        </Info>
      )}
      {b.terme !== null && (
        <Switch
          className="scale-90"
          checked={coche}
          disabled={epuise && !coche}
          onCheckedChange={onBasculer}
          aria-label={t(coche ? 'remove' : 'add', { label: b.libelle, source: b.source })}
        />
      )}
    </li>
  );
}
