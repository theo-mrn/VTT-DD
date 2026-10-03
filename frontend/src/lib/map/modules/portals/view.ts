/**
 * Dessin des portails (docs/carte.md § 10, Portails), plan `gm`, en coordonnées du monde (le
 * moteur ne translate le conteneur que de l'écart d'un aperçu) :
 *
 * - zone : disque de la couleur du portail, plus dense au centre (trois disques superposés, sans
 *   texture de dégradé), et anneau ; masqué aux joueurs (vue du MJ) : anneau en tirets ;
 * - icône à taille constante à l'écran : ombre, disque teinté de sa couleur, liseré clair,
 *   glyphe blanc (escalier, porte, portail, échelle), anneau de sélection, badges « aller-retour »
 *   et « automatique », œil barré s'il est masqué aux joueurs ; tous en `GraphicsContext`
 *   partagés (un seul maillage par forme, teinté par portail) ;
 * - nom sous l'icône, sur une pastille.
 *
 * Chaque partie n'est redessinée que si ce qui la décrit change ; les traits de la zone au
 * changement de palier de zoom (`OverlayRedraw`).
 */
import type { MapPortalIcon } from '@vtt/contracts';
import type { Container, Graphics, GraphicsContext, Text } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import { isGm, type MapTheme } from '../../engine/entities/entity-kind';
import type { MapEngine } from '../../engine/map-engine';
import { drawVisibilityBadge } from '../../engine/visibility-badge';
import { OverlayRedraw, dashedCircle, dataColor } from '../obstacles/overlay';
import { drawGlyph, GLYPH_HALF } from './glyphs';
import { PORTAL_ICONS, portalLabel, type PortalData } from './model';

/** Rayon de l'icône, en pixels d'écran. */
export const PORTAL_ICON_PX = 13;
/** Place des badges autour de l'icône (pixels d'écran). */
const BADGE_OFFSET = PORTAL_ICON_PX * 0.78;

const portalOf = (e: MapEntity) => e.data as PortalData;

interface PortalVisual {
  area: Graphics;
  icon: Container;
  disk: Graphics;
  glyph: Graphics;
  ring: Graphics;
  link: Graphics;
  auto: Graphics;
  hidden: Graphics;
  plate: Graphics;
  label: Text;
  release: () => void;
  /** Ce qui est dessiné (clés) : rien n'est refait sans changement. */
  drawnArea: string;
  drawnLabel: string;
}

type IconContexts = Record<
  'shadow' | 'disk' | 'rim' | 'ring' | 'link' | 'auto',
  GraphicsContext
> & {
  glyphs: Record<MapPortalIcon, GraphicsContext>;
};

/** Zone du portail : trois disques, plus denses au centre, et son anneau (tirets s'il est masqué). */
function drawArea(
  g: Graphics,
  pos: { x: number; y: number },
  r: number,
  u: number,
  color: number,
  state: { selected: boolean; hovered: boolean },
  masked: boolean,
) {
  if (r <= 0) return;
  const { x, y } = pos;
  const { selected, hovered } = state;
  g.circle(x, y, r).fill({ color, alpha: masked ? 0.05 : 0.09 });
  g.circle(x, y, r * 0.62).fill({ color, alpha: masked ? 0.04 : 0.08 });
  g.circle(x, y, r * 0.3).fill({ color, alpha: masked ? 0.04 : 0.1 });
  let width = 1.5 * u;
  if (selected) width = 2.5 * u;
  else if (hovered) width = 2 * u;
  const alpha = selected || hovered ? 0.95 : 0.7;
  if (masked) {
    dashedCircle(g, x, y, r, 6 * u, 5 * u);
    g.stroke({ width, color, alpha });
  } else g.circle(x, y, r).stroke({ width, color, alpha });
}

export class PortalView {
  private readonly redraw: OverlayRedraw;
  private contexts: IconContexts | null = null;
  /** Rayon affiché pendant la poignée de rayon (pixels du monde). */
  private radiusPreview: { id: string; radius: number } | null = null;
  private readonly entities = new Map<string, MapEntity>();

  constructor(private readonly engine: MapEngine) {
    this.redraw = new OverlayRedraw(engine, (e) => this.draw(e, true));
  }

  dispose() {
    this.redraw.dispose();
    const c = this.contexts;
    this.contexts = null;
    if (c) {
      for (const [key, ctx] of Object.entries(c))
        if (key !== 'glyphs') (ctx as GraphicsContext).destroy();
      for (const ctx of Object.values(c.glyphs)) ctx.destroy();
    }
    this.entities.clear();
  }

  /** Rayon affiché (aperçu de la poignée, sinon la donnée), en pixels du monde. */
  radiusOf(e: MapEntity): number {
    return this.radiusPreview?.id === e.id ? this.radiusPreview.radius : portalOf(e).radius;
  }

  setRadiusPreview(preview: { id: string; radius: number } | null) {
    const before = this.radiusPreview?.id;
    this.radiusPreview = preview;
    for (const id of new Set([before, preview?.id])) {
      const e = id ? this.entities.get(id) : undefined;
      if (e) this.draw(e, true);
    }
    this.engine.invalidate();
  }

  mount(e: MapEntity) {
    const pixi = this.engine.pixi;
    const theme = this.engine.theme;
    const ctxs = this.iconContexts();
    if (!pixi || !theme || !e.display || !ctxs) return;
    const area = new pixi.Graphics({ label: 'portal-area' });
    const icon = new pixi.Container({ label: 'portal-icon' });
    const shadow = new pixi.Graphics(ctxs.shadow);
    const disk = new pixi.Graphics(ctxs.disk);
    const rim = new pixi.Graphics(ctxs.rim);
    const glyph = new pixi.Graphics(ctxs.glyphs.portal);
    const ring = new pixi.Graphics(ctxs.ring);
    const link = new pixi.Graphics(ctxs.link);
    const auto = new pixi.Graphics(ctxs.auto);
    const hidden = new pixi.Graphics({ label: 'portal-hidden' });
    drawVisibilityBadge(hidden, theme, 'hidden', -BADGE_OFFSET, -BADGE_OFFSET, 0.62);
    const plate = new pixi.Graphics({ label: 'portal-plate' });
    const label = new pixi.Text({
      text: '',
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fontWeight: '600',
        fill: theme.foreground,
      },
      anchor: { x: 0.5, y: 0 },
      resolution: 2,
    });
    icon.addChild(shadow, disk, rim, glyph, ring, link, auto, hidden, plate, label);
    e.display.addChild(area, icon);
    const release = this.engine.screenSpace.add(icon);
    e.renderState.portal = {
      area,
      icon,
      disk,
      glyph,
      ring,
      link,
      auto,
      hidden,
      plate,
      label,
      release,
      drawnArea: '',
      drawnLabel: '',
    } satisfies PortalVisual;
    this.entities.set(e.id, e);
    this.redraw.track(e);
    this.draw(e);
  }

  unmount(e: MapEntity) {
    // Zone et icône sont des enfants de `e.display` : le moteur les libère avec lui
    // (`destroyDisplay` : les dessins propres libérés, les contextes partagés gardés)
    (e.renderState.portal as PortalVisual | undefined)?.release();
    this.redraw.untrack(e);
    this.entities.delete(e.id);
    e.renderState = {};
  }

  /** Redessine ce qui a changé ; `force` : la zone aussi (palier de zoom, rayon en aperçu). */
  draw(e: MapEntity, force = false) {
    const v = e.renderState.portal as PortalVisual | undefined;
    const theme = this.engine.theme;
    const pixi = this.engine.pixi;
    const ctxs = this.iconContexts();
    if (!v || !theme || !pixi || !ctxs) return;
    const p = portalOf(e);
    const gm = isGm(this.engine.viewer);
    const color = dataColor(pixi, p.color, theme.primary);
    const { selected, hovered } = e.state;
    const masked = gm && !p.visible;

    // Zone (monde), à la position de la donnée
    const r = this.radiusOf(e);
    const u = this.redraw.unit;
    const areaKey = `${p.pos.x}:${p.pos.y}:${r}:${color}:${selected ? 1 : 0}${hovered ? 1 : 0}${masked ? 1 : 0}:${u}`;
    if (force || areaKey !== v.drawnArea) {
      v.drawnArea = areaKey;
      drawArea(v.area.clear(), p.pos, r, u, color, e.state, masked);
    }

    // Icône (écran)
    v.icon.position.set(p.pos.x, p.pos.y);
    v.disk.tint = color;
    const icon = PORTAL_ICONS.some((i) => i.value === p.icon) ? p.icon! : 'portal';
    if (v.glyph.context !== ctxs.glyphs[icon]) v.glyph.context = ctxs.glyphs[icon];
    // Anneau de sélection, estompé au survol
    v.ring.visible = selected || hovered;
    v.ring.alpha = selected ? 1 : 0.45;
    v.link.visible = gm && !!p.linkedPortalId;
    v.auto.visible = p.auto;
    v.hidden.visible = masked;

    this.drawLabel(v, p, selected, theme);
  }

  /** Nom, sur sa pastille (refait seulement s'il change). */
  private drawLabel(v: PortalVisual, p: PortalData, selected: boolean, theme: MapTheme) {
    const text = portalLabel(p);
    const labelKey = `${text}:${selected ? 1 : 0}`;
    if (labelKey === v.drawnLabel) return;
    v.drawnLabel = labelKey;
    v.label.text = text;
    const w = v.label.width + 12;
    const h = v.label.height + 4;
    const top = PORTAL_ICON_PX + 5;
    v.plate
      .clear()
      .roundRect(-w / 2, top, w, h, h / 2)
      .fill({ color: theme.background, alpha: 0.85 })
      .stroke({ width: 1, color: selected ? theme.primary : theme.muted, alpha: 0.8 });
    v.label.position.set(0, top + 2);
  }

  private iconContexts(): IconContexts | null {
    if (this.contexts) return this.contexts;
    const pixi = this.engine.pixi;
    const theme = this.engine.theme;
    if (!pixi || !theme) return null;
    const make = (fn: (c: GraphicsContext, t: MapTheme) => void) => {
      const c = new pixi.GraphicsContext();
      fn(c, theme);
      return c;
    };
    const R = PORTAL_ICON_PX;
    const B = BADGE_OFFSET;
    const glyph = (icon: MapPortalIcon) => make((c) => drawGlyph(c, icon, (R * 0.62) / GLYPH_HALF));
    this.contexts = {
      shadow: make((c) => c.circle(0.6, 1.4, R + 1).fill({ color: 0x000000, alpha: 0.35 })),
      // Blanc : teinté de la couleur du portail
      disk: make((c) => c.circle(0, 0, R).fill({ color: 0xffffff })),
      rim: make((c) => c.circle(0, 0, R).stroke({ width: 2, color: 0xffffff, alpha: 0.9 })),
      ring: make((c, t) => c.circle(0, 0, R + 4).stroke({ width: 2.5, color: t.primary })),
      // Aller-retour : deux flèches opposées
      link: make((c, t) => {
        c.circle(B, -B, 6).fill({ color: t.background }).stroke({ width: 1, color: t.primary });
        c.moveTo(B - 3, -B - 1.5)
          .lineTo(B + 3, -B - 1.5)
          .moveTo(B + 1.5, -B - 3)
          .lineTo(B + 3, -B - 1.5)
          .lineTo(B + 1.5, -B)
          .moveTo(B + 3, -B + 1.5)
          .lineTo(B - 3, -B + 1.5)
          .moveTo(B - 1.5, -B)
          .lineTo(B - 3, -B + 1.5)
          .lineTo(B - 1.5, -B + 3)
          .stroke({ width: 1.2, color: t.primary, cap: 'round', join: 'round' });
      }),
      // Automatique : un éclair
      auto: make((c, t) => {
        c.circle(B, B, 6).fill({ color: t.primary }).stroke({ width: 1, color: t.background });
        c.poly(
          [
            B + 1,
            B - 4,
            B - 2.5,
            B + 0.8,
            B - 0.2,
            B + 0.8,
            B - 1,
            B + 4,
            B + 2.5,
            B - 0.8,
            B + 0.2,
            B - 0.8,
          ],
          true,
        ).fill({
          color: t.background,
        });
      }),
      glyphs: {
        portal: glyph('portal'),
        stairs: glyph('stairs'),
        door: glyph('door'),
        ladder: glyph('ladder'),
      },
    };
    return this.contexts;
  }
}
