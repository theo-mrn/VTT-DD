'use client';

import { calculer, type Fiche } from '@vtt/rules';
import { Check, ChevronsUpDown, Plus, Swords, UserRound, type LucideIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
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
import { usePersonnage, type Personnage } from '@/lib/personnages';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';

// ─── Fiche du personnage ─────────────────────────────────────────────────────

/**
 * Fiche calculée d'un personnage (sa fiche complète et son système chargés à
 * la demande) : c'est elle qui donne un sens à `@FOR` ou `mod(@FOR)` dans une
 * formule.
 */
export function useFichePersonnage(personnage: Personnage | null) {
  const complet = usePersonnage(personnage?.id);
  const systeme = useSysteme(personnage?.system.id);
  const etat = complet.data?.state;
  const calcul = useMemo((): { fiche: Fiche | null; erreur: string | null } => {
    if (!etat || !systeme.data) return { fiche: null, erreur: null };
    try {
      return { fiche: calculer(systeme.data.systeme, etat), erreur: null };
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

export interface AttributJetable {
  cle: string;
  libelle: string;
  nom: string;
  modificateur: number;
}

/** Attributs visibles qui portent un modificateur (caractéristiques…), dans l'ordre du système. */
export function attributsJetables(fiche: Fiche): AttributJetable[] {
  const liste: AttributJetable[] = [];
  for (const a of fiche.entite.attributs.values()) {
    if (a.nature !== 'base' && a.nature !== 'derivee') continue;
    if (a.modificateur === undefined || a.modificateur === false || a.visibilite === 'mj') continue;
    liste.push({
      cle: a.cle,
      libelle: a.abrege ?? a.nom,
      nom: a.nom,
      modificateur: fiche.valeurs.get(a.cle)?.modificateur ?? 0,
    });
  }
  return liste;
}

export const signe = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Pastilles des modificateurs : un clic ajoute `+ mod(@CLE)` à la formule. */
export function PastillesAttributs({
  attributs,
  chargement,
  erreur,
  nomPersonnage,
  onAjouter,
}: {
  attributs: AttributJetable[];
  chargement: boolean;
  erreur: string | null;
  nomPersonnage: string;
  onAjouter: (cle: string) => void;
}) {
  if (erreur)
    return (
      <p className="text-xs text-destructive">
        Fiche de {nomPersonnage} indisponible : {erreur}
      </p>
    );
  if (chargement)
    return (
      <div className="flex flex-wrap gap-1.5" aria-label="Chargement de la fiche">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-[68px] rounded-lg" />
        ))}
      </div>
    );
  if (!attributs.length)
    return (
      <p className="text-xs text-subtle">
        Ce système n’a pas de modificateur à ajouter ; écrivez{' '}
        <code className="font-mono">@CLÉ</code> dans la formule.
      </p>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {attributs.map((a) => (
        <Info key={a.cle} texte={`Ajouter le modificateur de ${a.nom} : + mod(@${a.cle})`}>
          <button
            type="button"
            onClick={() => onAjouter(a.cle)}
            aria-label={`Ajouter le modificateur de ${a.nom} (${signe(a.modificateur)})`}
            className={cn(
              'group inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-surface-2/60 pl-2 pr-2.5 text-xs transition-colors',
              'hover:border-primary/40 hover:bg-primary/[0.06]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            <Plus
              className="size-3 text-subtle transition-colors group-hover:text-primary"
              aria-hidden
            />
            <span className="font-semibold tracking-wide text-foreground">{a.libelle}</span>
            <span
              className={cn(
                'font-mono tabular',
                a.modificateur > 0 && 'text-success',
                a.modificateur < 0 && 'text-destructive',
                a.modificateur === 0 && 'text-subtle',
              )}
            >
              {signe(a.modificateur)}
            </span>
          </button>
        </Info>
      ))}
    </div>
  );
}

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
 * Choix d'un élément facultatif (campagne, personnage) dans un menu : le
 * déclencheur a l'allure d'un champ, la première ligne remet « aucun ».
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
  const id = useId();
  const choisie = options.find((o) => o.id === valeur) ?? null;

  return (
    <div className="min-w-0 space-y-2">
      <p id={id} className="text-xs font-medium leading-none text-muted-foreground">
        {etiquette}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-labelledby={id}
          className={cn(
            'flex h-10 w-full items-center gap-2.5 rounded-lg border border-input bg-surface-2/60 px-3 text-left text-sm shadow-surface transition-[border-color,box-shadow]',
            'hover:border-border-strong data-[state=open]:border-primary/60 data-[state=open]:ring-4 data-[state=open]:ring-primary/10',
            'focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10',
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
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px]"
        >
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <Icone aria-hidden />
            <span className="flex-1">{aucun}</span>
            {!choisie && <Check className="text-primary" aria-hidden />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {options.length ? (
            <>
              <DropdownMenuLabel>{etiquette}s</DropdownMenuLabel>
              {options.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} className="py-1.5">
                  <Vignette
                    graine={o.id}
                    libelle={o.libelle}
                    className="size-7 rounded-lg text-xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{o.libelle}</span>
                    {o.detail && (
                      <span className="block truncate text-[11px] text-subtle">{o.detail}</span>
                    )}
                  </span>
                  {o.id === valeur && <Check className="text-primary" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <p className="px-2.5 py-2 text-xs text-subtle">{vide}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const ICONES_CONTEXTE = { campagne: Swords, personnage: UserRound };
