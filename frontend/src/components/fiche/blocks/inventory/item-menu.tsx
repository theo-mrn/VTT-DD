'use client';

/**
 * Actions d'un objet, communes au menu « … » de sa ligne et au menu contextuel (clic
 * droit, Maj+F10) : détail, équiper, consommer, renommer, quantité, donner, cacher,
 * déplacer vers un dossier, nouvel exemplaire, supprimer. Chaque action n'apparaît que
 * si la sorte la permet (équipable, quantités, exemplaires, nom propre) et si l'utilisateur
 * peut écrire.
 */
import { useTranslations } from 'next-intl';
import type { InventoryFolder } from '@vtt/rules';
import {
  BadgePlus,
  Check,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Folder,
  FolderInput,
  FolderPlus,
  Gift,
  Hash,
  Minus,
  PanelRightOpen,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { renommable, type InventoryItem } from './model';

/** Ce que l'utilisateur peut faire d'un objet ; absent : action indisponible. */
export interface ItemHandlers {
  ouvrir(item: InventoryItem): void;
  /** Détail ouvert sur une section : dés et formules, ou bonus. */
  detailSur?(item: InventoryItem, section: SectionDetail): void;
  equiper?(item: InventoryItem, actif: boolean): void;
  consommer?(item: InventoryItem): void;
  renommer?(item: InventoryItem): void;
  quantite?(item: InventoryItem): void;
  donner?(item: InventoryItem): void;
  cacher?(item: InventoryItem, hidden: boolean): void;
  ranger?(item: InventoryItem, folder: string | null): void;
  nouveauDossierPour?(item: InventoryItem): void;
  exemplaire?(item: InventoryItem): void;
  supprimer?(item: InventoryItem): void;
}

export type SectionDetail = 'formules' | 'bonus';

/** La poignée si la condition tient, sinon rien. */
const si = <T,>(condition: unknown, poignee: T | undefined): T | undefined =>
  condition ? poignee : undefined;

/** Actions réellement proposées pour cet objet. */
export function actionsDe(item: InventoryItem, h: ItemHandlers) {
  const possede = Boolean(item.possession);
  const { activable, quantites, exemplaires } = item.sorte;
  // Détail ouvert sur une section : objet possédé, sur une fiche modifiable
  const detail = si(possede && h.supprimer !== undefined, h.detailSur);
  return {
    equiper: si(activable, h.equiper),
    consommer: si(quantites && possede, h.consommer),
    renommer: si(renommable(item), h.renommer),
    quantite: si(quantites && possede, h.quantite),
    donner: si(possede, h.donner),
    cacher: si(possede, h.cacher),
    ranger: si(possede, h.ranger),
    exemplaire: si(exemplaires && possede, h.exemplaire),
    supprimer: si(possede, h.supprimer),
    formules: si(
      item.sorte.champs.some((c) => c.type === 'formule'),
      detail,
    ),
    bonus: detail,
  };
}

/** Sous-menu « Déplacer vers » : hors dossier, chaque dossier, ou un nouveau. */
function SousMenuRanger({
  item,
  folders,
  ranger,
  nouveauDossierPour,
}: Readonly<{
  item: InventoryItem;
  folders: InventoryFolder[];
  ranger(item: InventoryItem, folder: string | null): void;
  nouveauDossierPour: ItemHandlers['nouveauDossierPour'];
}>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput /> Déplacer vers
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        <DropdownMenuItem disabled={!item.folder} onSelect={() => ranger(item, null)}>
          <Folder className="opacity-40" /> Sans dossier
        </DropdownMenuItem>
        {folders.map((f) => (
          <DropdownMenuItem
            key={f.id}
            disabled={item.folder?.id === f.id}
            onSelect={() => ranger(item, f.id)}
          >
            <Folder /> <span className="truncate">{f.name}</span>
          </DropdownMenuItem>
        ))}
        {nouveauDossierPour && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => nouveauDossierPour(item)}>
              <FolderPlus /> Nouveau dossier…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Entrées « organiser » : renommer, quantité, visibilité, dossier, nouvel exemplaire. */
function EntreesOrganiser({
  item,
  a,
  folders,
  nouveauDossierPour,
}: Readonly<{
  item: InventoryItem;
  a: ReturnType<typeof actionsDe>;
  folders: InventoryFolder[];
  nouveauDossierPour: ItemHandlers['nouveauDossierPour'];
}>) {
  const t = useTranslations();
  return (
    <>
      {a.renommer && (
        <DropdownMenuItem onSelect={() => a.renommer!(item)}>
          <Pencil /> Renommer…
        </DropdownMenuItem>
      )}
      {a.quantite && (
        <DropdownMenuItem onSelect={() => a.quantite!(item)}>
          <Hash /> Modifier la quantité…
        </DropdownMenuItem>
      )}
      {a.cacher && (
        <DropdownMenuItem onSelect={() => a.cacher!(item, !item.hidden)}>
          {item.hidden ? <Eye /> : <EyeOff />}
          {item.hidden ? t('sheet.inventory.showOthers') : t('sheet.inventory.hideOthers')}
        </DropdownMenuItem>
      )}
      {a.ranger && (
        <SousMenuRanger
          item={item}
          folders={folders}
          ranger={a.ranger}
          nouveauDossierPour={nouveauDossierPour}
        />
      )}
      {a.exemplaire && (
        <DropdownMenuItem onSelect={() => a.exemplaire!(item)}>
          <Copy /> Nouvel exemplaire distinct
        </DropdownMenuItem>
      )}
    </>
  );
}

/** Entrées du menu d'un objet (contenu d'un DropdownMenuContent). */
export function ItemMenuItems({
  item,
  handlers,
  folders,
}: Readonly<{
  item: InventoryItem;
  handlers: ItemHandlers;
  folders: InventoryFolder[];
}>) {
  const t = useTranslations();
  const a = actionsDe(item, handlers);
  const organiser = a.renommer || a.quantite || a.cacher || a.ranger || a.exemplaire;
  const regler = a.formules || a.bonus;
  return (
    <>
      <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
        {item.nom}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => handlers.ouvrir(item)}>
        <PanelRightOpen /> {t('sheet.inventory.details')}
        <span className="ml-auto text-[10px] text-subtle">{t('chat.enterKey')}</span>
      </DropdownMenuItem>
      {a.equiper && (
        <DropdownMenuItem onSelect={() => a.equiper!(item, !item.actif)}>
          <Check /> {item.actif ? t('sheet.inventory.stow') : t('sheet.inventory.equip')}
        </DropdownMenuItem>
      )}
      {a.consommer && (
        <DropdownMenuItem onSelect={() => a.consommer!(item)}>
          <Minus /> Consommer une unité
        </DropdownMenuItem>
      )}
      {a.donner && (
        <DropdownMenuItem onSelect={() => a.donner!(item)}>
          <Gift /> Donner…
        </DropdownMenuItem>
      )}
      {regler && <DropdownMenuSeparator />}
      {a.formules && (
        <DropdownMenuItem onSelect={() => a.formules!(item, 'formules')}>
          <Dices /> Dés et formule…
        </DropdownMenuItem>
      )}
      {a.bonus && (
        <DropdownMenuItem onSelect={() => a.bonus!(item, 'bonus')}>
          <BadgePlus /> Bonus…
        </DropdownMenuItem>
      )}
      {organiser && <DropdownMenuSeparator />}
      <EntreesOrganiser
        item={item}
        a={a}
        folders={folders}
        nouveauDossierPour={handlers.nouveauDossierPour}
      />
      {a.supprimer && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => a.supprimer!(item)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 /> Supprimer…
            <span className="ml-auto text-[10px] opacity-70">{t('sheet.inventory.delKey')}</span>
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

/**
 * Menu ouvert à une position (clic droit, ou sous l'élément au clavier) : un déclencheur
 * invisible placé à cet endroit.
 */
export function AnchoredMenu({
  position,
  onClose,
  className,
  children,
}: Readonly<{
  position: { x: number; y: number } | null;
  onClose(): void;
  className?: string;
  children: ReactNode;
}>) {
  // Le menu se ferme si la fenêtre change de taille : il resterait accroché au vide
  useEffect(() => {
    if (!position) return;
    const fermer = () => onClose();
    window.addEventListener('resize', fermer);
    return () => window.removeEventListener('resize', fermer);
  }, [position, onClose]);
  return (
    <DropdownMenu
      // Une nouvelle position rouvre le menu à l'endroit du clic
      key={position ? `${position.x}:${position.y}` : 'ferme'}
      open={position !== null}
      onOpenChange={(o) => !o && onClose()}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      {position && (
        <DropdownMenuContent align="start" sideOffset={2} className={className ?? 'w-60'}>
          {children}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

/** Menu contextuel d'un objet (clic droit, Maj+F10) : toutes ses actions. */
export function ContextMenu({
  cible,
  onClose,
  handlers,
  folders,
}: Readonly<{
  cible: { item: InventoryItem; x: number; y: number } | null;
  onClose(): void;
  handlers: ItemHandlers;
  folders: InventoryFolder[];
}>) {
  return (
    <AnchoredMenu position={cible} onClose={onClose}>
      {cible && <ItemMenuItems item={cible.item} handlers={handlers} folders={folders} />}
    </AnchoredMenu>
  );
}
