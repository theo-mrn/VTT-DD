/**
 * `MapEntity` (docs/carte.md § 6) : tout ce qui se clique sur la carte. Une entité enveloppe
 * une donnée du magasin (`data`, un élément d'une couche) et porte ce dont le moteur a besoin
 * pour la toucher, la sélectionner, la déplacer et la dessiner, quelle que soit sa sorte.
 *
 * - Géométrie : `geometry` vient de la donnée (via la sorte) ; `preview` la remplace pendant un
 *   geste local (glisser, poignées) ou le direct d'un autre (état `remote`). Le rendu et le
 *   toucher suivent la géométrie affichée (`current`).
 * - Affichage : `display` est un `Container` Pixi créé par le moteur (null sans rendu : tests,
 *   avant le montage). La sorte dessine dans des coordonnées locales centrées sur la géométrie ;
 *   le moteur place, tourne et montre le conteneur.
 * - Rangement : `plane` est le plan de rendu (§ 5) ; une entité du plan `content` appartient à
 *   un calque du MJ (`layerId`) et y a un ordre `z`. L'ordre d'affichage et de toucher est celui
 *   des calques, puis `z`.
 * - Masques : `masks` liste ce qui cache l'entité (affichage désactivé, vision…) ; elle n'est
 *   affichée que si la liste est vide et qu'elle touche la vue (culling).
 */
import type { Container } from 'pixi.js';
import {
  geometryBounds,
  geometryContains,
  type EntityGeometry,
  type Point,
  type Rect,
} from '../geometry';
import type { PlaneId } from '../planes';
import type { MapDto } from '../../store/map-store';
import type { EntityKind } from './entity-kind';

/** État d'affichage commun à toutes les entités. */
export interface EntityState {
  /** Sous le pointeur. */
  hovered: boolean;
  /** Dans la sélection. */
  selected: boolean;
  /** Déplacée par moi, geste en cours. */
  dragging: boolean;
  /** Verrouillée : se sélectionne et s'inspecte, mais ne bouge pas. */
  locked: boolean;
  /** Masquée aux joueurs : le MJ la voit hachurée, à 50 %, badge « œil barré ». */
  hiddenForPlayers: boolean;
  /** Un autre la déplace (direct) : elle suit sa position. */
  remote: boolean;
  /** Écriture optimiste pas encore confirmée par le serveur. */
  pending: boolean;
}

export const initialState = (): EntityState => ({
  hovered: false,
  selected: false,
  dragging: false,
  locked: false,
  hiddenForPlayers: false,
  remote: false,
  pending: false,
});

export class MapEntity<D extends MapDto = MapDto> {
  /** Géométrie de la donnée (confirmée ou optimiste). */
  geometry: EntityGeometry;
  /** Géométrie affichée pendant un geste local ou le direct d'un autre ; null sinon. */
  preview: EntityGeometry | null = null;
  /** Plan de rendu. */
  plane: PlaneId;
  /** Calque du MJ (plan `content`), sinon null. */
  layerId: string | null = null;
  /** Ordre dans le calque (croissant : du dessous vers le dessus). */
  z = 0;
  readonly state: EntityState = initialState();
  /** Conteneur Pixi (null sans rendu). */
  display: Container | null = null;
  /** Ce qui cache l'entité (clé libre : `layers`, `vision`…). */
  readonly masks = new Set<string>();
  /** Données libres du rendu de la sorte (objets Pixi gardés d'une mise à jour à l'autre). */
  renderState: Record<string, unknown> = {};

  constructor(
    readonly kind: EntityKind<D>,
    public data: D,
    geometry: EntityGeometry,
    plane: PlaneId,
    /** Ordre d'arrivée : départage deux entités au même rang. */
    public sequence: number,
  ) {
    this.geometry = geometry;
    this.plane = plane;
  }

  get id(): string {
    return this.data.id;
  }

  /** Géométrie affichée. */
  get current(): EntityGeometry {
    return this.preview ?? this.geometry;
  }

  /** Boîte englobante dans le monde (index spatial, lasso, culling). */
  bounds(): Rect {
    return this.kind.bounds?.(this) ?? geometryBounds(this.current);
  }

  /** Le point du monde touche l'entité, à `tolerance` pixels du monde près. */
  hitTest(p: Point, tolerance: number): boolean {
    if (this.kind.hitTest) return this.kind.hitTest(this, p, tolerance);
    return geometryContains(this.current, p, tolerance);
  }
}
