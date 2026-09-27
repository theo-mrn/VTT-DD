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

export type WidgetType = Widget['type'];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;

export interface SheetBlockProps<T extends WidgetType = WidgetType> {
  ctx: ContexteFiche;
  widget: WidgetOf<T>;
  /** `edit` : la grille est en cours de personnalisation (le bloc reste lisible, sans action). */
  mode: 'read' | 'edit';
}

/** Tailles en unités de la grille (12 colonnes sur grand écran). */
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
  Component: ComponentType<SheetBlockProps<T>>;
}
