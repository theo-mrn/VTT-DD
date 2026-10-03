/**
 * Outils de la carte (docs/carte.md § 6) : un seul actif à la fois, sélection par défaut (V).
 * Un outil est une **machine à états explicite** (`idle → armed → dragging → …`) qui reçoit
 * des événements en coordonnées du monde et d'écran, testable sans DOM ni WebGL. Il dessine son
 * aperçu dans le calque `tool`. Échap le ramène toujours à un état sûr, sans écriture partielle.
 *
 * Le contrôleur d'interaction lui passe les événements du pointeur après les gestes de caméra
 * (molette, clic du milieu, Espace + glisser, pincement) et le menu contextuel (clic droit,
 * appui long), qui sont communs à tous les outils.
 */
import type { ComponentType } from 'react';
import type { Container } from 'pixi.js';
import type { Point } from '../geometry';
import type { MapEntity } from '../entities/entity';
import type { MapViewer, RenderContext } from '../entities/entity-kind';
import type { MapEngine } from '../map-engine';

/** Événement de pointeur normalisé (souris, stylet, doigt). */
export interface MapPointer {
  id: number;
  type: 'mouse' | 'pen' | 'touch';
  /** Bouton de l'événement (0 gauche, 1 milieu, 2 droit ; -1 pour un déplacement). */
  button: number;
  /** Boutons enfoncés (masque de bits du DOM). */
  buttons: number;
  /** Pixels CSS dans le canevas. */
  screen: Point;
  /** Pixels du monde. */
  world: Point;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  /** Horodatage (ms). */
  time: number;
}

/** Touche normalisée. */
export interface MapKey {
  key: string;
  /**
   * Code de raccourci (`shortcutCode`) : `KeyX` pour la lettre tapée (la disposition du clavier
   * compte : AZERTY ou QWERTY, la touche A donne `KeyA`), sinon `KeyboardEvent.code` (chiffres
   * de la rangée du haut, pavé numérique, flèches, Espace).
   */
  code: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  repeat: boolean;
}

export interface Tool {
  readonly id: string;
  /** État courant de la machine (`idle`, `dragging`…), pour les tests et le diagnostic. */
  readonly state: string;
  /** Curseur CSS de l'outil au repos (défaut : `default`). */
  cursor?(engine: MapEngine): string | null;
  activate?(engine: MapEngine): void;
  /** Quitte l'outil : revenir à un état sûr, sans écriture partielle. */
  deactivate?(engine: MapEngine): void;
  /** Bouton pressé ; renvoie vrai si l'outil prend le geste. */
  down?(e: MapPointer, engine: MapEngine): boolean;
  /** Déplacement (survol quand `buttons === 0`). */
  move?(e: MapPointer, engine: MapEngine): void;
  up?(e: MapPointer, engine: MapEngine): void;
  /** Double clic ; renvoie vrai s'il est pris (sinon : inspecteur de l'entité touchée). */
  doubleClick?(e: MapPointer, engine: MapEngine): boolean;
  /** Touche ; renvoie vrai si elle est prise (avant les raccourcis communs). */
  key?(e: MapKey, engine: MapEngine): boolean;
  /** Échap : renvoie vrai s'il y avait un geste à annuler. */
  cancel?(engine: MapEngine): boolean;
  /** Aperçu dans le calque `tool` ; appelé à chaque image quand `engine.invalidate()` a été demandé. */
  renderPreview?(layer: Container, ctx: RenderContext): void;
  /**
   * Entités que l'outil actif laisse toucher (clic, lasso, menu) ; absent : toutes, sauf les
   * sortes réservées à leur outil (`EntityKind.editTool`). L'outil obstacles (W) ne touche que
   * murs et pièces : un token posé contre un mur ne lui vole pas le clic.
   */
  targets?(entity: MapEntity): boolean;
}

/** Un outil et son entrée de barre d'outils. */
export interface ToolDefinition {
  id: string;
  /** Libellé (« Dessin »), aussi en info-bulle. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Raccourci (`KeyboardEvent.code` et touche affichée). */
  shortcut?: { code: string; label: string };
  /** Place dans la barre (croissant). */
  order?: number;
  /** Qui voit l'outil (défaut : le MJ). */
  available?(viewer: MapViewer): boolean;
  /** Fabrique de l'outil (une instance par moteur). */
  create(engine: MapEngine): Tool;
  /** Hors de la barre d'outils : l'outil est lancé ailleurs (panneau Scènes…). */
  hidden?: boolean;
  /** Réglages de l'outil actif, sous la barre (couleurs, épaisseur…). */
  options?: ComponentType<{ engine: MapEngine }>;
}
