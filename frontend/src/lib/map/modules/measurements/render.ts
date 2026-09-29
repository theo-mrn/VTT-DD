/**
 * Rendu des mesures (docs/carte.md § 10, Mesures) : trait de la distance au clic, formes de
 * l'outil Mesurer (règle, cône, cercle, carré), étiquettes. Partagé par la distance au clic,
 * l'aperçu de l'outil, les mesures des autres (direct) et les gabarits épinglés.
 *
 * Traits d'épaisseur constante à l'écran : un `MeasureVisual` n'est redessiné que si ce qu'il
 * montre change (points, zoom, texte, état) ; l'effacement ne touche que l'opacité. Étiquette :
 * un `BitmapText` à taille constante (échelle `1 / zoom`) sur un fond arrondi.
 *
 * Pixi est pris sur le moteur (`engine.pixi`) : ce fichier ne l'importe qu'en types.
 */
import type * as Pixi from 'pixi.js';
import type { BitmapText, Container, Graphics } from 'pixi.js';
import type { MapTheme } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import { destroyDisplay } from '../../engine/destroy-display';
import { dashedPolyline, dataColor } from '../obstacles/overlay';
import { outline, reach, type MeasureSpec } from './model';

const FONT = 'Inter, system-ui, sans-serif';
/** Écart de l'étiquette au point qu'elle décrit, pixels d'écran. */
const LABEL_GAP = 12;

/** Étiquette à taille constante sur son fond, en coordonnées du monde. */
export class MeasureLabel {
  readonly back: Graphics;
  readonly text: BitmapText;

  constructor(pixi: typeof Pixi, theme: MapTheme, parent: Container) {
    this.back = new pixi.Graphics({ label: 'measure-label-back' });
    this.text = new pixi.BitmapText({
      text: '',
      style: { fontFamily: FONT, fontSize: 12, fontWeight: '600', fill: theme.foreground },
    });
    this.text.anchor.set(0, 0);
    parent.addChild(this.back, this.text);
  }

  /** Place l'étiquette près de `at`, au-dessus et à droite (pixels d'écran), ou la cache. */
  draw(text: string | null, at: Point, zoom: number, theme: MapTheme, below = false) {
    const g = this.back;
    g.clear();
    if (!text) {
      this.text.visible = false;
      return;
    }
    const u = 1 / zoom;
    if (this.text.text !== text) this.text.text = text;
    this.text.visible = true;
    this.text.scale.set(u);
    const w = this.text.width + 12 * u;
    const h = this.text.height + 6 * u;
    const x = at.x + LABEL_GAP * u;
    const y = below ? at.y + LABEL_GAP * u : at.y - LABEL_GAP * u - h;
    this.text.position.set(x + 6 * u, y + 3 * u);
    g.roundRect(x, y, w, h, 6 * u)
      .fill({ color: theme.background, alpha: 0.85 })
      .stroke({ width: u, color: theme.muted, alpha: 0.5 });
  }
}

/**
 * Trait de la distance au clic : tirets fins d'épaisseur constante (1,5 px d'écran) sur un
 * liseré sombre, point visé marqué, étiquette près de lui.
 */
export class ClickDistanceView {
  readonly root: Container;
  private readonly line: Graphics;
  private readonly label: MeasureLabel;
  private drawn = { fx: NaN, fy: NaN, tx: NaN, ty: NaN, zoom: 0, text: '' };

  constructor(
    pixi: typeof Pixi,
    private readonly theme: MapTheme,
    plane: Container,
  ) {
    this.root = new pixi.Container({ label: 'click-distance' });
    this.line = new pixi.Graphics();
    this.root.addChild(this.line);
    this.label = new MeasureLabel(pixi, theme, this.root);
    this.root.visible = false;
    plane.addChild(this.root);
  }

  /** Montre la mesure (ou rien) ; ne redessine que si elle a changé. */
  sync(m: { from: Point; to: Point; label: string; alpha: number } | null, zoom: number) {
    if (!m) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.alpha = m.alpha;
    const d = this.drawn;
    if (
      d.fx === m.from.x &&
      d.fy === m.from.y &&
      d.tx === m.to.x &&
      d.ty === m.to.y &&
      d.zoom === zoom &&
      d.text === m.label
    )
      return;
    this.drawn = { fx: m.from.x, fy: m.from.y, tx: m.to.x, ty: m.to.y, zoom, text: m.label };
    const u = 1 / zoom;
    const g = this.line;
    const { foreground, background } = this.theme;
    g.clear();
    const pts = [m.from, m.to];
    dashedPolyline(g, pts, 6 * u, 4 * u);
    g.stroke({ width: 3.5 * u, color: background, alpha: 0.45, cap: 'round' });
    dashedPolyline(g, pts, 6 * u, 4 * u);
    g.stroke({ width: 1.5 * u, color: foreground, alpha: 0.95, cap: 'round' });
    g.circle(m.to.x, m.to.y, 3.5 * u)
      .fill({ color: foreground })
      .stroke({ width: 1.5 * u, color: background, alpha: 0.7 });
    this.label.draw(m.label, m.to, zoom, this.theme);
  }

  destroy() {
    destroyDisplay(this.root);
  }
}

/** Ce qu'un `MeasureVisual` montre. */
export interface MeasureLook {
  spec: MeasureSpec;
  /** Couleur de la donnée (`#rrggbb`…). */
  color: string;
  pixelsPerUnit: number;
  zoom: number;
  /** Texte de l'étiquette (null : aucune). */
  label: string | null;
  /** Survol ou sélection (gabarit épinglé) : trait appuyé, halo. */
  emphasis?: 'hover' | 'selected' | null;
  /** Fond coloré de la zone (sans effet animé : plus léger avec un effet). */
  fill?: boolean;
}

const sameSpec = (a: MeasureSpec | null, b: MeasureSpec) =>
  !!a &&
  a.shape === b.shape &&
  a.start.x === b.start.x &&
  a.start.y === b.start.y &&
  a.end.x === b.end.x &&
  a.end.y === b.end.y &&
  a.options === b.options;

/**
 * Dessin d'une mesure (règle, cône, cercle, carré) dans un `Container` : zone teintée, contour,
 * rayon ou axe en tirets, origine, étiquette. En coordonnées du monde.
 */
export class MeasureVisual {
  readonly root: Container;
  /** Place d'un effet animé (sous la forme). */
  readonly skinSlot: Container;
  private readonly shape: Graphics;
  private readonly label: MeasureLabel;
  private last: {
    spec: MeasureSpec | null;
    color: string;
    zoom: number;
    label: string | null;
    emphasis: string | null;
    fill: boolean;
    ppu: number;
  } = { spec: null, color: '', zoom: 0, label: null, emphasis: null, fill: true, ppu: 0 };

  constructor(
    private readonly pixi: typeof Pixi,
    private readonly theme: MapTheme,
    parent: Container,
  ) {
    this.root = new pixi.Container({ label: 'measure' });
    this.skinSlot = new pixi.Container({ label: 'measure-skin' });
    this.shape = new pixi.Graphics();
    this.root.addChild(this.skinSlot, this.shape);
    this.label = new MeasureLabel(pixi, theme, this.root);
    parent.addChild(this.root);
  }

  /** Dessine si quelque chose a changé ; renvoie vrai si le dessin a été refait. */
  draw(look: MeasureLook): boolean {
    const l = this.last;
    const emphasis = look.emphasis ?? null;
    const fill = look.fill !== false;
    if (
      sameSpec(l.spec, look.spec) &&
      l.color === look.color &&
      l.zoom === look.zoom &&
      l.label === look.label &&
      l.emphasis === emphasis &&
      l.fill === fill &&
      l.ppu === look.pixelsPerUnit
    )
      return false;
    this.last = {
      spec: { ...look.spec, start: { ...look.spec.start }, end: { ...look.spec.end } },
      color: look.color,
      zoom: look.zoom,
      label: look.label,
      emphasis,
      fill,
      ppu: look.pixelsPerUnit,
    };
    const g = this.shape;
    g.clear();
    const u = 1 / look.zoom;
    const { spec } = look;
    const color = dataColor(this.pixi, look.color, this.theme.primary);
    const { background, primary } = this.theme;
    const { length } = reach(spec);
    const width = (emphasis === 'selected' ? 3 : emphasis === 'hover' ? 2.5 : 2) * u;
    const flat = outline(spec, look.pixelsPerUnit);

    const path = () => {
      if (spec.shape === 'circle') g.circle(spec.start.x, spec.start.y, length);
      else g.poly(flatten(flat), spec.shape !== 'line');
    };

    if (spec.shape === 'line') {
      // Règle : liseré sombre, tirets de sa couleur, extrémités marquées
      if (emphasis) {
        g.moveTo(spec.start.x, spec.start.y).lineTo(spec.end.x, spec.end.y);
        g.stroke({ width: 7 * u, color: primary, alpha: 0.35, cap: 'round' });
      }
      g.moveTo(spec.start.x, spec.start.y).lineTo(spec.end.x, spec.end.y);
      g.stroke({ width: width + 2.5 * u, color: background, alpha: 0.45, cap: 'round' });
      dashedPolyline(g, [spec.start, spec.end], 10 * u, 6 * u);
      g.stroke({ width, color, cap: 'round' });
      for (const p of [spec.start, spec.end])
        g.circle(p.x, p.y, 4 * u)
          .fill({ color })
          .stroke({ width: u, color: background });
    } else if (length > 0) {
      if (fill) {
        path();
        g.fill({ color, alpha: spec.shape === 'cone' ? 0.2 : 0.16 });
      }
      if (emphasis) {
        path();
        g.stroke({ width: 7 * u, color: primary, alpha: 0.35, join: 'round' });
      }
      path();
      g.stroke({ width: width + 2 * u, color: background, alpha: 0.35, join: 'round' });
      path();
      g.stroke({ width, color, join: 'round' });
      // Rayon (cercle, carré) ou axe (cône), en tirets
      dashedPolyline(g, [spec.start, spec.end], 8 * u, 5 * u);
      g.stroke({ width: 1.5 * u, color, alpha: 0.85 });
      g.circle(spec.start.x, spec.start.y, 4 * u)
        .fill({ color })
        .stroke({ width: u, color: background });
      g.circle(spec.end.x, spec.end.y, 2.5 * u).fill({ color, alpha: 0.9 });
    }
    this.label.draw(look.label, labelAnchor(spec), look.zoom, this.theme);
    return true;
  }

  /** Force le prochain dessin (effet animé arrivé…). */
  touch() {
    this.last = { ...this.last, spec: null };
  }

  destroy() {
    destroyDisplay(this.root);
  }
}

const flatten = (pts: readonly Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** Où poser l'étiquette : au bout de la mesure (au milieu pour une règle). */
export function labelAnchor(spec: MeasureSpec): Point {
  if (spec.shape === 'line')
    return { x: (spec.start.x + spec.end.x) / 2, y: (spec.start.y + spec.end.y) / 2 };
  return spec.end;
}
