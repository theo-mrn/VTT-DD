/**
 * Dessin des obstacles et des pièces (docs/carte.md § 10, Rendu MJ).
 *
 * - MJ : murs épais (liseré sombre sous un trait clair ou à la couleur choisie), fenêtres en
 *   tirets, portes (trait à la couleur des portes, en tirets quand elles sont ouvertes), murs à
 *   sens unique avec une flèche par segment qui montre le sens où l'on voit, transparence
 *   (`opacity`) rendue par l'intensité du trait. Survol et sélection : un halo sous le trait.
 * - Pièces : contour pointillé et nom (taille constante), MJ seulement.
 * - Icônes de porte (tous) : taille constante, ouverte ou fermée, cadenas si verrouillée. Leurs
 *   dessins sont des `GraphicsContext` partagés : une porte de plus ne coûte aucune géométrie.
 *
 * Tout est dessiné en coordonnées du monde (`transformDisplay: false`). Les points affichés
 * sont ceux de l'aperçu d'un geste (`setPreview`), sinon ceux de la donnée.
 */
import type { Container, Graphics, GraphicsContext, Text } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import { isGm, type MapTheme } from '../../engine/entities/entity-kind';
import { distance, type Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import { centroid, isClosed, oneWayArrow, polylineSegments, type Pts } from './geometry';
import { type ObstacleData, type RoomData } from './model';
import { OverlayRedraw, dashedPolyline, dataColor } from './overlay';

/** Rayon de l'icône de porte, en pixels d'écran. */
export const DOOR_ICON_PX = 11;

interface ObstacleVisual {
  line: Graphics;
  icon: Container | null;
  glyph: Graphics | null;
  unregister: (() => void) | null;
}

interface RoomVisual {
  shape: Graphics;
  label: Container;
  text: Text;
  pill: Graphics;
  unregister: () => void;
  name: string;
}

interface DoorContexts {
  closed: GraphicsContext;
  open: GraphicsContext;
  closedLocked: GraphicsContext;
  openLocked: GraphicsContext;
}

/** Milieu d'une porte (où est son icône). */
export function doorCenter(pts: Pts): Point {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class ObstacleView {
  /** Points affichés pendant un geste (glisser un sommet, déplacer des murs). */
  private readonly previews = new Map<string, Point[]>();
  private readonly redraw: OverlayRedraw;
  private doorContexts: DoorContexts | null = null;
  private readonly entities = new Map<string, MapEntity>();

  constructor(private readonly engine: MapEngine) {
    this.redraw = new OverlayRedraw(engine, (e) => this.draw(e));
  }

  dispose() {
    this.redraw.dispose();
    const c = this.doorContexts;
    this.doorContexts = null;
    if (c) for (const ctx of Object.values(c)) ctx.destroy();
    this.entities.clear();
    this.previews.clear();
  }

  /** Points affichés d'un mur ou d'une pièce. */
  pointsOf(e: MapEntity): Pts {
    return this.previews.get(e.id) ?? (e.data as unknown as { points: Point[] }).points;
  }

  hasPreview(id: string): boolean {
    return this.previews.has(id);
  }

  /** Aperçu des points d'entités pendant un geste (null : fin de l'aperçu). */
  setPreviews(next: ReadonlyMap<string, Point[]> | null) {
    const changed = new Set<string>(this.previews.keys());
    this.previews.clear();
    if (next)
      for (const [id, pts] of next) {
        this.previews.set(id, pts);
        changed.add(id);
      }
    for (const id of changed) {
      const e = this.entities.get(id);
      if (e) this.draw(e);
    }
    this.engine.invalidate();
  }

  // ─── Cycle de vie des entités ──────────────────────────────────────────────

  mount(e: MapEntity) {
    const pixi = this.engine.pixi;
    if (!pixi || !e.display) return;
    this.entities.set(e.id, e);
    this.redraw.track(e);
    if (e.kind.collection === 'rooms') {
      const shape = new pixi.Graphics({ label: 'room' });
      const label = new pixi.Container({ label: 'room-name' });
      const pill = new pixi.Graphics();
      const text = new pixi.Text({
        text: '',
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fill: this.engine.theme?.foreground ?? 0,
        },
        resolution: 2,
      });
      text.anchor.set(0.5);
      label.addChild(pill, text);
      e.display.addChild(shape, label);
      const unregister = this.engine.screenSpace.add(label);
      e.renderState.room = { shape, label, text, pill, unregister, name: '' } satisfies RoomVisual;
    } else {
      const line = new pixi.Graphics({ label: 'obstacle' });
      e.display.addChild(line);
      e.renderState.obstacle = {
        line,
        icon: null,
        glyph: null,
        unregister: null,
      } satisfies ObstacleVisual;
    }
    this.draw(e);
  }

  unmount(e: MapEntity) {
    this.entities.delete(e.id);
    this.redraw.untrack(e);
    // Les dessins propres sont libérés ici (le conteneur seul ne libère pas leur géométrie) ;
    // les icônes de porte partagent leurs dessins : seul l'objet part
    const o = e.renderState.obstacle as ObstacleVisual | undefined;
    if (o) {
      o.unregister?.();
      o.line.destroy({ context: true });
      o.icon?.destroy({ children: true });
    }
    const r = e.renderState.room as RoomVisual | undefined;
    if (r) {
      r.unregister();
      r.shape.destroy({ context: true });
      r.pill.destroy({ context: true });
      r.label.destroy({ children: true });
    }
    e.renderState = {};
  }

  // ─── Dessin ────────────────────────────────────────────────────────────────

  draw(e: MapEntity) {
    if (e.kind.collection === 'rooms') this.drawRoom(e);
    else this.drawObstacle(e);
  }

  private drawObstacle(e: MapEntity) {
    const v = e.renderState.obstacle as ObstacleVisual | undefined;
    const theme = this.engine.theme;
    const pixi = this.engine.pixi;
    if (!v || !theme || !pixi) return;
    const o = e.data as unknown as ObstacleData;
    const pts = this.pointsOf(e);
    const u = this.redraw.unit;
    const g = v.line;
    g.clear();

    const gm = isGm(this.engine.viewer);
    if (gm && pts.length >= 2) {
      const closed = isClosed(pts);
      const path = () => {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        if (closed) g.closePath();
      };
      const opacity = Math.max(0, Math.min(1, o.opacity ?? 1));
      const strength = 0.35 + 0.65 * opacity;
      const join = { join: 'round', cap: 'round' } as const;

      // Halo de survol ou de sélection
      if (e.state.selected || e.state.hovered) {
        path();
        g.stroke({
          width: (e.state.selected ? 11 : 9) * u,
          color: theme.primary,
          alpha: e.state.selected ? 0.5 : 0.28,
          ...join,
        });
      }

      if (o.kind === 'door') {
        const color = dataColor(pixi, o.color, theme.primary);
        path();
        g.stroke({ width: 6 * u, color: theme.background, alpha: 0.55, ...join });
        if (o.isOpen) {
          dashedPolyline(g, pts, 5 * u, 4 * u);
          g.stroke({ width: 3 * u, color, alpha: 0.85, cap: 'butt' });
        } else {
          path();
          g.stroke({ width: 4 * u, color, ...join });
        }
      } else if (o.kind === 'window') {
        const color = dataColor(pixi, o.color, theme.foreground);
        path();
        g.stroke({ width: 5 * u, color: theme.background, alpha: 0.5 * strength, ...join });
        dashedPolyline(g, pts, 7 * u, 5 * u, false);
        g.stroke({ width: 3 * u, color, alpha: strength, cap: 'butt' });
      } else {
        const color = dataColor(pixi, o.color, theme.foreground);
        path();
        g.stroke({ width: 6 * u, color: theme.background, alpha: 0.55 * strength, ...join });
        path();
        g.stroke({ width: 3 * u, color, alpha: strength, ...join });
        if (o.kind === 'one_way_wall') this.drawArrows(g, pts, o.blocksFrom ?? 'left', u, color);
      }
    }

    // Icône de porte (tous)
    if (o.kind === 'door') this.ensureIcon(e, v, o, pts);
    else if (v.icon) {
      v.unregister?.();
      v.icon.removeFromParent();
      v.icon.destroy({ children: true });
      v.icon = null;
      v.glyph = null;
      v.unregister = null;
    }
  }

  /** Flèches du mur à sens unique : au milieu de chaque segment, vers le côté que l'on voit. */
  private drawArrows(g: Graphics, pts: Pts, side: 'left' | 'right', u: number, color: number) {
    for (const [a, b] of polylineSegments(pts)) {
      const len = distance(a, b);
      if (len < 12 * u) continue;
      const n = oneWayArrow(a, b, side);
      const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const size = 7 * u;
      const tip = { x: m.x + n.x * size * 1.6, y: m.y + n.y * size * 1.6 };
      g.moveTo(m.x, m.y).lineTo(tip.x, tip.y);
      g.moveTo(tip.x - n.x * size + t.x * size * 0.8, tip.y - n.y * size + t.y * size * 0.8)
        .lineTo(tip.x, tip.y)
        .lineTo(tip.x - n.x * size - t.x * size * 0.8, tip.y - n.y * size - t.y * size * 0.8);
      g.stroke({ width: 2.5 * u, color, cap: 'round', join: 'round' });
    }
  }

  private ensureIcon(e: MapEntity, v: ObstacleVisual, o: ObstacleData, pts: Pts) {
    const pixi = this.engine.pixi!;
    const ctxs = this.contexts();
    if (!ctxs || !e.display) return;
    if (!v.icon) {
      const icon = new pixi.Container({ label: 'door-icon' });
      const glyph = new pixi.Graphics(ctxs.closed);
      icon.addChild(glyph);
      e.display.addChild(icon);
      v.icon = icon;
      v.glyph = glyph;
      v.unregister = this.engine.screenSpace.add(icon);
    }
    const ctx = o.isOpen
      ? o.isLocked
        ? ctxs.openLocked
        : ctxs.open
      : o.isLocked
        ? ctxs.closedLocked
        : ctxs.closed;
    if (v.glyph!.context !== ctx) v.glyph!.context = ctx;
    const c = doorCenter(pts);
    v.icon.position.set(c.x, c.y);
    const hover = e.state.hovered || e.state.selected;
    v.glyph!.scale.set(hover ? 1.18 : 1);
  }

  /** Dessins partagés des icônes de porte (créés une fois, au thème de la page). */
  private contexts(): DoorContexts | null {
    if (this.doorContexts) return this.doorContexts;
    const pixi = this.engine.pixi;
    const theme = this.engine.theme;
    if (!pixi || !theme) return null;
    const make = (open: boolean, locked: boolean) => {
      const c = new pixi.GraphicsContext();
      doorGlyph(c, theme, open, locked);
      return c;
    };
    this.doorContexts = {
      closed: make(false, false),
      open: make(true, false),
      closedLocked: make(false, true),
      openLocked: make(true, true),
    };
    return this.doorContexts;
  }

  private drawRoom(e: MapEntity) {
    const v = e.renderState.room as RoomVisual | undefined;
    const theme = this.engine.theme;
    if (!v || !theme) return;
    const r = e.data as unknown as RoomData;
    const pts = this.pointsOf(e);
    const u = this.redraw.unit;
    const gm = isGm(this.engine.viewer);
    const g = v.shape;
    g.clear();
    v.label.visible = gm && pts.length >= 3;
    if (!gm || pts.length < 3) return;

    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, p.y);
    g.poly(flat, true).fill({
      color: theme.primary,
      alpha: e.state.selected ? 0.1 : e.state.hovered ? 0.07 : 0.035,
    });
    if (e.state.selected) {
      g.poly(flat, true).stroke({ width: 2 * u, color: theme.primary, alpha: 0.95 });
    } else {
      dashedPolyline(g, pts, 9 * u, 6 * u, true);
      g.stroke({ width: 1.75 * u, color: theme.primary, alpha: 0.85, cap: 'butt' });
    }

    // Nom au centre, taille constante
    const name = r.name?.trim() || 'Pièce';
    if (v.name !== name) {
      v.name = name;
      v.text.text = name;
      const w = v.text.width + 14;
      const h = v.text.height + 6;
      v.pill
        .clear()
        .roundRect(-w / 2, -h / 2, w, h, h / 2)
        .fill({ color: theme.background, alpha: 0.8 })
        .stroke({ width: 1, color: theme.primary, alpha: 0.6 });
    }
    const c = centroid(pts);
    v.label.position.set(c.x, c.y);
  }
}

/** Icône de porte : pastille, battant fermé ou ouvert, cadenas. Coordonnées en px d'écran. */
function doorGlyph(c: GraphicsContext, theme: MapTheme, open: boolean, locked: boolean) {
  const r = DOOR_ICON_PX;
  const ring = open ? theme.success : theme.primary;
  c.circle(0, 0, r)
    .fill({ color: theme.background, alpha: 0.9 })
    .stroke({ width: 1.5, color: ring });
  if (open) {
    // Cadre, et battant ouvert vers la droite
    c.rect(-4.5, -6.5, 9, 13).stroke({ width: 1.2, color: theme.muted });
    c.poly([-4.5, -6.5, 3, -4.5, 3, 8.5, -4.5, 6.5], true)
      .fill({ color: ring, alpha: 0.35 })
      .stroke({ width: 1.4, color: ring, join: 'round' });
  } else {
    c.rect(-4.5, -6.5, 9, 13)
      .fill({ color: ring, alpha: 0.25 })
      .stroke({ width: 1.5, color: ring });
    c.circle(2, 0.5, 1.1).fill({ color: theme.foreground });
  }
  if (locked) {
    // Cadenas en bas à droite
    c.circle(7.5, 7.5, 5.5).fill({ color: theme.destructive }).stroke({
      width: 1,
      color: theme.background,
    });
    c.rect(5.3, 7, 4.4, 3.3).fill({ color: theme.background });
    c.moveTo(6.2, 7).arc(7.5, 6.6, 1.3, Math.PI, 0).stroke({ width: 1, color: theme.background });
  }
}
