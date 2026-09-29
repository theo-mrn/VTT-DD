/**
 * Types d'entrée de `@vtt/vision`. Ils ne dépendent d'aucun autre paquet : le navigateur et le
 * service campaign y convertissent leurs données (contrats de `@vtt/contracts`) en quelques
 * lignes. Toutes les coordonnées sont en pixels du monde (pixels de l'image de fond), axe y vers
 * le bas comme à l'écran.
 */

/** Point ou vecteur, en pixels du monde (y vers le bas). */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/**
 * Sorte de segment. `one_way_wall` est l'alias du contrat de carte (`MapObstacleKind`), accepté
 * tel quel pour que la conversion soit directe.
 */
export type SegmentKind = 'wall' | 'door' | 'window' | 'one_way' | 'one_way_wall';

/** Côté d'un segment orienté a→b. Gauche : `cross(b − a, p − a) < 0` (y vers le bas). */
export type Side = 'left' | 'right';

/**
 * Segment d'obstacle. Un obstacle en plusieurs points devient plusieurs segments
 * (`segmentsFromPolyline`), qui partagent son `id` : l'`id` n'a pas besoin d'être unique.
 */
export interface Segment {
  readonly id: string;
  readonly a: Vec;
  readonly b: Vec;
  readonly kind: SegmentKind;
  /** Porte ouverte : ne bloque plus la vue et ouvre les pièces dont elle est sur le contour. */
  readonly open?: boolean;
  /**
   * Mur à sens unique : côté d'où la vue est bloquée, relatif au sens de tracé a→b
   * (`left` par défaut, comme `blocksFrom: null` dans le contrat).
   */
  readonly blocksFrom?: Side;
  /** 1 par défaut : opaque. Entre 0 et 1 : ombre partielle, sans masquer. 0 : sans effet. */
  readonly opacity?: number;
}

/** Pièce : polygone fermé (sans répéter le premier point), sans effet de mur par lui-même. */
export interface Room {
  readonly id: string;
  readonly points: readonly Vec[];
}

/** `fog` ajoute du brouillard, `clear` en retire. */
export type FogMode = 'fog' | 'clear';

/**
 * Zone de brouillard, appliquée dans l'ordre du tableau `VisionScene.fogZones`. Mêmes formes que
 * le contrat : cercle (`center`, `radius`), rectangle (4 points, éventuellement tourné) et
 * polygone à main levée.
 */
export type FogZone =
  | {
      readonly id: string;
      readonly mode: FogMode;
      readonly shape: 'circle';
      readonly center: Vec;
      readonly radius: number;
    }
  | {
      readonly id: string;
      readonly mode: FogMode;
      readonly shape: 'rect' | 'polygon';
      readonly points: readonly Vec[];
    };

/** Lumière. `radius` en pixels du monde (le contrat le donne en unités × `pixelsPerUnit`). */
export interface Light {
  readonly id: string;
  readonly pos: Vec;
  readonly radius: number;
  /** Part du rayon en dégradé (0 à 1), pour le rendu ; sans effet sur la géométrie. */
  readonly falloff?: number;
  /** Allumée (`visible` dans le contrat). Éteinte : sans effet. */
  readonly on: boolean;
}

/** Observateur : un token d'un joueur (ses personnages et les `ally`). */
export interface Viewer {
  readonly id: string;
  readonly pos: Vec;
  /** Rayon de vision en pixels du monde (déjà multiplié par 3 si `visionBoost`). */
  readonly visionRadius: number;
}

/** Tout ce dont la visibilité d'une carte dépend, hors observateurs. */
export interface VisionScene {
  /** Taille de la carte : la vue est bornée au rectangle [0, width] × [0, height]. */
  readonly bounds: { readonly width: number; readonly height: number };
  readonly segments: readonly Segment[];
  readonly rooms?: readonly Room[];
  /** Toute la carte dans le brouillard au départ (`maps.fogFull`). */
  readonly fogFull?: boolean;
  readonly fogZones?: readonly FogZone[];
  readonly lights?: readonly Light[];
}

/** Réglages de `prepareScene`. */
export interface PrepareOptions {
  /**
   * Tolérance de soudure, en pixels (0,5 par défaut) : deux extrémités plus proches sont
   * fusionnées et une extrémité aussi proche d'un mur est soudée dessus (jonction en T). Une
   * fente plus étroite ne laisse donc jamais passer la vue.
   */
  readonly snap?: number;
  /** Distance maximale d'une porte au contour d'une pièce pour en faire partie (3 px). */
  readonly doorTolerance?: number;
}

/** Polygone à plat : `[x0, y0, x1, y1, …]`, sans répéter le premier point. */
export type Polygon = Float64Array;
