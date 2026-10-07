'use client';

import {
  acheter,
  achatsPossibles,
  chemins,
  essayer,
  soldes,
  type Action,
  type EtatEntite,
  type Fiche,
  type Presentation,
  type SystemeCharge,
  type Valeur,
  type Widget,
  nouvellePossession,
} from '@vtt/rules';
import { ChevronRight, Coins, Dices, Pencil, Plus, Swords } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { JaugeRessource, TuileAttribut } from '@/components/creation/apercu-fiche';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { FittingLabel } from '@/components/ui/fitting-label';
import { Info } from '@/components/ui/tooltip';
import { targetedActions } from '@/lib/combat/actions';
import { openAttackMenu, useAttackHost } from '@/lib/combat/attack-menu-store';
import { afficherValeur, champsLisibles, explication, groupesAttributs } from '@/lib/creation';
import type {
  DemandeBonus,
  DemandeDon,
  DemandeDossier,
  DemandePossession,
  OperationsPersonnage,
} from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { EntryBonuses } from './blocks/effects/entry-bonuses';
import { ICONES } from './blocks/inventory/item-icon';
import { arrangeTiles, type TileArrangement } from './blocks/tiles/model';
import { TileGrid } from './blocks/tiles/tile-grid';
import { PossessionDuration } from '@/components/combat/duration-chip';
import { LanceurAction } from './lanceur-action';
import { ResourceDialog } from './resource-dialog';

/**
 * Écritures de la fiche, enregistrées par le service character. `apercu` est
 * l'état calculé localement par le moteur, montré aussitôt ; la réponse du
 * service le remplace (ou le corrige en cas de refus).
 */
export interface OperationsFiche {
  valeurs(valeurs: Record<string, Valeur>, apercu: EtatEntite): void;
  acheter(achat: string, objet: string, apercu: EtatEntite): void;
  possession(d: DemandePossession, apercu: EtatEntite): void;
  /** Retire une possession (un exemplaire précis ; absent : l'exemplaire sans identifiant). */
  retirerPossession(entree: string, exemplaire: string | undefined, apercu: EtatEntite): void;
  /**
   * Donne un objet à un personnage de la même campagne ; vrai si le service l'a fait
   * (une erreur est déjà signalée).
   */
  donner?(d: DemandeDon, apercu: EtatEntite): Promise<boolean>;
  /** Remplace les dossiers d'inventaire (ordre, noms, ajouts, suppressions). */
  dossiers?(folders: DemandeDossier[], apercu: EtatEntite): void;
  /** Pose ou remplace (même `id`) un bonus libre. */
  bonus(d: DemandeBonus, apercu: EtatEntite): void;
  retirerBonus(id: string, apercu: EtatEntite): void;
  /** Active ou coupe des effets (clés `<source>/<index>`) sans toucher à leur source. */
  effet?(effets: string[], actif: boolean, apercu: EtatEntite): void;
  /** Annule l'achat de la ligne `index` du journal et rend son coût. */
  rembourser?(index: number, apercu: EtatEntite): void;
  /** Action du système : jet tiré par le service, conséquences appliquées s'il le faut. */
  action: OperationsPersonnage['action'];
}

export interface ContexteFiche {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  personnage: { id: string; name: string; roomId: string | null; portraitUrl?: string | null };
  /** Absent : fiche en lecture seule (droits renvoyés par le service character). */
  operations?: OperationsFiche;
  /** L'utilisateur mène la campagne du personnage : il voit aussi les attributs réservés au MJ. */
  mj?: boolean;
}

/**
 * Blocs de la fiche : ceux de la présentation du système, sinon une
 * disposition déduite des groupes d'attributs et des sortes possédées.
 */
export function widgetsDe(ctx: ContexteFiche): Widget[] {
  const declares = ctx.presentation?.fiches[ctx.fiche.etat.type]?.widgets;
  if (declares?.length) return declares;
  const { fiche } = ctx;
  const uniques = [...fiche.systeme.sortes.values()].filter(
    (s) => s.maximum === 1 && s.pour.includes(fiche.etat.type),
  );
  const ressources = [...fiche.entite.attributs.values()].filter(
    (a) => a.nature === 'ressource' && fiche.attributActif(a.cle),
  );
  const sortesPossedees = new Set([...fiche.possessions.values()].map((p) => p.sorte.id));
  return [
    { type: 'details', titre: 'Profil', sortes: uniques.map((s) => s.id), attributs: [] },
    ...groupesAttributs(fiche)
      .filter((g) => g.attributs.some((a) => a.nature !== 'ressource'))
      .map((g) => ({ type: 'attributs' as const, titre: g.nom, groupe: g.id })),
    ...(ressources.length
      ? [
          {
            type: 'ressources' as const,
            titre: 'Ressources',
            attributs: ressources.map((a) => a.cle),
          },
        ]
      : []),
    ...[...sortesPossedees]
      .filter((s) => !uniques.some((u) => u.id === s))
      .map((s) => ({
        type: 'possessions' as const,
        titre: fiche.systeme.sortes.get(s)!.nomPluriel ?? fiche.systeme.sortes.get(s)!.nom,
        sorte: s,
      })),
    { type: 'monnaies', titre: 'Monnaies' },
    { type: 'actions', titre: 'Actions' },
  ];
}

export function Bloc({
  titre,
  action,
  children,
  className,
}: Readonly<{
  titre: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    // Dans la grille de la fiche, le bloc remplit sa case et son contenu défile
    <section
      className={cn(
        'flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card shadow-surface',
        className,
      )}
    >
      {/* Pas de bandeau de titre : il prenait de la place pour rien. Le titre reste lu par les
          lecteurs d'écran ; seules les actions éventuelles gardent une ligne. */}
      <h2 className="sr-only">{titre}</h2>
      {action && <div className="flex shrink-0 justify-end px-3 pt-2">{action}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">{children}</div>
    </section>
  );
}

// ─── Attributs ───────────────────────────────────────────────────────────────

/** Clés affichées par un bloc d'attributs (liste ou groupe), visibles de l'utilisateur. */
export function clesAttributs(
  ctx: ContexteFiche,
  widget: Extract<Widget, { type: 'attributs' }>,
): string[] {
  return (
    widget.attributs ??
    [...ctx.fiche.entite.attributs.values()]
      .filter((a) => a.groupe === widget.groupe && a.nature !== 'texte' && a.nature !== 'ressource')
      .map((a) => a.cle)
  ).filter((c) => visiblePour(ctx, c));
}

/** Largeur minimale d'une tuile d'attribut (px, 4,5 rem). */
export const TUILE_ATTRIBUT_MIN = 72;

export function BlocAttributs({
  ctx,
  widget,
  arrangement,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'attributs' }>;
  /** Disposition réglée en personnalisation ; absente : celle de la présentation. */
  arrangement?: TileArrangement;
}>) {
  const { fiche } = ctx;
  const cles = arrangeTiles(clesAttributs(ctx, widget), arrangement);
  return (
    <Bloc titre={widget.titre}>
      {/* `colonnes` de la présentation : préférence (au plus) quand la disposition est auto */}
      <TileGrid
        columns={arrangement?.columns}
        count={cles.length}
        minPx={TUILE_ATTRIBUT_MIN}
        cap={widget.colonnes}
      >
        {cles.map((c) => (
          <TuileAttribut key={c} fiche={fiche} cle={c} compacte />
        ))}
      </TileGrid>
    </Bloc>
  );
}

/**
 * Attribut montré à l'utilisateur : sur la fiche (pas d'une règle optionnelle éteinte pour
 * la campagne), et s'il est réservé au MJ (`visibilite: mj`), au MJ seul.
 */
export function visiblePour(ctx: Pick<ContexteFiche, 'fiche' | 'mj'>, cle: string): boolean {
  if (!ctx.fiche.attributActif(cle)) return false;
  return ctx.mj === true || ctx.fiche.entite.attributs.get(cle)?.visibilite !== 'mj';
}

// ─── Ressources ──────────────────────────────────────────────────────────────

/** L'attribut est une ressource (valeur courante bornée) : lui seul a une jauge. */
export function estRessource(ctx: Pick<ContexteFiche, 'fiche'>, cle: string): boolean {
  return ctx.fiche.entite.attributs.get(cle)?.nature === 'ressource';
}

/**
 * Ressources en jauges (défaut), ou en chiffres (`affichage: valeur`) : « PV / PV max »
 * pour une ressource, valeur simple pour un autre attribut (Défense). Les ressources se
 * règlent par + et − pour qui peut modifier la fiche.
 */
/**
 * Clés affichées par un bloc de ressources : toutes celles qui ont une valeur en chiffres,
 * les seules ressources en jauges.
 */
export function clesRessources(
  ctx: ContexteFiche,
  widget: Extract<Widget, { type: 'ressources' }>,
): string[] {
  return widget.attributs.filter(
    (c) =>
      visiblePour(ctx, c) &&
      ctx.fiche.valeurs.has(c) &&
      (widget.affichage === 'valeur' || estRessource(ctx, c)),
  );
}

export function BlocRessources({
  ctx,
  widget,
  arrangement,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'ressources' }>;
  /** Disposition réglée en personnalisation ; absente : celle de la présentation. */
  arrangement?: TileArrangement;
}>) {
  const { fiche, operations: ecritures } = ctx;
  function ajuster(cle: string, delta: number) {
    const v = fiche.valeurs.get(cle);
    if (!ecritures || !v || typeof v.valeur !== 'number') return;
    const min = v.min ?? Number.NEGATIVE_INFINITY;
    const max = v.max ?? Number.POSITIVE_INFINITY;
    const suivante = Math.max(min, Math.min(max, v.valeur + delta));
    if (suivante === v.valeur) return;
    ecritures.valeurs(
      { [cle]: suivante },
      { ...fiche.etat, valeurs: { ...fiche.etat.valeurs, [cle]: suivante } },
    );
  }
  const cles = arrangeTiles(clesRessources(ctx, widget), arrangement);
  // Ressource modifiable : sa valeur ouvre un petit éditeur (« -3 », « +5 », « =12 »)
  const modifier = (c: string) =>
    ecritures && estRessource(ctx, c) ? (d: number) => ajuster(c, d) : undefined;

  if (widget.affichage === 'valeur')
    return (
      <Bloc titre={widget.titre}>
        {/* Tuiles de 8 rem au moins, trois par ligne au plus en auto */}
        <TileGrid columns={arrangement?.columns} count={cles.length} minPx={128} cap={3}>
          {cles.map((c) => (
            <ValeurChiffree key={c} ctx={ctx} cle={c} onAjuster={modifier(c)} />
          ))}
        </TileGrid>
      </Bloc>
    );

  return (
    <Bloc titre={widget.titre}>
      {/* Une jauge par ligne en auto (préférence du bloc) ; colonnes au choix sinon */}
      <TileGrid columns={arrangement?.columns} count={cles.length} minPx={192} cap={1} gapPx={16}>
        {cles.map((c) => (
          <div key={c} className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <JaugeRessource fiche={fiche} cle={c} presentation={ctx.presentation} />
            </div>
            {modifier(c) && (
              <ResourceDialog
                nom={fiche.entite.attributs.get(c)?.nom ?? c}
                valeur={Number(fiche.valeurs.get(c)?.valeur ?? 0)}
                min={fiche.valeurs.get(c)?.min}
                max={fiche.valeurs.get(c)?.max}
                {...apparenceAttribut(ctx, c)}
                onAjuster={modifier(c)!}
              >
                <Button variant="ghost" size="icon-xs" aria-label={`Modifier ${c}`}>
                  <Pencil />
                </Button>
              </ResourceDialog>
            )}
          </div>
        ))}
      </TileGrid>
    </Bloc>
  );
}

/** Icône d'un attribut déclarée par la présentation (cœur des PV…), et sa couleur. */
function apparenceAttribut(ctx: ContexteFiche, cle: string) {
  const ap = ctx.presentation?.attributs[cle];
  return {
    Icone: ap?.icone ? ICONES[ap.icone] : null,
    couleur: ap?.couleur ?? ctx.presentation?.ressources[cle]?.couleur,
  };
}

/**
 * Valeur en chiffres : « courante / max » pour une ressource, sinon la valeur seule ; icône
 * de la présentation à gauche. Une ressource modifiable s'ajuste en cliquant sa valeur.
 */
function ValeurChiffree({
  ctx,
  cle,
  onAjuster,
}: Readonly<{
  ctx: ContexteFiche;
  cle: string;
  onAjuster?: (delta: number) => void;
}>) {
  const a = ctx.fiche.entite.attributs.get(cle);
  const v = ctx.fiche.valeurs.get(cle);
  if (!a || !v) return null;
  const { Icone, couleur } = apparenceAttribut(ctx, cle);
  const lignes = explication(v);
  const chiffres = (
    <span className="font-mono text-xl font-semibold leading-tight tabular">
      {afficherValeur(v)}
      {a.nature === 'ressource' && v.max !== undefined && (
        <span className="text-sm font-normal text-subtle"> / {v.max}</span>
      )}
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-2/70 px-3 py-2">
      {Icone && (
        <Icone
          aria-hidden
          className={cn('size-5 shrink-0', !couleur && 'text-subtle')}
          style={couleur ? { color: couleur } : undefined}
        />
      )}
      <div className="min-w-0 flex-1">
        <Info
          texte={
            <span className="block space-y-0.5">
              <span className="block font-medium">{a.nom}</span>
              {lignes.map((l) => (
                <span key={l} className="block font-mono text-[11px] text-muted-foreground">
                  {l}
                </span>
              ))}
            </span>
          }
        >
          <span
            tabIndex={0}
            className="block min-w-0 cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <FittingLabel
              long={a.nom}
              short={a.abrege}
              className="text-[10px] font-medium uppercase tracking-wider text-subtle"
            />
          </span>
        </Info>
        {onAjuster && typeof v.valeur === 'number' ? (
          <ResourceDialog
            nom={a.nom}
            valeur={v.valeur}
            min={v.min}
            max={v.max}
            Icone={Icone}
            couleur={couleur}
            onAjuster={onAjuster}
          >
            <button
              type="button"
              aria-label={`Modifier ${a.nom}`}
              className="-mx-1 rounded-md px-1 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {chiffres}
            </button>
          </ResourceDialog>
        ) : (
          <p>{chiffres}</p>
        )}
      </div>
    </div>
  );
}

// ─── Détails (entrées uniques) ───────────────────────────────────────────────

export function ChipsDetails({
  ctx,
  widget,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'details' }>;
}>) {
  const { fiche } = ctx;
  const possessions = [...fiche.possessions.values()].filter((p) =>
    widget.sortes.includes(p.sorte.id),
  );
  return (
    <div className="flex flex-wrap gap-2">
      {possessions.map((p) => (
        <FichePossession key={p.entree.id} ctx={ctx} id={p.entree.id}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-2/95 py-1 pl-3 pr-2 text-[13px] transition-colors hover:border-primary/40"
          >
            <span className="text-subtle">{p.sorte.nom}</span>
            <span className="font-medium">{p.entree.nom}</span>
            <ChevronRight className="size-3.5 text-subtle" />
          </button>
        </FichePossession>
      ))}
      {widget.attributs.map((cle) => {
        const a = fiche.entite.attributs.get(cle);
        const v = fiche.valeurs.get(cle);
        if (!a || !v || v.valeur === '' || v.valeur === undefined) return null;
        return (
          <span
            key={cle}
            className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-2/95 px-3 py-1 text-[13px]"
          >
            <span className="text-subtle">{a.nom}</span>
            <span className="font-medium">
              {a.nature === 'choix'
                ? (a.options.find((o) => o.valeur === v.valeur)?.nom ?? String(v.valeur))
                : String(v.valeur)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Fenêtre de détail d'une entrée possédée (description, effets, champs). */
export function FichePossession({
  ctx,
  id,
  children,
}: Readonly<{
  ctx: ContexteFiche;
  id: string;
  children: ReactNode;
}>) {
  const e = ctx.systeme.entrees.get(id);
  if (!e) return <>{children}</>;
  const champs = champsLisibles(ctx.systeme, e);
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <p className="font-display text-lg font-semibold">{e.nom}</p>
        {e.description && (
          <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
            {e.description}
          </p>
        )}
        {champs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {champs.map((c) => (
              <Badge key={c.nom} taille="md">
                {c.nom} : <span className="text-foreground">{c.valeur}</span>
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-3 empty:hidden">
          <EntryBonuses fiche={ctx.fiche} entry={e} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Possessions ─────────────────────────────────────────────────────────────

export function BlocPossessions({
  ctx,
  widget,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'possessions' }>;
}>) {
  const { fiche, operations: ecritures } = ctx;
  const sorte = ctx.systeme.sortes.get(widget.sorte);
  // Une entrée à rangs n'apparaît qu'avec un rang, sauf si elle est prise explicitement (voie au rang 0)
  const liste = [...fiche.possessions.values()]
    .filter((p) => p.sorte.id === widget.sorte && (p.rang > 0 || !p.sorte.rangs || p.possession))
    .sort((a, b) => a.entree.nom.localeCompare(b.entree.nom, 'fr'));
  // Achats en jeu qui visent cette sorte (rang de voie…) : proposés sur chaque ligne
  const achats = new Map(
    achatsPossibles(fiche)
      .filter((d) => d.achat.obtient.type === 'rang' && d.achat.obtient.sorte === widget.sorte)
      .flatMap((d) => d.objets.map((o) => [o.objet, o] as const)),
  );
  if (!sorte || liste.length === 0) return null;

  function monter(achat: string, objet: string) {
    if (!ecritures) return;
    const r = acheter(ctx.systeme, fiche.etat, { achat, objet, date: new Date().toISOString() });
    if (r.ok) ecritures.acheter(achat, objet, r.etat);
  }

  function basculer(id: string, actif: boolean) {
    if (!ecritures) return;
    const etat = fiche.etat;
    const existe = etat.possessions.some((p) => p.entree === id);
    ecritures.possession(
      { entree: id, actif },
      {
        ...etat,
        possessions: existe
          ? etat.possessions.map((p) => (p.entree === id ? { ...p, actif } : p))
          : [...etat.possessions, nouvellePossession(id, 0, { actif })],
      },
    );
  }

  // Regroupement éventuel par un champ (compétences par caractéristique…)
  const groupes = new Map<string, typeof liste>();
  for (const p of liste) {
    const v = widget.groupeChamp ? p.entree.champs[widget.groupeChamp] : undefined;
    const cle =
      typeof v === 'string'
        ? (fiche.entite.attributs.get(v)?.nom ?? ctx.systeme.entrees.get(v)?.nom ?? v)
        : '';
    groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
  }

  return (
    <Bloc titre={widget.titre}>
      <div className="space-y-4">
        {[...groupes].map(([groupe, items]) => (
          <div key={groupe}>
            {groupe && (
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                {groupe}
              </p>
            )}
            <ul className="divide-y divide-border">
              {items.map((p) => (
                <li key={p.entree.id} className="flex items-center gap-3 py-2">
                  <FichePossession ctx={ctx} id={p.entree.id}>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm transition-colors hover:text-primary"
                    >
                      {p.entree.nom}
                    </button>
                  </FichePossession>
                  <PossessionDuration exemplaires={p.exemplaires} />
                  {p.sorte.rangs && (
                    <span className="flex items-center gap-0.5" aria-label={`Rang ${p.rang}`}>
                      {Array.from({ length: Math.min(p.rang, 6) }, (_, i) => (
                        <span key={i} className="size-1.5 rounded-full bg-primary" />
                      ))}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        {p.rang}
                      </span>
                    </span>
                  )}
                  {ecritures && achats.get(p.entree.id) && (
                    <Info
                      texte={
                        achats.get(p.entree.id)!.possible
                          ? `Rang ${achats.get(p.entree.id)!.cible} pour ${achats.get(p.entree.id)!.cout} ${ctx.systeme.monnaies.get(achats.get(p.entree.id)!.monnaie)?.nom ?? ''}`
                          : achats
                              .get(p.entree.id)!
                              .blocages.map((b) => b.message)
                              .join(' · ')
                      }
                    >
                      <span>
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          disabled={!achats.get(p.entree.id)!.possible}
                          onClick={() => monter(achats.get(p.entree.id)!.achat, p.entree.id)}
                          aria-label={`Monter ${p.entree.nom} d'un rang`}
                        >
                          <Plus />
                        </Button>
                      </span>
                    </Info>
                  )}
                  {p.sorte.activable && (
                    <button
                      type="button"
                      disabled={!ecritures}
                      onClick={() => basculer(p.entree.id, !p.actif)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-default',
                        p.actif
                          ? 'border-success/40 bg-success/10 text-success'
                          : 'border-border-strong text-subtle hover:text-foreground',
                      )}
                    >
                      {p.actif ? 'Actif' : 'Inactif'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Bloc>
  );
}

// ─── Monnaies, texte ───────────────────────────────────────────────────────

export function BlocMonnaies({
  ctx,
  widget,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'monnaies' }>;
}>) {
  const liste = soldes(ctx.fiche);
  if (liste.length === 0) return null;
  return (
    <Bloc titre={widget.titre}>
      <div className="space-y-4">
        {liste.map((m) => (
          <div key={m.monnaie.id}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="flex items-center gap-2 text-sm">
                <Coins className="size-4 text-primary" />
                {m.monnaie.nom}
              </span>
              <span className="font-mono text-lg font-semibold tabular">{m.solde}</span>
            </div>
            <Progress valeur={m.total > 0 ? (m.solde / m.total) * 100 : 0} />
            <p className="mt-1 text-xs text-subtle">
              {m.depense} dépensé(s) sur {m.total}
            </p>
          </div>
        ))}
      </div>
    </Bloc>
  );
}

export function BlocTexte({
  ctx,
  widget,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'texte' }>;
}>) {
  const v = ctx.fiche.valeurs.get(widget.attribut)?.valeur;
  if (typeof v !== 'string' || !v.trim()) return null;
  return (
    <Bloc titre={widget.titre}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{v}</p>
    </Bloc>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Actions lançables depuis la fiche : sans cible (celles à cible se jouent dans le menu
 * d'attaque, bouton « Attaquer » du bloc) et accessibles.
 */
export function actionsDisponibles(ctx: ContexteFiche, ids?: string[]): Action[] {
  return [...ctx.systeme.actions.values()].filter((a) => {
    if (ids && !ids.includes(a.id)) return false;
    if (a.cible || !a.pour.includes(ctx.fiche.etat.type)) return false;
    const exige = ctx.systeme.formules.get(chemins.action(a.id, 'exige'));
    if (!exige) return true;
    const r = essayer(ctx.fiche, exige);
    return r.ok && r.valeur === true;
  });
}

export function BlocActions({
  ctx,
  widget,
}: Readonly<{
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'actions' }>;
}>) {
  const actions = actionsDisponibles(ctx, widget.actions);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Actions à cible (attaques, sorts, soins) : elles se jouent dans le menu d'attaque, à la table
  const campagne = ctx.personnage.roomId;
  const aLaTable = useAttackHost(campagne);
  const attaque =
    aLaTable &&
    Boolean(campagne && ctx.operations && targetedActions(ctx.systeme, ctx.fiche).length);
  // Le service tire les jets d'action pour qui peut modifier le personnage
  if ((actions.length === 0 && !attaque) || !ctx.operations) return null;
  const operations = ctx.operations;
  const choisie = actions.find((a) => a.id === ouverte);
  return (
    <Bloc
      titre={widget.titre}
      action={
        attaque ? (
          <Button
            size="xs"
            onClick={() =>
              openAttackMenu({
                campaignId: campagne!,
                origin: 'sheet',
                attackerId: ctx.personnage.id,
              })
            }
          >
            <Swords />
            Attaquer
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 empty:hidden">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOuverte(a.id)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-3 text-primary transition-colors group-hover:border-primary/40">
              <Dices className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.nom}</span>
          </button>
        ))}
      </div>
      {choisie && (
        <LanceurAction
          key={choisie.id}
          systeme={ctx.systeme}
          presentation={ctx.presentation}
          fiche={ctx.fiche}
          action={choisie}
          personnage={ctx.personnage}
          ouvert
          onOuvert={(v) => !v && setOuverte(null)}
          onAction={operations.action}
        />
      )}
    </Bloc>
  );
}
