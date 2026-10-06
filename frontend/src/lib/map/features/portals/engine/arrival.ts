/**
 * Destination d'un portail interne sélectionné (MJ, docs/carte.md § 10, Portails) : des tirets
 * fléchés de l'entrée vers l'arrivée, et le repère d'arrivée (anneau et croix) s'il n'est pas
 * relié (relié, son retour est déjà dessiné à l'arrivée).
 *
 * Un seul `Graphics` dans le plan `gm`, sous les portails ; redessiné seulement quand le
 * portail, son arrivée ou le zoom changent (suivi image par image tant qu'il est sélectionné :
 * glisser, poignée d'arrivée, direct).
 */
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { dashedPolyline, dataColor } from '@/lib/map/features/obstacles/engine/overlay';
import { PORTAL_KIND, type PortalData } from './model';
import { PORTAL_ICON_PX } from './view';

export function mountArrival(
  engine: MapEngine,
  /** Arrivée en cours de glisser (poignée de l'outil), sinon null. */
  dragged: (portalId: string) => Point | null,
): () => void {
  return engine.whenMounted(() => {
    const pixi = engine.pixi;
    const plane = engine.plane('gm');
    const theme = engine.theme;
    if (!pixi || !plane || !theme || !isGm(engine.viewer)) return;
    const g = new pixi.Graphics({ label: 'portal-arrival' });
    g.visible = false;
    plane.addChildAt(g, 0);

    let target: string | null = null;
    let stopFrames: (() => void) | null = null;
    // Ce qui est dessiné : rien n'est refait (ni alloué) sans changement
    const drawn = {
      data: null as PortalData | null,
      fromX: Number.NaN,
      fromY: Number.NaN,
      to: null as Point | null,
      zoom: Number.NaN,
    };

    const hide = () => {
      if (!g.visible) return;
      g.visible = false;
      drawn.data = null;
      engine.invalidate();
    };

    const draw = () => {
      const e = target ? engine.entity(target) : undefined;
      const p = e?.data as PortalData | undefined;
      if (!e || p?.kind !== 'same_map' || !p.target || !e.display?.visible) {
        hide();
        return;
      }
      const from = e.current;
      const to = dragged(e.id) ?? p.target;
      const zoom = engine.camera.zoom;
      if (
        drawn.data === p &&
        drawn.fromX === from.x &&
        drawn.fromY === from.y &&
        drawn.to === to &&
        drawn.zoom === zoom
      )
        return;
      drawn.data = p;
      drawn.fromX = from.x;
      drawn.fromY = from.y;
      drawn.to = to;
      drawn.zoom = zoom;
      const u = 1 / zoom;
      const color = dataColor(pixi, p.color, theme.primary);
      g.clear();
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      // Des bords des icônes, pas de leurs centres
      const gap = (PORTAL_ICON_PX + 4) * u;
      if (len > gap * 2) {
        const ux = dx / len;
        const uy = dy / len;
        const a = { x: from.x + ux * gap, y: from.y + uy * gap };
        const b = { x: to.x - ux * gap, y: to.y - uy * gap };
        dashedPolyline(g, [a, b], 9 * u, 6 * u);
        g.stroke({ width: 3.5 * u, color: theme.background, alpha: 0.55, cap: 'round' });
        dashedPolyline(g, [a, b], 9 * u, 6 * u);
        g.stroke({ width: 2 * u, color, alpha: 0.95, cap: 'round' });
        // Pointe de flèche à l'arrivée
        const h = 9 * u;
        const w = 5.5 * u;
        g.poly(
          [
            b.x,
            b.y,
            b.x - ux * h - uy * w,
            b.y - uy * h + ux * w,
            b.x - ux * h + uy * w,
            b.y - uy * h - ux * w,
          ],
          true,
        )
          .fill({ color })
          .stroke({ width: u, color: theme.background, alpha: 0.7 });
      }
      if (!p.linkedPortalId) {
        // Repère d'arrivée : anneau et croix
        const s = 6 * u;
        g.circle(to.x, to.y, 11 * u)
          .fill({ color: theme.background, alpha: 0.75 })
          .stroke({ width: 2 * u, color, alpha: 0.95 });
        g.moveTo(to.x - s, to.y - s)
          .lineTo(to.x + s, to.y + s)
          .moveTo(to.x + s, to.y - s)
          .lineTo(to.x - s, to.y + s)
          .stroke({ width: 2 * u, color, cap: 'round' });
      }
      g.visible = true;
      engine.invalidate();
    };

    const onSelection = () => {
      const ids = engine.selection.ids;
      const e = ids.length === 1 ? engine.entity(ids[0]!) : undefined;
      target = e?.kind.id === PORTAL_KIND ? e.id : null;
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
