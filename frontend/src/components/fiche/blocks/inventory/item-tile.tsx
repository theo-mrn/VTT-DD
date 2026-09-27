'use client';

/**
 * Emplacements de la grille d'inventaire, comme un inventaire de jeu : une tuile carrée par
 * objet (icône de sa catégorie dans un cercle, pastille de quantité, anneau d'accent s'il
 * est équipé, œil barré s'il est caché), une tuile par dossier (on y entre d'un clic, on y
 * dépose un objet), et la tuile « + » pour ajouter. Pas de nom sous la tuile : il est dans
 * l'infobulle et dans le libellé accessible, avec la quantité et l'info clé.
 */
import { Check, EyeOff, Folder, FolderOpen, Plus, type LucideIcon } from 'lucide-react';
import {
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { InventoryItem } from './model';

/** Type du glisser-déposer d'un objet de l'inventaire (sa clé `entree#exemplaire`). */
export const GLISSER_OBJET = 'application/x-vtt-inventaire';

const TUILE = cn(
  'group relative flex aspect-square w-full items-center justify-center rounded-xl border bg-surface-2',
  'transition-[border-color,background-color,box-shadow,transform] duration-150 motion-reduce:transition-none',
  'hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
);

const CERCLE =
  'flex size-[52%] max-h-16 max-w-16 items-center justify-center rounded-full border-2 bg-card transition-colors duration-150 motion-reduce:transition-none';

/** Pastille de quantité, en haut à droite. */
function Pastille({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-card bg-primary px-1.5 font-mono text-[11px] font-bold tabular-nums text-primary-foreground shadow-surface"
    >
      {children}
    </span>
  );
}

/** Libellé accessible d'un objet : nom, quantité, info clé, états. */
export function libelleObjet(item: InventoryItem, meta: string | null): string {
  return [
    item.nom + (item.exemplaireLabel ? ` ${item.exemplaireLabel}` : ''),
    item.sorte.quantites || item.quantite > 1
      ? `${item.quantite} unité${item.quantite > 1 ? 's' : ''}`
      : null,
    meta,
    ...item.bonus.filter((b) => !b.ignore).map((b) => b.texte),
    item.sorte.activable ? (item.actif ? 'équipé' : 'rangé') : null,
    item.hidden ? 'caché aux autres joueurs' : null,
    item.folder ? `dans ${item.folder.name}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export function ItemTile({
  item,
  icone: Icone,
  image,
  meta,
  focusable,
  deplacable,
  onFocusTile,
  onOpen,
  onMenu,
}: {
  item: InventoryItem;
  icone: LucideIcon;
  image?: string | undefined;
  meta: string | null;
  focusable: boolean;
  /** Glissable vers un dossier. */
  deplacable: boolean;
  onFocusTile(): void;
  onOpen(): void;
  onMenu(x: number, y: number): void;
}) {
  const equipe = item.sorte.activable && item.actif;
  const range = item.sorte.activable && !item.actif;
  const bonus = item.bonus.filter((b) => !b.ignore);
  const details = [
    item.sorte.quantites || item.quantite > 1 ? `×${item.quantite}` : null,
    meta,
    item.sorte.activable ? (item.actif ? 'Équipé' : 'Rangé') : null,
    item.hidden ? 'Caché aux autres joueurs' : null,
  ].filter(Boolean);

  function menu(e: MouseEvent) {
    e.preventDefault();
    onMenu(e.clientX, e.clientY);
  }
  function clavier(e: KeyboardEvent) {
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onMenu(r.left + r.width / 2, r.bottom);
    }
  }
  function glisser(e: DragEvent) {
    e.dataTransfer.setData(GLISSER_OBJET, item.cle);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <Info
      texte={
        <span className="block max-w-56 space-y-0.5 text-left">
          <span className="block font-medium">
            {item.nom}
            {item.exemplaireLabel && (
              <span className="ml-1 font-normal opacity-70">{item.exemplaireLabel}</span>
            )}
          </span>
          {details.length > 0 && (
            <span className="block text-xs opacity-80">{details.join(' · ')}</span>
          )}
          {bonus.length > 0 && (
            <span className="block text-xs text-primary">
              {bonus.map((b) => b.texte).join(' · ')}
            </span>
          )}
        </span>
      }
    >
      <button
        type="button"
        data-tile={item.cle}
        tabIndex={focusable ? 0 : -1}
        aria-label={libelleObjet(item, meta)}
        aria-haspopup="dialog"
        draggable={deplacable}
        onDragStart={deplacable ? glisser : undefined}
        onFocus={onFocusTile}
        onClick={onOpen}
        onContextMenu={menu}
        onKeyDown={clavier}
        className={cn(
          TUILE,
          equipe
            ? 'border-primary/70 ring-1 ring-primary/40'
            : 'border-border hover:border-primary/40',
          deplacable && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <span
          aria-hidden
          className={cn(
            CERCLE,
            equipe
              ? 'border-primary text-primary'
              : 'border-primary/35 text-primary group-hover:border-primary/60',
            range && 'opacity-60',
          )}
        >
          {image ? (
            <img src={image} alt="" className="size-full rounded-full object-cover" />
          ) : (
            <Icone className="size-[45%]" />
          )}
        </span>
        {(item.sorte.quantites || item.quantite > 1) && <Pastille>{item.quantite}</Pastille>}
        {equipe && (
          <span
            aria-hidden
            className="absolute bottom-1.5 left-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
        {item.hidden && (
          <EyeOff aria-hidden className="absolute bottom-1.5 right-1.5 size-3.5 text-subtle" />
        )}
      </button>
    </Info>
  );
}

export function FolderTile({
  id,
  nom,
  nombre,
  focusable,
  deposable,
  onFocusTile,
  onOpen,
  onMenu,
  onDeposer,
}: {
  id: string;
  nom: string;
  nombre: number;
  focusable: boolean;
  /** Accepte qu'on y dépose un objet. */
  deposable: boolean;
  onFocusTile(): void;
  onOpen(): void;
  onMenu?: ((x: number, y: number) => void) | undefined;
  onDeposer(cle: string): void;
}) {
  const [survol, setSurvol] = useState(false);
  const accepte = (e: DragEvent) => deposable && e.dataTransfer.types.includes(GLISSER_OBJET);
  return (
    <Info texte={`${nom} · ${nombre} objet${nombre > 1 ? 's' : ''}`}>
      <button
        type="button"
        data-tile={`dossier:${id}`}
        tabIndex={focusable ? 0 : -1}
        aria-label={`Dossier ${nom}, ${nombre} objet${nombre > 1 ? 's' : ''}`}
        onFocus={onFocusTile}
        onClick={onOpen}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (onMenu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.left + r.width / 2, r.bottom);
          }
        }}
        onDragOver={(e) => {
          if (!accepte(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          setSurvol(false);
          if (!accepte(e)) return;
          e.preventDefault();
          const cle = e.dataTransfer.getData(GLISSER_OBJET);
          if (cle) onDeposer(cle);
        }}
        className={cn(
          TUILE,
          survol
            ? 'border-primary bg-surface-3'
            : 'border-border border-dashed hover:border-primary/40',
        )}
      >
        <span aria-hidden className={cn(CERCLE, 'border-primary/35 text-primary')}>
          {survol ? <FolderOpen className="size-[45%]" /> : <Folder className="size-[45%]" />}
        </span>
        <Pastille>{nombre}</Pastille>
      </button>
    </Info>
  );
}

/** Première tuile : « + » en pointillés pour ajouter un objet. */
export function AddTile({
  onClick,
  focusable,
  onFocusTile,
}: {
  onClick(): void;
  focusable: boolean;
  onFocusTile(): void;
}) {
  return (
    <Info texte="Ajouter un objet">
      <button
        type="button"
        data-tile="ajouter"
        tabIndex={focusable ? 0 : -1}
        aria-label="Ajouter un objet"
        onFocus={onFocusTile}
        onClick={onClick}
        className={cn(TUILE, 'border-transparent bg-transparent hover:bg-surface-2')}
      >
        <span
          aria-hidden
          className={cn(
            CERCLE,
            'border-dashed border-primary/50 bg-transparent text-primary group-hover:border-primary',
          )}
        >
          <Plus className="size-[45%]" />
        </span>
      </button>
    </Info>
  );
}
