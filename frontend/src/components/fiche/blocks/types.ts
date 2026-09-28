/**
 * Contrat d'un bloc de fiche personnalisable. Chaque bloc est générique : il ne connaît
 * aucun système de jeu. Tout ce qu'il affiche vient du système chargé (`ctx.systeme` :
 * sortes, champs, attributs, arbres, achats) et de sa déclaration dans la présentation
 * (`widget`). Jamais de clé de jeu en dur (« FOR », « talents »…), jamais de test sur l'id
 * du système : une particularité de système passe par sa présentation.
 *
 * Toute écriture passe par `ctx.operations` (service character, version, conflits) ;
 * absent = lecture seule (droits renvoyés par le service).
 */
import type { Widget } from '@vtt/rules';
import type { ComponentType } from 'react';
import type { ContexteFiche } from '../widgets';
import type { Tile, TileArrangement } from './tiles/model';

export type WidgetType = Widget['type'];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;

export interface SheetBlockProps<T extends WidgetType = WidgetType> {
  ctx: ContexteFiche;
  widget: WidgetOf<T>;
  /** `edit` : la grille est en cours de personnalisation (le bloc reste lisible, sans action). */
  mode: 'read' | 'edit';
  /**
   * Hauteur de la case : `auto` suit le contenu (pas de hauteur imposée), `fixed` impose la
   * hauteur réglée (le contenu défile). Absent : `auto`.
   */
  height?: 'auto' | 'fixed';
  /**
   * Disposition interne d'un bloc de tuiles (colonnes, ordre, valeurs masquées), réglée en
   * personnalisation. Absente : celle de la présentation. Seuls les blocs qui déclarent
   * `tiles` la reçoivent.
   */
  arrangement?: TileArrangement;
}

/**
 * Tailles : `w` en colonnes (12 sur grand écran), `h` en rangées de 48 px (converties au pas
 * fin de la grille par sheet-grid/model.ts).
 */
export interface BlockSize {
  w: number;
  h: number;
}

export interface SheetBlockDefinition<T extends WidgetType = WidgetType> {
  type: T;
  /** Nom affiché dans le sélecteur de blocs. */
  label: string;
  description: string;
  defaultSize: BlockSize;
  minSize: BlockSize;
  /**
   * Hauteur par défaut dans la grille : `auto` (défaut) suit le contenu, `fixed` garde la
   * hauteur réglée au coin et fait défiler le contenu (blocs volumineux : arbre…).
   */
  defaultHeight?: 'auto' | 'fixed';
  /**
   * Bloc de tuiles : les valeurs qu'il peut afficher (celles que la présentation lui donne,
   * visibles de l'utilisateur), dans l'ordre du système. Présent : la personnalisation
   * propose la disposition interne (colonnes, ordre, masquage).
   */
  tiles?: (ctx: ContexteFiche, widget: WidgetOf<T>) => Tile[];
  /**
   * Valeurs que la personnalisation peut ajouter au bloc (absentes de `tiles`), et le widget
   * qui affiche exactement ces clés. Absents : la liste des valeurs est celle du système.
   */
  addableTiles?: (ctx: ContexteFiche, widget: WidgetOf<T>) => Tile[];
  withTiles?: (widget: WidgetOf<T>, keys: string[]) => WidgetOf<T>;
  Component: ComponentType<SheetBlockProps<T>>;
}
