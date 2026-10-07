/**
 * Trajets des autres (docs/carte.md § 10, Trajet des déplacements ; direct § 8,
 * `map.live.path`) : départ et points de passage reçus ; le point courant est le fantôme du
 * token. Un trajet se montre tant que le fantôme est là ou qu'il vient d'arriver (token connu,
 * non masqué), et s'efface en `FADE_MS` après la fin du geste de son auteur. Sans Pixi.
 */
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { LIVE_EXPIRE_MS, type PathEvent } from '@/lib/map/live/live-channel';
import { FADE_MS, unflatten } from './model';

interface Received {
  userId: string;
  points: Point[];
  receivedAt: number;
  /** Fin du geste de l'auteur (horloge du moteur), null tant qu'il glisse. */
  endedAt: number | null;
  revision: number;
}

/** Ce que le rendu dessine d'un trajet reçu. */
export interface RemotePathView {
  entityId: string;
  entity: MapEntity;
  points: readonly Point[];
  revision: number;
  alpha: number;
}

export class RemotePaths {
  private readonly byEntity = new Map<string, Received>();
  private revisions = 0;
  /** Vue passée au rendu, réutilisée (aucune allocation par image). */
  private readonly view = {
    entityId: '',
    entity: null as unknown as MapEntity,
    points: [] as readonly Point[],
    revision: 0,
    alpha: 1,
  } satisfies RemotePathView;

  get size(): number {
    return this.byEntity.size;
  }

  /** Un message reçu : trajets posés ou effacés, fin du geste de l'auteur. */
  handle(e: PathEvent, now: number) {
    for (const [entityId, flat] of e.paths) {
      const before = this.byEntity.get(entityId);
      if (!flat.length) {
        if (before?.userId === e.userId) this.byEntity.delete(entityId);
        continue;
      }
      this.byEntity.set(entityId, {
        userId: e.userId,
        points: unflatten(flat),
        receivedAt: now,
        endedAt: null,
        revision: ++this.revisions,
      });
    }
    if (e.end) for (const r of this.byEntity.values()) if (r.userId === e.userId) r.endedAt ??= now;
  }

  /**
   * Trajets à dessiner à l'instant `now`, passés à `visit` ; ceux qui ont fini de s'effacer, ou
   * dont le fantôme a disparu depuis longtemps, sont oubliés. Renvoie vrai si un effacement est
   * en cours (une image de plus).
   */
  forEach(engine: MapEngine, now: number, visit: (p: RemotePathView) => void): boolean {
    let fading = false;
    for (const [entityId, r] of this.byEntity) {
      const alpha = r.endedAt === null ? 1 : 1 - (now - r.endedAt) / FADE_MS;
      if (alpha <= 0) {
        this.byEntity.delete(entityId);
        continue;
      }
      const entity = engine.entity(entityId);
      // Inconnu, masqué (vision, calque), ou tenu par moi : rien
      if (!entity || entity.masks.size || entity.state.dragging) continue;
      // Pendant le geste : avec le fantôme, ou tout juste reçu (le fantôme suit) ; sans
      // nouvelles ni fantôme, il est oublié comme lui
      if (r.endedAt === null && !entity.state.remote && now - r.receivedAt > LIVE_EXPIRE_MS) {
        this.byEntity.delete(entityId);
        continue;
      }
      if (r.endedAt !== null) fading = true;
      const v = this.view;
      v.entityId = entityId;
      v.entity = entity;
      v.points = r.points;
      v.revision = r.revision;
      v.alpha = alpha;
      visit(v);
    }
    return fading;
  }

  clear() {
    this.byEntity.clear();
  }
}
