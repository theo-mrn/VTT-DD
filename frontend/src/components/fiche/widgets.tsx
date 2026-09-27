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
  type Widget,
  nouvellePossession,
} from '@vtt/rules';
import { ChevronRight, Coins, Dices, GitBranch, Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { JaugeRessource, TuileAttribut } from '@/components/creation/apercu-fiche';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Info } from '@/components/ui/tooltip';
import { champsLisibles, groupesAttributs, texteEffet } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { LanceurAction } from './lanceur-action';

export interface ContexteFiche {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  personnage: { id: string; name: string; roomId: string | null };
  /** Absent : fiche en lecture seule (personnage d'un autre joueur). */
  onEtat?: (e: EtatEntite) => void;
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
  const ressources = [...fiche.entite.attributs.values()].filter((a) => a.nature === 'ressource');
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
}: {
  titre: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card shadow-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">{titre}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Attributs ───────────────────────────────────────────────────────────────

export function BlocAttributs({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'attributs' }>;
}) {
  const { fiche } = ctx;
  const cles =
    widget.attributs ??
    [...fiche.entite.attributs.values()]
      .filter((a) => a.groupe === widget.groupe && a.nature !== 'texte' && a.nature !== 'ressource')
      .map((a) => a.cle);
  const colonnes = widget.colonnes ?? Math.min(6, cles.length);
  return (
    <Bloc titre={widget.titre}>
      <div
        className="grid grid-cols-3 gap-2 sm:[grid-template-columns:repeat(var(--colonnes),minmax(0,1fr))]"
        style={{ ['--colonnes' as string]: colonnes }}
      >
        {cles.map((c) => (
          <TuileAttribut key={c} fiche={fiche} cle={c} />
        ))}
      </div>
    </Bloc>
  );
}

// ─── Ressources ──────────────────────────────────────────────────────────────

export function BlocRessources({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'ressources' }>;
}) {
  const { fiche, onEtat } = ctx;
  function ajuster(cle: string, delta: number) {
    const v = fiche.valeurs.get(cle);
    if (!onEtat || !v || typeof v.valeur !== 'number') return;
    const min = v.min ?? Number.NEGATIVE_INFINITY;
    const max = v.max ?? Number.POSITIVE_INFINITY;
    const suivante = Math.max(min, Math.min(max, v.valeur + delta));
    onEtat({ ...fiche.etat, valeurs: { ...fiche.etat.valeurs, [cle]: suivante } });
  }
  return (
    <Bloc titre={widget.titre}>
      <div className="space-y-4">
        {widget.attributs.map((c) => (
          <div key={c} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <JaugeRessource fiche={fiche} cle={c} presentation={ctx.presentation} />
            </div>
            {onEtat && (
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="icon-xs"
                  onClick={() => ajuster(c, -1)}
                  aria-label="Retirer 1"
                >
                  <Minus />
                </Button>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  onClick={() => ajuster(c, 1)}
                  aria-label="Ajouter 1"
                >
                  <Plus />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Bloc>
  );
}

// ─── Détails (entrées uniques) ───────────────────────────────────────────────

export function ChipsDetails({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'details' }>;
}) {
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
            className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-2/80 py-1 pl-3 pr-2 text-[13px] backdrop-blur transition-colors hover:border-primary/40"
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
            className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-2/80 px-3 py-1 text-[13px] backdrop-blur"
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
function FichePossession({
  ctx,
  id,
  children,
}: {
  ctx: ContexteFiche;
  id: string;
  children: ReactNode;
}) {
  const e = ctx.systeme.entrees.get(id);
  if (!e) return <>{children}</>;
  const effets = e.effets
    .map((x) => texteEffet(ctx.fiche, x))
    .filter((x): x is string => Boolean(x));
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
        {(effets.length > 0 || champs.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {champs.map((c) => (
              <Badge key={c.nom} taille="md">
                {c.nom} : <span className="text-foreground">{c.valeur}</span>
              </Badge>
            ))}
            {effets.slice(0, 8).map((t) => (
              <Badge key={t} ton="primaire" taille="md">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Possessions ─────────────────────────────────────────────────────────────

export function BlocPossessions({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'possessions' }>;
}) {
  const { fiche, onEtat } = ctx;
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
    if (!onEtat) return;
    const r = acheter(ctx.systeme, fiche.etat, { achat, objet, date: new Date().toISOString() });
    if (r.ok) onEtat(r.etat);
  }

  function basculer(id: string, actif: boolean) {
    if (!onEtat) return;
    const etat = fiche.etat;
    const existe = etat.possessions.some((p) => p.entree === id);
    onEtat({
      ...etat,
      possessions: existe
        ? etat.possessions.map((p) => (p.entree === id ? { ...p, actif } : p))
        : [...etat.possessions, nouvellePossession(id, 0, { actif })],
    });
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
    <Bloc
      titre={
        <span className="flex items-center gap-2">
          {widget.titre} <span className="text-xs font-normal text-subtle">{liste.length}</span>
        </span>
      }
    >
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
                  {onEtat && achats.get(p.entree.id) && (
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
                      disabled={!onEtat}
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

// ─── Monnaies, arbres, texte ─────────────────────────────────────────────────

export function BlocMonnaies({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'monnaies' }>;
}) {
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

export function BlocArbres({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'arbres' }>;
}) {
  const arbres = [...ctx.systeme.arbres.values()].filter(
    (a) => (ctx.fiche.etat.noeuds[a.id]?.length ?? 0) > 0,
  );
  if (arbres.length === 0) return null;
  return (
    <Bloc titre={widget.titre}>
      <ul className="space-y-2">
        {arbres.map((a) => (
          <li key={a.id} className="flex items-center gap-3 text-sm">
            <GitBranch className="size-4 text-primary" />
            <span className="flex-1">{a.nom}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {ctx.fiche.etat.noeuds[a.id]?.length} nœud(s)
            </span>
          </li>
        ))}
      </ul>
    </Bloc>
  );
}

export function BlocTexte({
  ctx,
  widget,
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'texte' }>;
}) {
  const v = ctx.fiche.valeurs.get(widget.attribut)?.valeur;
  if (typeof v !== 'string' || !v.trim()) return null;
  return (
    <Bloc titre={widget.titre}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{v}</p>
    </Bloc>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Actions lançables depuis la fiche : sans cible (les attaques se jouent en combat) et accessibles. */
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
}: {
  ctx: ContexteFiche;
  widget: Extract<Widget, { type: 'actions' }>;
}) {
  const actions = actionsDisponibles(ctx, widget.actions);
  const [ouverte, setOuverte] = useState<string | null>(null);
  if (actions.length === 0) return null;
  const choisie = actions.find((a) => a.id === ouverte);
  return (
    <Bloc titre={widget.titre}>
      <div className="grid gap-2 sm:grid-cols-2">
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
          onEtat={(e) => ctx.onEtat?.(e)}
        />
      )}
    </Bloc>
  );
}
