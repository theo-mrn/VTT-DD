/**
 * Zone de portée de la fouille (docs/carte.md § 10) : quand un objet à fouiller est seul
 * sélectionné, le MJ et le joueur voient jusqu'où un token doit s'approcher. C'est l'ensemble
 * des points à `searchRadius` unités au plus du rectangle tourné : un rectangle arrondi de
 * rayon `searchRadius × pixelsPerUnit`, tourné avec l'objet (même calcul que le serveur).
 *
 * Un seul `Graphics` dans le plan `adornments`, sous les contours ; redessiné seulement quand
 * l'objet, sa portée ou le zoom changent (suivi image par image tant qu'il est sélectionné :
 * glisser, poignées, direct des autres).
 */
import type { MapEngine } from '../../engine/map-engine';
import { isObjectEntity } from './placement';
import { reachPixels } from './reach';
import type { ObjectData } from './types';

export function mountReachRing(engine: MapEngine): () => void {
  return engine.whenMounted(() => {
    const pixi = engine.pixi;
    const plane = engine.plane('adornments');
    const theme = engine.theme;
    if (!pixi || !plane || !theme) return;
    const g = new pixi.Graphics({ label: 'object-reach' });
    g.visible = false;
    plane.addChildAt(g, 0);

    let target: string | null = null;
    let stopFrames: (() => void) | null = null;
    // Ce qui est déjà dessiné (rien n'est redessiné sans changement)
    let lw = NaN;
    let lh = NaN;
    let lr = NaN;
    let lzoom = NaN;

    const hide = () => {
      if (!g.visible) return;
      g.visible = false;
      engine.invalidate();
    };

    const draw = () => {
      const e = target ? engine.entity(target) : undefined;
      const o = e?.data as ObjectData | undefined;
      if (!e || !o?.searchable || !e.display?.visible) {
        hide();
        return;
      }
      const c = e.current;
      const r = reachPixels(o.searchRadius ?? 0, engine.kindContext().pixelsPerUnit);
      const zoom = engine.camera.zoom;
      if (c.width !== lw || c.height !== lh || r !== lr || zoom !== lzoom) {
        lw = c.width;
        lh = c.height;
        lr = r;
        lzoom = zoom;
        g.clear()
          .roundRect(-c.width / 2 - r, -c.height / 2 - r, c.width + 2 * r, c.height + 2 * r, r)
          .fill({ color: theme.primary, alpha: 0.06 })
          .stroke({ width: 1.5 / zoom, color: theme.primary, alpha: 0.55 });
      }
      g.position.set(c.x, c.y);
      g.angle = c.rotation;
      g.visible = true;
    };

    const onSelection = () => {
      const ids = engine.selection.ids;
      const e = ids.length === 1 ? engine.entity(ids[0]!) : undefined;
      target = e && isObjectEntity(e) ? e.id : null;
      if (target && !stopFrames) stopFrames = engine.onFrame(() => void draw());
      if (!target && stopFrames) {
        stopFrames();
        stopFrames = null;
      }
      draw();
    };
    const unsubscribe = engine.selection.subscribe(onSelection);
    onSelection();

    return () => {
      unsubscribe();
      stopFrames?.();
      g.removeFromParent();
      g.destroy();
    };
  });
}
