'use client';

/**
 * Emplacements de la grille d'inventaire, comme un inventaire de jeu : une tuile carrée par
 * objet (icône de sa catégorie dans un cercle, pastille de quantité, anneau d'accent s'il
 * est équipé, œil barré s'il est caché), une tuile par dossier (on y entre d'un clic, on y
 * dépose un objet), et la tuile « + » pour ajouter. Pas de nom sous la tuile : il est dans
 * l'infobulle et dans le libellé accessible, avec la quantité et l'info clé.
 */
import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import { EyeOff, Folder, FolderOpen, Plus, type LucideIcon } from 'lucide-react';
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

/** Emplacement : carré fixe et sobre ; l'accent est réservé à l'état équipé. */
const TUILE = cn(
  'group relative isolate flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-surface-2',
  'transition-colors duration-150 motion-reduce:transition-none',
  'hover:border-primary/40 hover:bg-surface-2',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
);

/** Quantité, en bas à droite dans la tuile (seulement au-delà de 1). */
function Quantite({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span
      aria-hidden
      className="absolute bottom-1 right-1.5 font-mono text-[11px] font-medium leading-none tabular-nums text-foreground/80"
    >
      {children}
    </span>
  );
}

function unites(n: number): string {
  return translate('sheet.inventory.units', { count: n });
}

/** « Équipé » ou « Rangé » pour un objet activable. */
function etatRangement(item: InventoryItem): string | null {
  if (!item.sorte.activable) return null;
  return translate(item.actif ? 'sheet.inventory.equipped' : 'sheet.inventory.stowed');
}

/** Libellé accessible d'un objet : nom, quantité, info clé, états. */
export function libelleObjet(item: InventoryItem, meta: string | null): string {
  return [
    item.nom + (item.exemplaireLabel ? ` ${item.exemplaireLabel}` : ''),
    item.sorte.quantites || item.quantite > 1 ? unites(item.quantite) : null,
    meta,
    ...item.bonus.filter((b) => !b.ignore).map((b) => b.texte),
    etatRangement(item)?.toLowerCase(),
    item.hidden ? translate('sheet.inventory.hiddenOthers').toLowerCase() : null,
    item.folder ? translate('sheet.inventory.inFolder', { name: item.folder.name }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Infobulle d'une tuile : nom et exemplaire, quantité et état, bonus appliqués. */
function InfoObjet({ item, meta }: Readonly<{ item: InventoryItem; meta: string | null }>) {
  const bonus = item.bonus.filter((b) => !b.ignore);
  const details = [
    item.sorte.quantites || item.quantite > 1 ? `×${item.quantite}` : null,
    meta,
    etatRangement(item),
    item.hidden ? translate('sheet.inventory.hiddenOthers') : null,
  ].filter(Boolean);
  return (
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
        <span className="block text-xs text-primary">{bonus.map((b) => b.texte).join(' · ')}</span>
      )}
    </span>
  );
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
}: Readonly<{
  item: InventoryItem;
  icone: LucideIcon;
  image?: string;
  meta: string | null;
  focusable: boolean;
  /** Glissable vers un dossier. */
  deplacable: boolean;
  onFocusTile(): void;
  onOpen(): void;
  onMenu(x: number, y: number): void;
}>) {
  const equipe = item.sorte.activable && item.actif;
  const range = item.sorte.activable && !item.actif;

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
    <Info texte={<InfoObjet item={item} meta={meta} />}>
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
          equipe ? 'border-primary/50' : 'border-border',
          deplacable && 'cursor-grab active:cursor-grabbing',
        )}
      >
        {image ? (
          <img
            src={image}
            alt=""
            aria-hidden
            className={cn('size-10 rounded-md object-cover', range && 'opacity-60')}
          />
        ) : (
          <Icone
            aria-hidden
            strokeWidth={1.75}
            className={cn(
              'size-7 transition-colors duration-150 motion-reduce:transition-none',
              equipe ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
            )}
          />
        )}
        {item.quantite > 1 && <Quantite>{item.quantite}</Quantite>}
        {equipe && (
          <span
            aria-hidden
            className="absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary"
          />
        )}
        {item.hidden && (
          <EyeOff aria-hidden className="absolute left-1.5 top-1.5 size-3 text-subtle" />
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
}: Readonly<{
  id: string;
  nom: string;
  nombre: number;
  focusable: boolean;
  /** Accepte qu'on y dépose un objet. */
  deposable: boolean;
  onFocusTile(): void;
  onOpen(): void;
  onMenu?: (x: number, y: number) => void;
  onDeposer(cle: string): void;
}>) {
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
          'flex-col gap-1 px-1.5',
          survol ? 'border-primary bg-surface-2' : 'border-border',
        )}
      >
        {survol ? (
          <FolderOpen aria-hidden strokeWidth={1.75} className="size-6 text-primary" />
        ) : (
          <Folder aria-hidden strokeWidth={1.75} className="size-6 text-primary/80" />
        )}
        <span
          aria-hidden
          className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground"
        >
          {nom}
        </span>
        <span
          aria-hidden
          className="absolute right-1.5 top-1 font-mono text-[10px] tabular-nums text-subtle"
        >
          {nombre}
        </span>
      </button>
    </Info>
  );
}

/** Première tuile : « + » en pointillés pour ajouter un objet. */
export function AddTile({
  onClick,
  focusable,
  onFocusTile,
}: Readonly<{
  onClick(): void;
  focusable: boolean;
  onFocusTile(): void;
}>) {
  const t = useTranslations();
  return (
    <Info texte={t('sheet.inventory.addItem')}>
      <button
        type="button"
        data-tile="ajouter"
        tabIndex={focusable ? 0 : -1}
        aria-label={t('sheet.inventory.addItem')}
        onFocus={onFocusTile}
        onClick={onClick}
        className={cn(
          TUILE,
          'border-dashed border-border-strong bg-transparent hover:border-primary/60 hover:bg-transparent',
        )}
      >
        <Plus
          aria-hidden
          strokeWidth={1.75}
          className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </button>
    </Info>
  );
}
