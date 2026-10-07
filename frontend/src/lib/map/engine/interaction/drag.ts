/**
 * Glisser et poignées (docs/carte.md § 6) : l'aperçu local d'un geste sur des entités, son
 * direct (§ 8) et sa fin en **une** commande pour toute la sélection. Échap pendant le geste :
 * tout revient en place, rien n'est écrit.
 *
 * - `DragSession` : déplacer la sélection ; aimantation à la grille (Alt pour s'en passer) sur
 *   l'entité tenue, le même écart pour les autres.
 * - `TransformSession` : une poignée de rotation (⇧ : pas de 15°) ou de taille (⇧ : garde les
 *   proportions).
 */
import { translate } from '@/i18n/runtime';
import type { EntityGeometry, Point } from '../geometry';
import type { MapEntity } from '../entities/entity';
import type { DragEvent, MapEngine } from '../map-engine';
import { snapGeometryToGrid } from './snapping';
import { resizeGeometry, rotateGeometry, type HandleId } from './transform-gizmo';

/** Seuil du glisser, en pixels d'écran : en dessous, c'est un clic. */
export const DRAG_THRESHOLD_PX = 4;

export const exceedsThreshold = (a: Point, b: Point, threshold = DRAG_THRESHOLD_PX) =>
  Math.hypot(a.x - b.x, a.y - b.y) > threshold;

const moveLabel = (n: number) =>
  n > 1 ? translate('map.common.moveMany', { count: n }) : translate('map.common.move');

export class DragSession {
  private dx = 0;
  private dy = 0;
  private done = false;
  /** Étape signalée aux modules (`engine.onDrag`), un seul objet pour tout le geste. */
  private readonly event: DragEvent;

  constructor(
    private readonly engine: MapEngine,
    readonly entities: readonly MapEntity[],
    private readonly start: Point,
    /** Entité tenue sous le pointeur : c'est elle qui s'aimante. */
    private readonly primary: MapEntity,
  ) {
    engine.setEntityState(entities, { dragging: true });
    this.event = { phase: 'start', entities, primary, committed: false };
    engine.emitDrag(this.event);
  }

  get delta(): Point {
    return { x: this.dx, y: this.dy };
  }

  /** Nouvelle position du pointeur ; `snap` faux avec Alt. */
  update(world: Point, opts: { snap: boolean }) {
    if (this.done) return;
    let dx = world.x - this.start.x;
    let dy = world.y - this.start.y;
    const grid = this.engine.snapGrid(!opts.snap);
    if (grid) {
      const g = this.primary.geometry;
      const snapped = snapGeometryToGrid({ ...g, x: g.x + dx, y: g.y + dy }, grid);
      dx = snapped.x - g.x;
      dy = snapped.y - g.y;
    }
    this.dx = dx;
    this.dy = dy;
    for (const e of this.entities)
      this.engine.setPreview(e, { ...e.geometry, x: e.geometry.x + dx, y: e.geometry.y + dy });
    this.engine.live?.drag(
      this.entities.map((e) => [e.id, e.current.x, e.current.y] as [string, number, number]),
    );
    this.event.phase = 'move';
    this.engine.emitDrag(this.event);
  }

  /** Fin du geste : une commande pour toute la sélection (null si rien n'a bougé). */
  commit(): Promise<boolean> | null {
    if (this.done) return null;
    this.done = true;
    this.engine.live?.end();
    const moved = this.dx !== 0 || this.dy !== 0;
    const changes = moved
      ? this.entities.map((e) => ({
          entity: e,
          next: { ...e.geometry, x: e.geometry.x + this.dx, y: e.geometry.y + this.dy },
        }))
      : [];
    // La commande écrit le magasin tout de suite : la géométrie prend le relais de l'aperçu
    const result = moved ? this.engine.transformEntities(changes, moveLabel(changes.length)) : null;
    this.finish(result !== null);
    return result;
  }

  /** Échap : tout revient en place. */
  cancel() {
    if (this.done) return;
    this.done = true;
    this.engine.live?.end();
    this.finish(false);
  }

  private finish(committed: boolean) {
    for (const e of this.entities) this.engine.setPreview(e, null);
    this.engine.setEntityState(this.entities, { dragging: false });
    this.event.phase = 'end';
    this.event.committed = committed;
    this.engine.emitDrag(this.event);
  }
}

export class TransformSession {
  private next: EntityGeometry;
  private done = false;

  constructor(
    private readonly engine: MapEngine,
    readonly entity: MapEntity,
    readonly handle: HandleId,
    private readonly start: Point,
  ) {
    this.next = entity.geometry;
    engine.setEntityState([entity], { dragging: true });
  }

  update(world: Point, opts: { shift: boolean }) {
    if (this.done) return;
    const g = this.entity.geometry;
    const kind = this.entity.kind;
    this.next =
      this.handle === 'rotate'
        ? rotateGeometry(g, this.start, world, opts.shift)
        : resizeGeometry(
            g,
            this.handle,
            world,
            opts.shift || kind.keepAspectRatio === true,
            kind.minSize,
          );
    this.engine.setPreview(this.entity, this.next);
    const n = this.next;
    this.engine.live?.transform([[this.entity.id, n.x, n.y, n.width, n.height, n.rotation]]);
  }

  commit(): Promise<boolean> | null {
    if (this.done) return null;
    this.done = true;
    this.engine.live?.end();
    const g = this.entity.geometry;
    const n = this.next;
    const changed =
      n.x !== g.x ||
      n.y !== g.y ||
      n.width !== g.width ||
      n.height !== g.height ||
      n.rotation !== g.rotation;
    const label =
      this.handle === 'rotate' ? translate('map.common.rotate') : translate('map.common.resize');
    const result = changed
      ? this.engine.transformEntities([{ entity: this.entity, next: n }], label)
      : null;
    this.finish();
    return result;
  }

  cancel() {
    if (this.done) return;
    this.done = true;
    this.engine.live?.end();
    this.finish();
  }

  private finish() {
    this.engine.setPreview(this.entity, null);
    this.engine.setEntityState([this.entity], { dragging: false });
  }
}
