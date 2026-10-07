/**
 * Curseurs des autres (docs/carte.md § 8, direct) : une flèche fine à la couleur de chacun,
 * cernée de blanc avec une ombre légère, et son nom dans une pastille de la même couleur, à
 * côté de la pointe. Taille constante à l'écran (échelle 1 / zoom), positions interpolées par
 * le canal direct. Chaque curseur est construit une fois ; seuls sa position et son échelle
 * changent à chaque image, la pastille n'est redessinée que si le nom change.
 */
import { translate } from '@/i18n/runtime';
import type * as Pixi from 'pixi.js';
import type { Container, Graphics, Text } from 'pixi.js';
import { destroyDisplay } from './destroy-display';

/**
 * Couleurs des curseurs (données) : vives et distinctes, lisibles sur un fond clair ou sombre.
 * Chacun garde la sienne d'une session à l'autre (tirée de son identifiant).
 */
export const CURSOR_COLORS = [
  0x3b82f6, // bleu
  0xf97316, // orange
  0x22c55e, // vert
  0xa855f7, // violet
  0xec4899, // rose
  0x14b8a6, // turquoise
  0xeab308, // ambre
  0xef4444, // rouge
] as const;

/** Couleur d'un utilisateur : toujours la même (hachage FNV-1a de son identifiant). */
export function cursorColor(userId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return CURSOR_COLORS[(h >>> 0) % CURSOR_COLORS.length]!;
}

/** Texte lisible sur une couleur : sombre sur une couleur claire, blanc sinon. */
export function textOn(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? 0x18181b : 0xffffff;
}

/** Flèche, pointe en (0, 0) : pixels d'écran. */
const ARROW = [0, 0, 0, 15.5, 4.2, 11.8, 6.9, 17.6, 9.3, 16.6, 6.7, 10.9, 12, 10.9];
/** Pastille du nom, sous la flèche à droite. */
const LABEL_X = 10;
const LABEL_Y = 17;
const PAD_X = 7;
const PAD_Y = 3;
const FONT_SIZE = 11.5;
const MAX_NAME = 22;

interface CursorSprite {
  root: Container;
  pill: Graphics;
  label: Text;
  name: string;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

export class CursorLayer {
  private readonly sprites = new Map<string, CursorSprite>();

  constructor(
    private readonly pixi: typeof Pixi,
    private readonly plane: Container,
  ) {}

  /** Aligne les curseurs sur `positions` (monde) ; ceux qui ont disparu sont libérés. */
  sync(positions: readonly CursorPosition[], zoom: number, nameOf: (userId: string) => string) {
    const seen = new Set<string>();
    for (const c of positions) {
      seen.add(c.userId);
      const name = shorten(nameOf(c.userId));
      let s = this.sprites.get(c.userId);
      if (!s) {
        s = this.create(c.userId, name);
        this.sprites.set(c.userId, s);
      } else if (s.name !== name) {
        s.name = name;
        s.label.text = name;
        this.drawPill(s, cursorColor(c.userId));
      }
      s.root.position.set(c.x, c.y);
      s.root.scale.set(1 / zoom);
    }
    for (const [userId, s] of this.sprites) {
      if (seen.has(userId)) continue;
      destroyDisplay(s.root);
      this.sprites.delete(userId);
    }
  }

  destroy() {
    for (const s of this.sprites.values()) destroyDisplay(s.root);
    this.sprites.clear();
  }

  private create(userId: string, name: string): CursorSprite {
    const { Container, Graphics, Text } = this.pixi;
    const color = cursorColor(userId);
    const root = new Container({ label: `cursor:${userId}` });
    // Ombre douce décalée, puis la flèche cernée de blanc
    const shadow = new Graphics({ label: 'ombre' })
      .poly(ARROW, true)
      .fill({ color: 0x000000, alpha: 0.28 });
    shadow.position.set(0.8, 1.4);
    const arrow = new Graphics({ label: 'fleche' })
      .poly(ARROW, true)
      .fill({ color })
      .stroke({ width: 1.5, color: 0xffffff, join: 'round' });
    const pill = new Graphics({ label: 'pastille' });
    const label = new Text({
      text: name,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: FONT_SIZE,
        fontWeight: '600',
        fill: textOn(color),
      },
      resolution: 2,
    });
    label.position.set(LABEL_X + PAD_X, LABEL_Y + PAD_Y);
    root.addChild(shadow, arrow, pill, label);
    this.plane.addChild(root);
    const sprite = { root, pill, label, name };
    this.drawPill(sprite, color);
    return sprite;
  }

  private drawPill(s: CursorSprite, color: number) {
    const w = Math.ceil(s.label.width) + 2 * PAD_X;
    const h = Math.ceil(s.label.height) + 2 * PAD_Y;
    s.pill
      .clear()
      .roundRect(LABEL_X + 0.8, LABEL_Y + 1.4, w, h, h / 2)
      .fill({ color: 0x000000, alpha: 0.22 })
      .roundRect(LABEL_X, LABEL_Y, w, h, h / 2)
      .fill({ color })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.9, alignment: 1 });
  }
}

/** Nom affiché : raccourci au-delà de `MAX_NAME` caractères. */
export function shorten(name: string): string {
  const n = name.trim() || translate('map.common.player');
  return n.length > MAX_NAME ? `${n.slice(0, MAX_NAME - 1)}…` : n;
}
