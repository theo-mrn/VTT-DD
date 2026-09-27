'use client';

/**
 * Un objet de l'inventaire, en carte (bloc large) ou en ligne compacte (bloc étroit).
 * Le nom ouvre le détail ; quantité et état équipé se règlent sur place.
 */
import { cn } from '@/lib/utils';
import type { InventoryItem } from './model';
import {
  ActiveToggle,
  BonusBadges,
  ItemMenu,
  QuantityStepper,
  Thumbnail,
  type ItemActions,
} from './parts';

interface ItemViewProps {
  item: InventoryItem;
  image?: string | undefined;
  /** Montrer la catégorie (vue « Tout » sans sections). */
  avecCategorie: boolean;
  actions: ItemActions;
  /** Écritures possibles (propriétaire ou MJ, hors personnalisation de la grille). */
  editable: boolean;
}

function sousTitre(item: InventoryItem, avecCategorie: boolean): string | null {
  const morceaux = [
    avecCategorie ? item.categorie.nom : null,
    item.exemplaireLabel ? `Exemplaire ${item.exemplaireLabel}` : null,
    item.possession ? null : 'Accordé',
    item.poids
      ? `${item.poids.champ.nom} ${item.poids.unitaire * item.quantite}${item.quantite > 1 ? ` (${item.poids.unitaire} × ${item.quantite})` : ''}`
      : null,
  ].filter(Boolean);
  return morceaux.length ? morceaux.join(' · ') : null;
}

function reglages(item: InventoryItem, actions: ItemActions, editable: boolean) {
  const q = editable && item.possession && actions.quantite;
  const a = editable && actions.actif;
  return {
    quantite: item.sorte.quantites && q ? (n: number) => actions.quantite!(item, n) : undefined,
    actif: item.sorte.activable && a ? (v: boolean) => actions.actif!(item, v) : undefined,
  };
}

export function ItemCard({ item, image, avecCategorie, actions, editable }: ItemViewProps) {
  const r = reglages(item, actions, editable);
  const detail = sousTitre(item, avecCategorie);
  const range = item.sorte.activable && !item.actif;
  return (
    <article
      className={cn(
        'group flex min-w-0 flex-col gap-2.5 rounded-xl border bg-surface-2/50 p-3 transition-colors',
        item.sorte.activable && item.actif
          ? 'border-success/25 hover:border-success/45'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Thumbnail nom={item.entree.nom} image={image} className={cn(range && 'opacity-60')} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => actions.ouvrir(item)}
            className={cn(
              'block max-w-full truncate rounded text-left text-sm font-medium transition-colors hover:text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              range && 'text-muted-foreground',
            )}
          >
            {item.entree.nom}
          </button>
          {detail && <p className="truncate text-[11px] text-subtle">{detail}</p>}
        </div>
        {editable && <ItemMenu item={item} actions={actions} />}
      </div>
      <BonusBadges bonus={item.bonus} max={3} />
      {(item.sorte.activable || item.sorte.quantites) && (
        <div className="mt-auto flex items-center justify-between gap-2">
          {item.sorte.activable ? (
            <ActiveToggle nom={item.entree.nom} actif={item.actif} onChange={r.actif} />
          ) : (
            <span />
          )}
          {item.sorte.quantites && (
            <QuantityStepper nom={item.entree.nom} quantite={item.quantite} onChange={r.quantite} />
          )}
        </div>
      )}
    </article>
  );
}

export function ItemRow({ item, image, avecCategorie, actions, editable }: ItemViewProps) {
  const r = reglages(item, actions, editable);
  const detail = sousTitre(item, avecCategorie);
  const range = item.sorte.activable && !item.actif;
  return (
    <li className="flex min-w-0 items-center gap-2 py-1.5">
      <Thumbnail
        nom={item.entree.nom}
        image={image}
        className={cn('size-7 rounded-md text-xs', range && 'opacity-60')}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => actions.ouvrir(item)}
          className={cn(
            'block max-w-full truncate rounded text-left text-[13px] font-medium transition-colors hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            range && 'text-muted-foreground',
          )}
        >
          {item.entree.nom}
          {item.bonus.length > 0 && (
            <span className="ml-1.5 text-[11px] font-normal text-primary">
              {item.bonus[0]!.texte}
              {item.bonus.length > 1 ? ` +${item.bonus.length - 1}` : ''}
            </span>
          )}
        </button>
        {detail && <p className="truncate text-[11px] text-subtle">{detail}</p>}
      </div>
      {item.sorte.quantites && (
        <QuantityStepper
          nom={item.entree.nom}
          quantite={item.quantite}
          onChange={r.quantite}
          compact
        />
      )}
      {item.sorte.activable && (
        <ActiveToggle nom={item.entree.nom} actif={item.actif} onChange={r.actif} icone />
      )}
      {editable && <ItemMenu item={item} actions={actions} />}
    </li>
  );
}
