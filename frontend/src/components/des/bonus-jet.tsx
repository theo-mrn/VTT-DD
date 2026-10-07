'use client';

/**
 * Bonus du personnage, à côté du lanceur : tous, comme le bloc Bonus de la fiche (de jet, de
 * valeur, résistances), actifs ou non, et les capacités qui s'invoquent au jet (présentation
 * du système, `des.invocations`). Un seul repère : la fiche.
 * - L'interrupteur d'un bonus est son état sur la fiche, et l'écrit : couper un bonus de valeur
 *   le retire de la stat, allumer une capacité à activer l'active (usage consommé, durée
 *   lancée), allumer le bonus d'un objet rangé l'équipe.
 * - Au jet, un bonus de jet actif chiffré s'ajoute de lui-même quand il vise une stat de la
 *   formule ; un bonus de valeur, jamais : il est déjà dans la stat.
 * - Seuls les bonus qui ne sont pas un état de la fiche s'allument pour le jet : capacités à
 *   invoquer, et bonus d'une source à usages limités (une fois : le jet consomme une
 *   utilisation et l'éteint).
 * Rien n'est propre à un jeu : tout vient du moteur et de la présentation.
 */
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import {
  evaluerChampEntree,
  idEffetsDonnes,
  usagesDe,
  type BonusLibre,
  type EffetListe,
  type Fiche,
  type Presentation,
  type Usages,
} from '@vtt/rules';
import { useMemo } from 'react';
import { DurationChip, timerOf } from '@/components/combat/duration-chip';
import { clesJetsVises } from '@/components/fiche/blocks/effects/condition-text';
import {
  effetsDuPersonnage,
  libelleEffet,
  precisionEffet,
  raisonInactif,
} from '@/components/fiche/blocks/effects/model';
import { UsesChip } from '@/components/fiche/blocks/skills/uses';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Timer } from '@/lib/combat/durations';
import { cn } from '@/lib/utils';
import { FOCUS } from './tactile';

/** Groupe d'un bonus : de jet, capacité à invoquer, de valeur (attribut, résistance). */
export type GroupeBonus = 'jet' | 'invocation' | 'valeur';

/** Comment l'interrupteur d'un bonus écrit sur la fiche. */
export type BasculeBonus =
  /** Effets coupés ou rallumés, sans toucher à leur source (`etat.effetsDesactives`). */
  | { type: 'effet'; cles: string[] }
  /** Source activée ou éteinte : capacité à activer, objet équipé ou rangé. */
  | { type: 'source'; entree: string; exemplaire?: string }
  /** Bonus libre activé ou coupé. */
  | { type: 'bonus'; bonus: BonusLibre }
  /**
   * Effets donnés par une capacité (`Entree.donne`) : allumer se les donne (l'entrée qui les
   * porte, pour la durée de la capacité), éteindre les retire.
   */
  | { type: 'donne'; entree: string; capacite: string };

export interface BonusJet {
  /** Clé de l'effet (`<source>/<index>`), ou `invocation:<entrée>`. */
  cle: string;
  /** Identifiant de la source (compétence, objet, bonus libre) : une ligne par source. */
  sourceId: string;
  source: string;
  libelle: string;
  precision: string | null;
  /** Règle écrite de la source : c'est elle qui dit vraiment quand le bonus compte. */
  description: string | null;
  /** Terme à ajouter à la formule (bonus chiffré), sinon rappel seulement. */
  terme: number | null;
  /** Vise une caractéristique présente dans la formule. */
  concerne: boolean;
  /** Attributs que le bonus vise (sa condition, ou le jet qu'il implique). */
  vises: string[];
  /** Bonus de jet (effet `sur: jet` ou capacité à invoquer), sinon bonus de valeur. */
  jet: boolean;
  groupe: GroupeBonus;
  /** S'applique sur la fiche. */
  actif: boolean;
  /**
   * `fiche` : l'interrupteur est l'état sur la fiche ; `jet` : il allume le bonus pour les
   * jets seulement (capacité à invoquer, source à usages limités).
   */
  mode: 'fiche' | 'jet';
  /** Écriture de l'interrupteur sur la fiche ; null : il ne se bascule pas d'ici. */
  bascule: BasculeBonus | null;
  /** Pourquoi il ne s'applique pas. */
  raison: string | null;
  /** Entrée source (usages limités, activation, durée). */
  entree: string | null;
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

function minuterieDe(e: Pick<EffetListe, 'possession'>): Timer | null {
  for (const x of e.possession?.exemplaires ?? []) {
    const t = timerOf(x);
    if (t) return t;
  }
  return null;
}

/**
 * Ligne d'un effet : son entrée possédée (effets du catalogue et effets propres ensemble), son
 * exemplaire pour un objet en plusieurs exemplaires, sinon sa source (bonus libre).
 */
function ligneDe(e: EffetListe): string {
  if (!e.possession) return e.source;
  const ex = e.exemplaire?.exemplaire;
  return ex === undefined ? e.possession.entree.id : `${e.possession.entree.id}#${ex}`;
}

/** Écriture de l'interrupteur d'un effet listé, selon sa source. */
function basculeDe(e: EffetListe): BasculeBonus | null {
  if (e.genre === 'bonus') return e.bonus ? { type: 'bonus', bonus: e.bonus } : null;
  // Effets reçus d'une capacité : la ligne se retire en entier
  const recus = e.possession && capaciteDesEffets(e.possession.entree.id);
  if (recus) return { type: 'donne', entree: e.possession!.entree.id, capacite: recus };
  if (e.statut === 'desactive') return { type: 'effet', cles: [e.cle] };
  const p = e.possession;
  const source = p
    ? {
        type: 'source' as const,
        entree: p.entree.id,
        ...(e.exemplaire?.exemplaire !== undefined ? { exemplaire: e.exemplaire.exemplaire } : {}),
      }
    : null;
  // Capacité à activer : la capacité elle-même ; objet rangé : l'équiper
  if (source && p?.sorte.activable && !p.sorte.actifParDefaut) return source;
  if (source && p?.sorte.activable && e.raison === 'inactive') return source;
  return e.basculable ? { type: 'effet', cles: [e.cle] } : null;
}

/** Capacité dont cette entrée porte les effets donnés (`<capacité>--effets`), sinon null. */
function capaciteDesEffets(entree: string): string | null {
  return entree.endsWith(SUFFIXE_EFFETS) ? entree.slice(0, -SUFFIXE_EFFETS.length) : null;
}
const SUFFIXE_EFFETS = idEffetsDonnes('');

/**
 * Effets que les capacités possédées donnent (Bénédiction…), pas encore reçus par le
 * personnage : éteints, l'interrupteur se les donne. Reçus, ils sont des effets ordinaires.
 */
function effetsADonner(fiche: Fiche, presentes: Set<string>): BonusJet[] {
  if (!fiche.systeme.source.effetsDonnes) return [];
  const sortie: BonusJet[] = [];
  for (const p of fiche.possessions.values()) {
    const donne = p.entree.donne;
    if (!donne || (p.sorte.rangs && p.rang < 1)) continue;
    const id = idEffetsDonnes(p.entree.id);
    if (fiche.possessions.get(id)) continue;
    donne.forEach((effet, i) => {
      const valeur = 'valeur' in effet ? Number(effet.valeur) : Number.NaN;
      const jet = effet.sur === 'jet';
      const vises = jet
        ? [
            ...(effet.si !== undefined ? (clesJetsVises(fiche, effet.si) ?? []) : []),
            ...(effet.implique?.attribut ? [effet.implique.attribut] : []),
          ]
        : [];
      sortie.push({
        cle: `${id}/${i}`,
        sourceId: id,
        source: p.entree.nom,
        libelle: libelleEffet(fiche, {
          effet,
          valeur: Number.isFinite(valeur) ? valeur : undefined,
        }),
        precision: null,
        description: p.entree.description?.trim() || null,
        terme:
          jet && effet.ajout && 'bonus' in effet.ajout && Number.isFinite(Number(effet.ajout.bonus))
            ? Number(effet.ajout.bonus)
            : null,
        concerne: vises.some((c) => presentes.has(c)),
        vises,
        jet,
        groupe: jet ? 'jet' : 'valeur',
        actif: false,
        mode: 'fiche',
        bascule: { type: 'donne', entree: id, capacite: p.entree.id },
        raison: translate('dice.bonuses.toGive'),
        entree: p.entree.id,
        usages: usagesDe(fiche, p.entree.id) ?? null,
        minuterie: null,
      });
    });
  }
  return sortie;
}

/** Un effet listé par le moteur, en bonus du lanceur. */
function depuisEffet(fiche: Fiche, e: EffetListe, presentes: Set<string>): BonusJet {
  const effet = e.effet;
  const jet = effet.sur === 'jet';
  // Seuls les bonus de jet visent un jet ; un bonus de valeur est déjà dans son attribut
  const vises = jet
    ? [
        ...(effet.si !== undefined ? (clesJetsVises(fiche, effet.si) ?? []) : []),
        ...(effet.implique?.attribut ? [effet.implique.attribut] : []),
      ]
    : [];
  const chiffre =
    jet &&
    !!effet.ajout &&
    'bonus' in effet.ajout &&
    typeof e.valeur === 'number' &&
    e.valeur !== 0;
  const entree = e.possession?.entree.id ?? null;
  const p = e.possession;
  const usages = entree ? (usagesDe(fiche, entree) ?? null) : null;
  // Source à usages limités qui ne s'active pas : son bonus de jet sert une fois, au jet
  const unique = jet && usages !== null && !p?.sorte.activable;
  return {
    cle: e.cle,
    sourceId: ligneDe(e),
    source: e.nom,
    libelle: libelleEffet(fiche, e),
    precision: precisionEffet(fiche, e),
    description:
      ((jet ? effet.description : undefined) ?? p?.entree.description ?? '').trim() || null,
    terme: chiffre ? arrondi(e.valeur as number) : null,
    concerne: vises.some((c) => presentes.has(c)),
    vises,
    jet,
    groupe: jet ? 'jet' : 'valeur',
    actif: e.statut === 'actif',
    mode: unique ? 'jet' : 'fiche',
    bascule: unique ? null : basculeDe(e),
    raison: e.statut === 'inactif' ? raisonInactif(e) : null,
    entree,
    usages,
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
      sourceId: `invocation:${p.entree.id}`,
      source: p.entree.nom,
      libelle:
        terme !== null
          ? `${terme < 0 ? '−' : '+'}${Math.abs(terme)}`
          : `${avantage > 0 ? '+' : '−'}${Math.abs(avantage)} d20`,
      precision: null,
      description: p.entree.description?.trim() || null,
      terme,
      concerne: false,
      vises: [],
      jet: true,
      groupe: 'invocation',
      actif: true,
      mode: 'jet',
      bascule: null,
      raison: null,
      entree: p.entree.id,
      usages: usagesDe(fiche, p.entree.id) ?? null,
      minuterie: minuterieDe({ possession: p }),
    });
  }
  return sortie.sort((a, b) => a.source.localeCompare(b.source, 'fr'));
}

/**
 * Bonus de la fiche pour cette formule, par groupe : de jet (ceux qui la concernent d'abord),
 * à invoquer, de valeur ; dans chaque groupe, les actifs avant les autres. Les effets d'une
 * entrée à rangs sans rang (pas vraiment possédée) et les règles du système n'en sont pas.
 */
export function bonusDeJet(
  fiche: Fiche | null,
  formule: string,
  presentation: Presentation | null = null,
): BonusJet[] {
  if (!fiche) return [];
  const presentes = clesDeLaFormule(fiche, formule);
  const effets = [
    ...effetsDuPersonnage(fiche).map((e) => depuisEffet(fiche, e, presentes)),
    ...effetsADonner(fiche, presentes),
  ];
  const rang = (b: BonusJet) => (b.actif ? 0 : 2) + (b.concerne ? 0 : 1);
  const trier = (l: BonusJet[]) =>
    l
      .map((b, i) => [b, i] as const)
      .sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1])
      .map(([b]) => b);
  return [
    ...trier(effets.filter((b) => b.groupe === 'jet')),
    ...invocations(fiche, presentation),
    ...trier(effets.filter((b) => b.groupe === 'valeur')),
  ];
}

/**
 * Bonus ajoutés au jet : ceux allumés pour le jet (`mode: jet`), et les bonus de jet actifs
 * sur la fiche, chiffrés, qui visent une stat de la formule. Jamais un bonus de valeur.
 */
export function bonusRetenus(bonus: BonusJet[], choisis: ReadonlySet<string>): BonusJet[] {
  return bonus.filter(
    (b) =>
      b.terme !== null && (b.mode === 'jet' ? choisis.has(b.cle) : b.jet && b.actif && b.concerne),
  );
}

/** Formule avec les bonus retenus ajoutés (`1d20 + DEX + 3`). */
export function avecBonusRetenus(formule: string, retenus: BonusJet[]) {
  return retenus
    .filter((b) => b.terme !== null)
    .reduce((f, b) => `${f} ${b.terme! < 0 ? '-' : '+'} ${Math.abs(b.terme!)}`, formule.trim());
}

/**
 * Bonus retenus pour un jet dont la source a des usages limités (allumés pour le jet) : le jet
 * consomme une utilisation de chacune (une fois par entrée), puis ils s'éteignent.
 */
export function bonusAUsage(retenus: BonusJet[]): BonusJet[] {
  const vus = new Set<string>();
  return retenus.filter((b) => {
    if (b.mode !== 'jet' || !b.usages || !b.entree || vus.has(b.entree)) return false;
    vus.add(b.entree);
    return true;
  });
}

/** Écrit l'interrupteur d'un bonus sur la fiche. */
export interface ActionsBonus {
  basculer(b: BasculeBonus, actif: boolean): void;
}

/** Une ligne de la liste : une source (compétence, objet, bonus libre) et tous ses bonus. */
export interface LigneSource {
  cle: string;
  source: string;
  groupe: GroupeBonus;
  bonus: BonusJet[];
  /** Au moins un de ses bonus s'applique (fiche), ou est allumé pour le jet. */
  actif: boolean;
  mode: 'fiche' | 'jet';
  /** Écriture de l'interrupteur de la ligne sur la fiche ; null : figé. */
  bascule: BasculeBonus | null;
  /** Un de ses bonus de jet actif s'ajoute à cette formule. */
  ajoute: boolean;
  raison: string | null;
  description: string | null;
  usages: Usages | null;
  minuterie: Timer | null;
}

/**
 * Regroupe les bonus par source, dans l'ordre : une compétence qui donne FOR +2 et CHA +2 n'a
 * qu'une ligne et un interrupteur. Son écriture : la source elle-même si un de ses bonus la
 * bascule (capacité à activer, objet), le bonus libre, sinon tous ses effets ensemble.
 */
export function lignesParSource(bonus: BonusJet[], choisis: ReadonlySet<string>): LigneSource[] {
  const lignes = new Map<string, BonusJet[]>();
  for (const b of bonus) lignes.set(b.sourceId, [...(lignes.get(b.sourceId) ?? []), b]);
  return [...lignes.entries()].map(([cle, l]) => {
    const premier = l[0]!;
    const mode = l.every((b) => b.mode === 'jet') ? 'jet' : 'fiche';
    const fiche = l.filter((b) => b.mode === 'fiche');
    const source = fiche.find((b) => b.bascule && b.bascule.type !== 'effet')?.bascule;
    const cles = fiche.flatMap((b) => (b.bascule?.type === 'effet' ? b.bascule.cles : []));
    return {
      cle,
      source: premier.source,
      groupe:
        premier.groupe === 'invocation' ? 'invocation' : l.some((b) => b.jet) ? 'jet' : 'valeur',
      bonus: l,
      actif: mode === 'jet' ? l.some((b) => choisis.has(b.cle)) : fiche.some((b) => b.actif),
      mode,
      bascule: source ?? (cles.length ? { type: 'effet', cles } : null),
      ajoute: l.some(
        (b) => b.mode === 'fiche' && b.jet && b.actif && b.concerne && b.terme !== null,
      ),
      raison: l.find((b) => b.raison)?.raison ?? null,
      description: premier.description,
      usages: l.find((b) => b.usages)?.usages ?? null,
      minuterie: l.find((b) => b.minuterie)?.minuterie ?? null,
    };
  });
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
  /** Allume ou éteint pour le jet les bonus d'une ligne `mode: jet` (leurs clés). */
  onBasculer: (cles: string[], actif: boolean) => void;
  /** Absent : fiche en lecture seule, les interrupteurs de la fiche sont figés. */
  actions?: ActionsBonus;
  className?: string;
}>) {
  const t = useTranslations('dice.bonuses');
  const lignes = useMemo(() => lignesParSource(bonus, choisis), [bonus, choisis]);
  const ajoutes = lignes.filter((l) => l.ajoute).length;
  if (!lignes.length) return null;
  const rang = (l: LigneSource) => (l.actif ? 0 : 2) + (l.ajoute ? 0 : 1);
  const groupes = (['jet', 'invocation', 'valeur'] as const)
    .map(
      (g) =>
        [
          g,
          lignes
            .map((l, i) => [l, i] as const)
            .filter(([l]) => l.groupe === g)
            .sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1])
            .map(([l]) => l),
        ] as const,
    )
    .filter(([, l]) => l.length > 0);
  return (
    <aside aria-labelledby="bonus-jet-titre" className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 px-1.5 pb-1.5 pt-1">
        <h2 id="bonus-jet-titre" className="text-xs font-medium text-muted-foreground">
          {t('title')}
        </h2>
        {ajoutes > 0 && (
          <p className="text-[11px] text-subtle">{t('relevant', { count: ajoutes })}</p>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:thin]">
        {groupes.map(([groupe, liste]) => (
          <section key={groupe} aria-label={t(`groups.${groupe}`)}>
            {groupes.length > 1 && (
              <h3 className="px-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {t(`groups.${groupe}`)}
              </h3>
            )}
            <ul>
              {liste.map((l) => (
                <LigneBonus
                  key={l.cle}
                  l={l}
                  onBasculer={(v) =>
                    l.mode === 'jet'
                      ? onBasculer(
                          l.bonus.map((b) => b.cle),
                          v,
                        )
                      : l.bascule && actions?.basculer(l.bascule, v)
                  }
                  modifiable={l.mode === 'jet' || (!!actions && !!l.bascule)}
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
 * Une ligne compacte : la source, ses bonus en dessous ; la règle complète dans l'infobulle ;
 * usages et durée ; l'interrupteur (état sur la fiche, ou allumé pour le jet).
 */
function LigneBonus({
  l,
  onBasculer,
  modifiable,
}: Readonly<{
  l: LigneSource;
  onBasculer: (actif: boolean) => void;
  modifiable: boolean;
}>) {
  const t = useTranslations('dice.bonuses');
  const epuise = l.usages !== null && l.usages.restants <= 0;
  // Allumer une capacité ou un bonus à usage limité épuisé : refusé
  const bloque = !l.actif && epuise && (l.mode === 'jet' || l.bascule?.type === 'source');
  const libelles = l.bonus.map((b) => b.libelle).join(' · ');
  const precisions = [...new Set(l.bonus.map((b) => b.precision).filter(Boolean))].join(' · ');
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('min-w-0 flex-1 cursor-help rounded', FOCUS)}>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 truncate text-[13px] font-medium',
                  l.actif ? 'text-foreground' : 'text-subtle',
                )}
              >
                {l.source}
              </span>
              {l.ajoute && (
                <span
                  aria-label={t('concerns')}
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
              )}
            </span>
            <span className="block truncate text-[11px] text-subtle">
              {libelles}
              {l.raison && ` · ${l.raison}`}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm space-y-1.5 py-2">
          <p className="font-medium">{l.source}</p>
          <p className="text-muted-foreground">{libelles}</p>
          {precisions && <p className="text-subtle">{precisions}</p>}
          {l.description && (
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
              {l.description}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
      {l.minuterie && <DurationChip timer={l.minuterie} />}
      {l.usages && <UsesChip uses={l.usages} />}
      <Switch
        className="scale-90"
        checked={l.actif}
        disabled={!modifiable || bloque}
        onCheckedChange={onBasculer}
        aria-label={t(l.actif ? 'remove' : 'add', { label: libelles, source: l.source })}
      />
    </li>
  );
}
