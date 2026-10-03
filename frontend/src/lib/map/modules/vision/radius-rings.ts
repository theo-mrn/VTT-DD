/**
 * Rayons de vision (docs/carte.md § 9) : un liseré doux autour de chaque observateur
 * dessiné par la visibilité : ses personnages pour un joueur, ceux du joueur montré en « Vue
 * de… », tous ceux des joueurs pour le MJ. Au-dessus de l'ombre (plan `adornments`) : un bord
 * clair qui s'estompe vers l'intérieur, sans trait dur, de largeur constante à l'écran ; suit
 * les tokens en direct (positions de la visibilité).
 * Redessiné seulement quand les observateurs, le zoom ou la préférence changent.
 */
import type * as Pixi from 'pixi.js';
import type { MapTheme } from '../../engine/entities/entity-kind';
import type { VisionPicture } from './vision-state';

/**
 * Liseré doux : quelques anneaux concentriques de `FEATHER_STEP_PX` pixels d'écran vers
 * l'intérieur, de plus en plus transparents (bord à `EDGE_ALPHA`), sans trait dur.
 */
const FEATHER_RINGS = 6;
const FEATHER_STEP_PX = 2;
const EDGE_ALPHA = 0.16;

/** Anneaux du liseré, du bord vers l'intérieur : retrait (px d'écran) et opacité. */
export function featherRings(): { insetPx: number; alpha: number }[] {
  return Array.from({ length: FEATHER_RINGS }, (_, i) => ({
    insetPx: (i + 0.5) * FEATHER_STEP_PX,
    alpha: EDGE_ALPHA * (1 - i / FEATHER_RINGS) ** 2,
  }));
}

export class VisionRings {
  private readonly gfx: Pixi.Graphics;
  private drawn: { picture: VisionPicture | null; viewers: number; zoom: number; show: boolean } = {
    picture: null,
    viewers: -1,
    zoom: 0,
    show: false,
  };

  constructor(
    pixi: typeof Pixi,
    plane: Pixi.Container,
    private readonly theme: MapTheme,
  ) {
    this.gfx = new pixi.Graphics({ label: 'vision-rings' });
    plane.addChild(this.gfx);
  }

  /** Redessine si besoin ; renvoie vrai si le dessin a changé. */
  draw(picture: VisionPicture | null, zoom: number, show: boolean): boolean {
    const d = this.drawn;
    const viewers = picture?.versions.viewers ?? -1;
    if (d.picture === picture && d.viewers === viewers && d.zoom === zoom && d.show === show)
      return false;
    this.drawn = { picture, viewers, zoom, show };
    const g = this.gfx;
    g.clear();
    if (!show || !picture) return true;
    const width = FEATHER_STEP_PX / zoom;
    for (const v of picture.viewers) {
      const r = v.terms.visionRadius;
      if (!(r > 0)) continue;
      for (const ring of featherRings()) {
        const rr = r - ring.insetPx / zoom;
        if (rr <= 0) break;
        g.circle(v.pos.x, v.pos.y, rr).stroke({
          width,
          color: this.theme.foreground,
          alpha: ring.alpha,
        });
      }
    }
    return true;
  }

  destroy() {
    this.gfx.removeFromParent();
    this.gfx.destroy();
  }
}
