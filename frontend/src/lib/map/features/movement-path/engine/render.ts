/**
 * Rendu d'un trajet (docs/carte.md § 10, Trajet des déplacements) :
 *
 * - les cases traversées, teintées, dans le plan `grid` (sous les tokens, au-dessus du
 *   quadrillage) ; au-delà du déplacement du personnage, en `destructive` ;
 * - le chemin dans le plan `live` : liseré sombre puis trait `primary` d'épaisseur constante à
 *   l'écran (sans grille, la part au-delà du déplacement en `destructive`), anneau au départ,
 *   points de passage, étiquette au bout (« 8 m », « 8 / 6 m »), liseré `destructive` au-delà.
 *
 * Rien n'est redessiné si rien n'a changé : les cases seulement quand le trajet, la case
 * courante, le palier de zoom ou le déplacement changent ; le trait quand la position change ;
 * l'effacement ne touche que l'opacité. Pixi est pris sur le moteur : ce fichier ne l'importe
 * qu'en types.
 */
import type * as Pixi from 'pixi.js';
import { destroyDisplay } from '@/lib/map/engine/destroy-display';
import type { MapTheme } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { UnitContext } from '@/lib/map/features/measurements/engine/model';
import {
  cellOf,
  exceeds,
  measurePath,
  pathLabel,
  pointAlong,
  type PathCell,
  type PathMeasure,
} from './model';

const FONT = 'Inter, system-ui, sans-serif';
/** Écart de l'étiquette au bord du token, pixels d'écran. */
const LABEL_GAP = 10;

/** Ce qu'une vue de trajet montre. */
export interface PathLook {
  /** Départ et points de passage. */
  points: readonly Point[];
  /** Position courante du token. */
  end: Point;
  /** Change à chaque point de passage ajouté ou retiré. */
  revision: number;
  /** Rayon du token (pixels du monde) : l'étiquette se pose à côté de lui. */
  radius: number;
  /** Déplacement du personnage (unités), null s'il n'est pas connu ici. */
  speed: number | null;
  units: UnitContext;
  /** Palier de zoom (traits d'épaisseur constante). */
  zoom: number;
  alpha: number;
}

/** Étiquette à taille constante sur son fond, liseré `destructive` au-delà du déplacement. */
class PathLabel {
  private readonly back: Pixi.Graphics;
  private readonly text: Pixi.BitmapText;

  constructor(
    pixi: typeof Pixi,
    private readonly theme: MapTheme,
    parent: Pixi.Container,
  ) {
    this.back = new pixi.Graphics({ label: 'path-label-back' });
    this.text = new pixi.BitmapText({
      text: '',
      style: { fontFamily: FONT, fontSize: 12, fontWeight: '600', fill: theme.foreground },
    });
    parent.addChild(this.back, this.text);
  }

  draw(text: string, at: Point, radius: number, zoom: number, over: boolean) {
    const u = 1 / zoom;
    if (this.text.text !== text) this.text.text = text;
    this.text.scale.set(u);
    const w = this.text.width + 12 * u;
    const h = this.text.height + 6 * u;
    const x = at.x + radius + LABEL_GAP * u;
    const y = at.y - radius - h / 2;
    this.text.position.set(x + 6 * u, y + 3 * u);
    const { background, muted, destructive } = this.theme;
    this.back
      .clear()
      .roundRect(x, y, w, h, 6 * u)
      .fill({ color: background, alpha: 0.88 })
      .stroke(
        over
          ? { width: 1.5 * u, color: destructive, alpha: 0.95 }
          : { width: u, color: muted, alpha: 0.5 },
      );
  }
}

/** Clé numérique d'une case (sans chaîne : aucune allocation). */
const cellKey = (c: PathCell) => (c.col + 32_768) * 65_536 + (c.row + 32_768);

/** Un trajet dessiné : ses cases (plan `grid`) et son chemin (plan `live`). */
export class PathView {
  private readonly cells: Pixi.Graphics;
  private readonly root: Pixi.Container;
  private readonly line: Pixi.Graphics;
  private readonly label: PathLabel;
  /** Image où la vue a servi pour la dernière fois (les vues inutilisées sont détruites). */
  seen = 0;
  private drawn = {
    revision: -1,
    endX: Number.NaN,
    endY: Number.NaN,
    zoom: 0,
    speed: null as number | null,
    units: null as UnitContext | null,
    radius: 0,
    cellCol: Number.NaN,
    cellRow: Number.NaN,
  };
  private readonly seenCells = new Map<number, boolean>();

  constructor(
    pixi: typeof Pixi,
    private readonly theme: MapTheme,
    gridPlane: Pixi.Container,
    livePlane: Pixi.Container,
  ) {
    this.cells = new pixi.Graphics({ label: 'movement-path-cells' });
    gridPlane.addChild(this.cells);
    this.root = new pixi.Container({ label: 'movement-path' });
    this.line = new pixi.Graphics();
    this.root.addChild(this.line);
    this.label = new PathLabel(pixi, theme, this.root);
    livePlane.addChild(this.root);
  }

  /** Montre le trajet ; ne redessine que ce qui a changé. */
  sync(look: PathLook) {
    this.root.alpha = look.alpha;
    this.cells.alpha = look.alpha;
    const d = this.drawn;
    if (
      d.revision === look.revision &&
      d.endX === look.end.x &&
      d.endY === look.end.y &&
      d.zoom === look.zoom &&
      d.speed === look.speed &&
      d.units === look.units &&
      d.radius === look.radius
    )
      return;
    const vertices = [...look.points, look.end];
    const m = measurePath(vertices, look.units);
    const over = exceeds(m.units, look.speed);
    // Les cases ne changent qu'avec la case courante, le trajet, le zoom ou le déplacement
    const grid = look.units.grid;
    const cell = grid ? cellOf(look.end, grid) : null;
    if (
      d.revision !== look.revision ||
      d.zoom !== look.zoom ||
      d.speed !== look.speed ||
      d.units !== look.units ||
      d.cellCol !== cell?.col ||
      d.cellRow !== cell?.row
    )
      this.drawCells(m, look);
    this.drawLine(vertices, m, look);
    this.label.draw(
      pathLabel(m.units, look.units.unitName, look.speed),
      look.end,
      look.radius,
      look.zoom,
      over,
    );
    this.drawn = {
      revision: look.revision,
      endX: look.end.x,
      endY: look.end.y,
      zoom: look.zoom,
      speed: look.speed,
      units: look.units,
      radius: look.radius,
      cellCol: cell?.col ?? Number.NaN,
      cellRow: cell?.row ?? Number.NaN,
    };
  }

  /** Cases traversées, chacune une fois ; en `destructive` celles atteintes au-delà. */
  private drawCells(m: PathMeasure, look: PathLook) {
    const g = this.cells;
    g.clear();
    const grid = look.units.grid;
    if (!m.cells || !grid) return;
    const seen = this.seenCells;
    seen.clear();
    // Une case revisitée est au-delà si l'un de ses passages l'est
    for (const c of m.cells) {
      // Coût en cases, déplacement dans l'unité de la scène
      const per = look.units.unitsPerCell > 0 ? look.units.unitsPerCell : 1;
      const beyond = m.counted && look.speed !== null && c.cost * per > look.speed;
      seen.set(cellKey(c), (seen.get(cellKey(c)) ?? false) || beyond);
    }
    const { primary, destructive } = this.theme;
    const u = 1 / look.zoom;
    const ox = grid.offsetX ?? 0;
    const oy = grid.offsetY ?? 0;
    for (const beyond of [false, true]) {
      let any = false;
      for (const [key, b] of seen) {
        if (b !== beyond) continue;
        const col = Math.floor(key / 65_536) - 32_768;
        const row = (key % 65_536) - 32_768;
        g.rect(ox + col * grid.size, oy + row * grid.size, grid.size, grid.size);
        any = true;
      }
      if (!any) continue;
      const color = beyond ? destructive : primary;
      g.fill({ color, alpha: beyond ? 0.24 : 0.18 });
      for (const [key, b] of seen) {
        if (b !== beyond) continue;
        const col = Math.floor(key / 65_536) - 32_768;
        const row = (key % 65_536) - 32_768;
        g.rect(
          ox + col * grid.size + u,
          oy + row * grid.size + u,
          grid.size - 2 * u,
          grid.size - 2 * u,
        );
      }
      g.stroke({ width: u, color, alpha: 0.55 });
    }
  }

  /** Chemin : liseré, trait (sans grille : la part au-delà en `destructive`), départ, passages. */
  private drawLine(vertices: readonly Point[], m: PathMeasure, look: PathLook) {
    const g = this.line;
    g.clear();
    const u = 1 / look.zoom;
    const { primary, destructive, background } = this.theme;
    const polyline = (pts: readonly Point[], from: number, to: number, start?: Point) => {
      g.moveTo((start ?? pts[from]!).x, (start ?? pts[from]!).y);
      for (let i = start ? from : from + 1; i <= to; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    };
    const last = vertices.length - 1;
    polyline(vertices, 0, last);
    g.stroke({ width: 5 * u, color: background, alpha: 0.5, cap: 'round', join: 'round' });
    // Sans grille : coupé là où le déplacement s'arrête
    const ppu = look.units.pixelsPerUnit > 0 ? look.units.pixelsPerUnit : 50;
    const split =
      !m.counted && look.speed !== null && exceeds(m.units, look.speed)
        ? pointAlong(vertices, (look.speed / (look.units.unitsPerCell || 1)) * ppu)
        : null;
    if (split) {
      polyline([...vertices.slice(0, split.segment), split.point], 0, split.segment);
      g.stroke({ width: 2.5 * u, color: primary, cap: 'round', join: 'round' });
      polyline(vertices, split.segment, last, split.point);
      g.stroke({ width: 2.5 * u, color: destructive, cap: 'round', join: 'round' });
    } else {
      polyline(vertices, 0, last);
      g.stroke({ width: 2.5 * u, color: primary, cap: 'round', join: 'round' });
    }
    const origin = look.points[0]!;
    g.circle(origin.x, origin.y, 5 * u)
      .fill({ color: background, alpha: 0.7 })
      .stroke({ width: 2 * u, color: primary });
    for (let i = 1; i < look.points.length; i++) {
      const p = look.points[i]!;
      g.circle(p.x, p.y, 4 * u)
        .fill({ color: primary })
        .stroke({ width: u, color: background });
    }
  }

  destroy() {
    destroyDisplay(this.cells);
    destroyDisplay(this.root);
  }
}
