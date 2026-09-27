'use client';

/**
 * Petites pièces du bloc Inventaire : vignette, étiquettes de bonus, quantité, état
 * équipé, menu d'un objet. Aucune clé de jeu : libellés et valeurs viennent du modèle.
 */
import { Check, Minus, MoreHorizontal, Plus, Copy, Eye, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { BonusLabel, InventoryItem } from './model';

/** Image de l'entrée déclarée par la présentation, sinon son initiale. */
export function Thumbnail({
  nom,
  image,
  className,
}: {
  nom: string;
  image?: string | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-3 font-display text-sm font-semibold text-primary',
        className,
      )}
    >
      {image ? (
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        nom.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Étiquettes des bonus d'un objet ; `max` : au-delà, un compteur « +n ». */
export function BonusBadges({
  bonus,
  max,
  taille = 'sm',
}: {
  bonus: BonusLabel[];
  max?: number;
  taille?: 'sm' | 'md';
}) {
  if (!bonus.length) return null;
  const montres = max === undefined ? bonus : bonus.slice(0, max);
  const reste = bonus.length - montres.length;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {montres.map((b, i) => {
        const aide = [
          b.description,
          b.conditionnel ? 'Sous condition' : null,
          b.ignore ? 'Non cumulé : un effet de la même famille est plus fort' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Info key={`${b.texte}-${i}`} texte={aide || null}>
            <Badge
              ton={b.ignore ? 'neutre' : 'primaire'}
              taille={taille}
              className={cn('max-w-full', b.ignore && 'line-through decoration-subtle')}
              tabIndex={aide ? 0 : undefined}
            >
              <span className="truncate">{b.texte}</span>
              {b.conditionnel && <span aria-hidden>*</span>}
            </Badge>
          </Info>
        );
      })}
      {reste > 0 && (
        <Info
          texte={bonus
            .slice(montres.length)
            .map((b) => b.texte)
            .join(' · ')}
        >
          <Badge taille={taille} tabIndex={0}>
            +{reste}
          </Badge>
        </Info>
      )}
    </div>
  );
}

/** Quantité modifiable : −, valeur, +. Sans `onChange`, la valeur seule. */
export function QuantityStepper({
  nom,
  quantite,
  onChange,
  compact,
}: {
  nom: string;
  quantite: number;
  onChange?: ((q: number) => void) | undefined;
  compact?: boolean;
}) {
  if (!onChange)
    return (
      <span className="font-mono text-xs tabular-nums text-muted-foreground" aria-label="Quantité">
        ×{quantite}
      </span>
    );
  return (
    <div
      role="group"
      aria-label={`Quantité de ${nom}`}
      className="flex items-center rounded-md border border-border-strong bg-surface-2"
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn('rounded-r-none', compact && 'size-6')}
        onClick={() => onChange(quantite - 1)}
        disabled={quantite <= 1}
        aria-label={`Retirer une unité de ${nom}`}
      >
        <Minus />
      </Button>
      <span
        className={cn(
          'min-w-7 px-1 text-center font-mono text-xs font-semibold tabular-nums',
          compact && 'min-w-5',
        )}
        aria-live="polite"
      >
        {quantite}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn('rounded-l-none', compact && 'size-6')}
        onClick={() => onChange(quantite + 1)}
        aria-label={`Ajouter une unité de ${nom}`}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** Équipé / rangé (sorte `activable`). `icone` : bouton carré, pour les listes étroites. */
export function ActiveToggle({
  nom,
  actif,
  onChange,
  icone,
}: {
  nom: string;
  actif: boolean;
  onChange?: ((actif: boolean) => void) | undefined;
  icone?: boolean;
}) {
  const libelle = actif ? 'Équipé' : 'Rangé';
  const aide = onChange ? (actif ? `Ranger ${nom}` : `Équiper ${nom}`) : libelle;
  return (
    <Info texte={icone ? aide : null}>
      <button
        type="button"
        aria-pressed={actif}
        aria-label={icone ? aide : undefined}
        disabled={!onChange}
        onClick={() => onChange?.(!actif)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border text-[11px] font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default',
          icone ? 'size-6 justify-center' : 'h-6 px-2',
          actif
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-border-strong text-subtle enabled:hover:text-foreground',
        )}
      >
        {actif ? (
          <Check className="size-3" />
        ) : (
          <span className="size-2 rounded-full border border-current" />
        )}
        {!icone && libelle}
      </button>
    </Info>
  );
}

export interface ItemActions {
  ouvrir(item: InventoryItem): void;
  quantite?: (item: InventoryItem, q: number) => void;
  actif?: (item: InventoryItem, actif: boolean) => void;
  exemplaire?: (item: InventoryItem) => void;
  retirer?: (item: InventoryItem) => void;
}

/** Menu « … » d'un objet : détail, équiper, nouvel exemplaire, retrait. */
export function ItemMenu({ item, actions }: { item: InventoryItem; actions: ItemActions }) {
  const { entree, sorte, possession } = item;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 text-subtle"
          aria-label={`Actions sur ${entree.nom}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => actions.ouvrir(item)}>
          <Eye /> Détails
        </DropdownMenuItem>
        {sorte.activable && actions.actif && (
          <DropdownMenuItem onSelect={() => actions.actif!(item, !item.actif)}>
            <Check /> {item.actif ? 'Ranger' : 'Équiper'}
          </DropdownMenuItem>
        )}
        {sorte.exemplaires && possession && actions.exemplaire && (
          <DropdownMenuItem onSelect={() => actions.exemplaire!(item)}>
            <Copy /> Nouvel exemplaire distinct
          </DropdownMenuItem>
        )}
        {possession && actions.retirer && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => actions.retirer!(item)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 />
              {item.quantite > 1 ? `Retirer les ${item.quantite}` : 'Retirer'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
