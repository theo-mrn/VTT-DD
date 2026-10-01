'use client';

import type { Fiche } from '@vtt/rules';
import { Check, ChevronsUpDown, Swords, UserRound, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { degradeDe } from '@/components/commun/illustration';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { usePersonnage, type Personnage } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';
import type { RollableAttribute, RollableGroup } from '@/lib/rollable-attributes';
import { cn } from '@/lib/utils';

// ─── Fiche du personnage ─────────────────────────────────────────────────────

/**
 * Fiche calculée d'un personnage (sa fiche complète et son système chargés à
 * la demande) : c'est elle qui donne un sens à `@FOR` ou `mod(@FOR)` dans une
 * formule.
 */
export function useFichePersonnage(personnage: Personnage | null) {
  const complet = usePersonnage(personnage?.id);
  // Règles réglées avec les options de sa campagne (Contact en surcharge…)
  const systeme = useCampaignSystem(personnage?.system.id, personnage?.roomId);
  const etat = complet.data?.state;
  const calcul = useMemo((): { fiche: Fiche | null; erreur: string | null } => {
    if (!etat || !systeme.data) return { fiche: null, erreur: null };
    try {
      return { fiche: calculerMemo(systeme.data.systeme, etat), erreur: null };
    } catch (e) {
      return { fiche: null, erreur: e instanceof Error ? e.message : 'Fiche illisible' };
    }
  }, [etat, systeme.data]);

  return {
    ...calcul,
    chargement: Boolean(personnage) && (systeme.isPending || complet.isPending),
    erreur:
      calcul.erreur ??
      (systeme.error ? systeme.error.message : complet.error ? complet.error.message : null),
  };
}

export const signe = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/**
 * Puces des attributs jetables (déclarés par le système, moins ceux que le MJ a
 * retirés pour la campagne), par groupes : un clic ajoute leur clé nue à la
 * formule (`CON`, `INIT`), que le moteur lit selon le système (`mod(@CON)`, `@INIT`).
 */
export function PastillesAttributs({
  groupes,
  chargement,
  erreur,
  nomPersonnage,
  onAjouter,
}: {
  groupes: RollableGroup[];
  chargement: boolean;
  erreur: string | null;
  nomPersonnage: string;
  onAjouter: (a: RollableAttribute) => void;
}) {
  if (erreur)
    return (
      <p className="truncate text-xs text-destructive">
        Fiche de {nomPersonnage} indisponible : {erreur}
      </p>
    );
  if (chargement)
    return (
      <div className="flex gap-1.5 overflow-hidden" aria-label="Chargement des attributs">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
        ))}
      </div>
    );
  if (!groupes.some((g) => g.attributes.length))
    return <p className="text-xs text-subtle">Aucun attribut à ajouter pour ce système.</p>;
  const titres = groupes.some((g) => g.title);
  return (
    <div className="space-y-2">
      {groupes.map((g) => (
        <div key={g.id ?? 'sans-groupe'} className="space-y-1">
          {titres && g.title && <p className="text-[11px] text-muted-foreground">{g.title}</p>}
          <ul className={LIGNE_PUCES} aria-label={g.title ?? `Attributs de ${nomPersonnage}`}>
            {g.attributes.map((a) => (
              <li key={a.key} className="shrink-0">
                <Info texte={`${a.name} : ajoute + ${a.key} (lu comme ${a.term})`}>
                  <button
                    type="button"
                    onClick={() => onAjouter(a)}
                    aria-label={`Ajouter ${a.key}, ${a.name} (${signe(a.value)})`}
                    className={cn(
                      PUCE,
                      'hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    )}
                  >
                    <span className="font-semibold tracking-wide text-foreground">{a.label}</span>
                    <span
                      className={cn(
                        'font-mono tabular',
                        a.value > 0 && 'text-success',
                        a.value < 0 && 'text-destructive',
                        a.value === 0 && 'text-subtle',
                      )}
                    >
                      {signe(a.value)}
                    </span>
                  </button>
                </Info>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Puces qui passent à la ligne. */
export const LIGNE_PUCES = 'flex flex-wrap items-center gap-1.5';

/** Puce du lanceur (modificateur, macro) : 32 px, 44 px au doigt. */
export const PUCE =
  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface-2/60 px-3 text-xs transition-colors [@media(pointer:coarse)]:h-11';

// ─── Sélecteurs ──────────────────────────────────────────────────────────────

export interface OptionContexte {
  id: string;
  libelle: string;
  detail?: string;
}

function Vignette({
  graine,
  libelle,
  className,
}: {
  graine: string;
  libelle: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ background: degradeDe(graine) }}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white/90 ring-1 ring-inset ring-white/10',
        className,
      )}
    >
      {libelle.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Choix d'un élément facultatif (campagne, personnage) dans un menu. Le
 * déclencheur est une puce compacte ; la première ligne remet « aucun ».
 */
export function SelecteurContexte({
  etiquette,
  icone: Icone,
  options,
  valeur,
  onChange,
  aucun,
  vide,
  chargement,
}: {
  etiquette: string;
  icone: LucideIcon;
  options: OptionContexte[];
  valeur: string | null;
  onChange: (id: string | null) => void;
  /** Libellé du choix « aucun ». */
  aucun: string;
  /** Message quand la liste est vide. */
  vide: string;
  chargement?: boolean;
}) {
  const choisie = options.find((o) => o.id === valeur) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${etiquette} : ${chargement ? 'chargement' : (choisie?.libelle ?? aucun)}`}
        title={etiquette}
        className={cn(
          'flex h-9 min-w-0 max-w-[14rem] items-center gap-2 rounded-lg border border-border bg-surface-2/60 pl-2 pr-2 text-left text-[13px] transition-colors [@media(pointer:coarse)]:h-11',
          'hover:border-border-strong data-[state=open]:border-primary/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        )}
      >
        {choisie ? (
          <Vignette graine={choisie.id} libelle={choisie.libelle} />
        ) : (
          <Icone className="size-4 shrink-0 text-subtle" aria-hidden />
        )}
        <span className={cn('min-w-0 flex-1 truncate', !choisie && 'text-muted-foreground')}>
          {chargement ? 'Chargement…' : (choisie?.libelle ?? aucun)}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuLabel>{etiquette}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <Icone aria-hidden />
          <span className="flex-1">{aucun}</span>
          {!choisie && <Check className="text-primary" aria-hidden />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.length ? (
          options.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} className="py-1.5">
              <Vignette graine={o.id} libelle={o.libelle} className="size-7 rounded-lg text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{o.libelle}</span>
                {o.detail && (
                  <span className="block truncate text-[11px] text-subtle">{o.detail}</span>
                )}
              </span>
              {o.id === valeur && <Check className="text-primary" aria-hidden />}
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2.5 py-2 text-xs text-subtle">{vide}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ICONES_CONTEXTE = { campagne: Swords, personnage: UserRound };
