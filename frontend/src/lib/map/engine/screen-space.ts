/**
 * Éléments à taille constante à l'écran (docs/carte.md § 4) : étiquettes, poignées, contours
 * de sélection, icônes de porte. Leur échelle vaut `base / zoom`, mise à jour en une passe au
 * changement de zoom, sur les seuls éléments affichés ; les autres sont rattrapés quand ils
 * réapparaissent (`flush`, appelé par le moteur après le culling).
 *
 * Aucun import de Pixi : un élément est tout objet qui a une échelle et un parent.
 */

export interface ScreenSpaceItem {
  scale: { set(x: number, y?: number): void };
  visible: boolean;
  destroyed?: boolean;
  parent: ScreenSpaceItem | null;
}

export class ScreenSpace {
  private readonly base = new Map<ScreenSpaceItem, number>();
  private readonly stale = new Set<ScreenSpaceItem>();
  private zoom = 1;

  get size(): number {
    return this.base.size;
  }

  get currentZoom(): number {
    return this.zoom;
  }

  /** Garde l'élément à taille constante (`scale` = échelle voulue à l'écran). Renvoie le retrait. */
  add(item: ScreenSpaceItem, scale = 1): () => void {
    this.base.set(item, scale);
    item.scale.set(scale / this.zoom);
    return () => this.remove(item);
  }

  remove(item: ScreenSpaceItem) {
    this.base.delete(item);
    this.stale.delete(item);
  }

  /** Nouveau zoom : les éléments affichés suivent tout de suite, les autres plus tard. */
  setZoom(zoom: number) {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    for (const [item, scale] of this.base) {
      if (item.destroyed) {
        this.base.delete(item);
        continue;
      }
      if (shown(item)) {
        item.scale.set(scale / zoom);
        this.stale.delete(item);
      } else this.stale.add(item);
    }
  }

  /** Rattrape les éléments redevenus visibles depuis le dernier changement de zoom. */
  flush() {
    if (!this.stale.size) return;
    for (const item of this.stale) {
      const scale = this.base.get(item);
      if (scale === undefined || item.destroyed) {
        this.stale.delete(item);
        continue;
      }
      if (shown(item)) {
        item.scale.set(scale / this.zoom);
        this.stale.delete(item);
      }
    }
  }

  clear() {
    this.base.clear();
    this.stale.clear();
  }
}

/** Affiché : lui et tous ses parents sont visibles. */
function shown(item: ScreenSpaceItem): boolean {
  for (let cur: ScreenSpaceItem | null = item; cur; cur = cur.parent)
    if (!cur.visible) return false;
  return true;
}
