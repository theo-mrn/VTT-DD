/**
 * Sorte `light` (docs/carte.md § 10, Lumières) : un point, un rayon en unités, une couleur, une
 * intensité, un dégradé, allumée ou éteinte, éventuellement attachée à un token (torche).
 *
 * - Réservée à l'outil lumières (`editTool`, L).
 * - Dessin MJ (plan `gm`) : icône à taille constante, teintée de la couleur de la lumière, et
 *   cercle de son rayon (tirets pour la limite du plein éclairage, `falloff`). L'éclairage
 *   lui-même (ce que voient les joueurs) est celui du module vision.
 * - Attachée : elle suit le token à chaque image où il bouge (aperçu du glisser et direct
 *   compris) ; elle ne se déplace pas seule.
 * - Éteinte : le serveur ne l'envoie pas aux joueurs ; son direct reste chez le MJ.
 */
import { translate } from '@/i18n/runtime';
import { Lightbulb, LightbulbOff, Link2, Link2Off, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import {
  isGm,
  type EntityAction,
  type EntityKind,
  type MapTheme,
  type MapViewer,
  type MenuItem,
} from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { updateCommand, type Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import {
  OverlayRedraw,
  dashedCircle,
  dataColor,
} from '@/lib/map/features/obstacles/engine/overlay';
import {
  LIGHT_KIND,
  LIGHTS,
  LIGHTS_TOOL_ID,
  lightPosition,
  TOKEN_KIND,
  tokenName,
  type LightData,
} from './model';

/** Rayon de l'icône, en pixels d'écran. */
export const LIGHT_ICON_PX = 11;

const lightOf = (e: MapEntity) => e.data as LightData;

export interface LightContext {
  engine: MapEngine;
  persistence: Persistence<MapDto>;
}

/** Modifie des lumières : une commande. */
export function patchLights(
  ctx: LightContext,
  entities: readonly MapEntity[],
  patch: (l: LightData) => Partial<LightData>,
  label: string,
) {
  const changes = entities.flatMap((e) => {
    const before = lightOf(e);
    const p = patch(before);
    const changed = Object.entries(p).some(
      ([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v),
    );
    return changed ? [{ before: before as MapDto, after: { ...before, ...p } as MapDto }] : [];
  });
  if (!changes.length) return null;
  return ctx.engine.execute(
    updateCommand({ label, collection: LIGHTS, persistence: ctx.persistence, changes }),
  );
}

interface LightVisual {
  area: Graphics;
  icon: Container;
  base: Graphics;
  glyph: Graphics;
  link: Graphics;
  unregister: () => void;
}

interface IconContexts {
  base: GraphicsContext;
  selected: GraphicsContext;
  on: GraphicsContext;
  off: GraphicsContext;
  link: GraphicsContext;
}

/** Lumière allumée : disque, anneau et, s'il se voit, le début de l'atténuation en tirets. */
function drawLitArea(
  g: Graphics,
  l: LightData,
  r: number,
  u: number,
  color: number,
  state: { selected: boolean; hovered: boolean },
) {
  const c = l.pos;
  g.circle(c.x, c.y, r).fill({ color, alpha: 0.05 + 0.08 * l.intensity });
  g.circle(c.x, c.y, r).stroke({
    width: (state.selected ? 2.5 : 1.5) * u,
    color,
    alpha: state.selected || state.hovered ? 0.95 : 0.7,
  });
  const inner = r * (1 - Math.max(0, Math.min(1, l.falloff)));
  if (inner > 4 * u && inner < r - 4 * u) {
    dashedCircle(g, c.x, c.y, inner, 5 * u, 5 * u);
    g.stroke({ width: u, color, alpha: 0.6 });
  }
}

/** Dessin des lumières (MJ) : icône partagée et teintée, cercle du rayon. */
export class LightView {
  private readonly redraw: OverlayRedraw;
  private contexts: IconContexts | null = null;
  /** Rayon affiché pendant la poignée de rayon (unités). */
  private radiusPreview: { id: string; radius: number } | null = null;
  private readonly entities = new Map<string, MapEntity>();

  constructor(private readonly engine: MapEngine) {
    this.redraw = new OverlayRedraw(engine, (e) => this.draw(e));
  }

  dispose() {
    this.redraw.dispose();
    const c = this.contexts;
    this.contexts = null;
    if (c) for (const ctx of Object.values(c)) ctx.destroy();
    this.entities.clear();
  }

  /** Rayon affiché (aperçu de la poignée, sinon la donnée), en unités. */
  radiusOf(e: MapEntity): number {
    return this.radiusPreview?.id === e.id ? this.radiusPreview.radius : lightOf(e).radius;
  }

  setRadiusPreview(preview: { id: string; radius: number } | null) {
    const before = this.radiusPreview?.id;
    this.radiusPreview = preview;
    for (const id of new Set([before, preview?.id])) {
      const e = id ? this.entities.get(id) : undefined;
      if (e) this.draw(e);
    }
    this.engine.invalidate();
  }

  mount(e: MapEntity) {
    const pixi = this.engine.pixi;
    const ctxs = this.iconContexts();
    if (!pixi || !e.display || !ctxs) return;
    const area = new pixi.Graphics({ label: 'light-area' });
    const icon = new pixi.Container({ label: 'light-icon' });
    const base = new pixi.Graphics(ctxs.base);
    const glyph = new pixi.Graphics(ctxs.on);
    const link = new pixi.Graphics(ctxs.link);
    icon.addChild(base, glyph, link);
    e.display.addChild(area, icon);
    const unregister = this.engine.screenSpace.add(icon);
    e.renderState.light = { area, icon, base, glyph, link, unregister } satisfies LightVisual;
    this.entities.set(e.id, e);
    this.redraw.track(e);
    this.draw(e);
  }

  unmount(e: MapEntity) {
    // Cercle et icône sont des enfants de `e.display` : le moteur les libère avec lui
    // (`destroyDisplay` : le cercle propre libéré, les dessins partagés de l'icône gardés)
    (e.renderState.light as LightVisual | undefined)?.unregister();
    this.redraw.untrack(e);
    this.entities.delete(e.id);
    e.renderState = {};
  }

  draw(e: MapEntity) {
    const v = e.renderState.light as LightVisual | undefined;
    const theme = this.engine.theme;
    const pixi = this.engine.pixi;
    const ctxs = this.iconContexts();
    if (!v || !theme || !pixi || !ctxs) return;
    const gm = isGm(this.engine.viewer);
    v.area.visible = gm;
    v.icon.visible = gm;
    if (!gm) return;
    const l = lightOf(e);
    // Dessin à la position de la donnée : le moteur translate le conteneur vers la position
    // affichée (aperçu d'un glisser, token suivi)
    const c = l.pos;
    const u = this.redraw.unit;
    const r = this.radiusOf(e) * this.engine.kindContext().pixelsPerUnit;
    const color = dataColor(pixi, l.color, theme.primary);
    const g = v.area;
    g.clear();
    if (l.visible) drawLitArea(g, l, r, u, color, e.state);
    else {
      dashedCircle(g, c.x, c.y, r, 6 * u, 6 * u);
      g.stroke({ width: 1.25 * u, color: theme.muted, alpha: 0.8 });
    }
    v.icon.position.set(c.x, c.y);
    v.base.context = e.state.selected ? ctxs.selected : ctxs.base;
    v.glyph.context = l.visible ? ctxs.on : ctxs.off;
    v.glyph.tint = l.visible ? color : theme.muted;
    v.link.visible = !!l.attachedTokenId;
    v.glyph.scale.set(e.state.hovered ? 1.15 : 1);
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
    const R = LIGHT_ICON_PX;
    this.contexts = {
      base: make((c, t) =>
        c
          .circle(0, 0, R)
          .fill({ color: t.background, alpha: 0.9 })
          .stroke({ width: 1.5, color: t.muted }),
      ),
      selected: make((c, t) =>
        c
          .circle(0, 0, R + 3)
          .stroke({ width: 2, color: t.primary })
          .circle(0, 0, R)
          .fill({ color: t.background, alpha: 0.9 })
          .stroke({ width: 1.5, color: t.primary }),
      ),
      // Blanc : teinté de la couleur de la lumière
      on: make((c) => {
        c.circle(0, 0, 4.5).fill({ color: 0xffffff });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.moveTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5).lineTo(
            Math.cos(a) * 8.5,
            Math.sin(a) * 8.5,
          );
        }
        c.stroke({ width: 1.6, color: 0xffffff, cap: 'round' });
      }),
      off: make((c) => {
        c.circle(0, 0, 4.5).stroke({ width: 1.5, color: 0xffffff });
        c.moveTo(-6, 6).lineTo(6, -6).stroke({ width: 1.5, color: 0xffffff, cap: 'round' });
      }),
      link: make((c, t) => {
        c.circle(R - 1, R - 1, 5)
          .fill({ color: t.primary })
          .stroke({ width: 1, color: t.background });
        c.moveTo(R - 3.5, R + 1.5)
          .lineTo(R + 1.5, R - 3.5)
          .stroke({ width: 1.3, color: t.background, cap: 'round' });
      }),
    };
    return this.contexts;
  }
}

const gmStrict = (action: EntityAction, e: MapEntity, viewer: MapViewer) => {
  if (action === 'view') return true;
  if (!isGm(viewer)) return false;
  // Attachée : elle suit son token, elle ne se déplace pas seule
  if (action === 'move') return !lightOf(e).attachedTokenId;
  return true;
};

/** Menu « Attacher à un token ▸ » : les tokens de la carte, l'actuel coché. */
export function attachItems(ctx: LightContext, entities: readonly MapEntity[]): MenuItem[] {
  const { engine } = ctx;
  const tokens = engine.entitiesOfKind(TOKEN_KIND);
  const current = entities.length === 1 ? lightOf(entities[0]!).attachedTokenId : null;
  const items: MenuItem[] = [
    {
      id: 'light:attach',
      label: translate('map.lights.attachToToken'),
      icon: Link2,
      disabled: !tokens.length,
      children: tokens
        .map((t) => ({ id: t.id, name: tokenName(engine, t.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((t) => ({
          id: `light:attach:${t.id}`,
          label: t.name,
          checked: current === t.id,
          run: () =>
            void patchLights(
              ctx,
              entities,
              () => ({ attachedTokenId: t.id }),
              translate('map.lights.attach'),
            ),
        })),
    },
  ];
  if (entities.some((e) => lightOf(e).attachedTokenId))
    items.push({
      id: 'light:detach',
      label: translate('map.lights.detachFromToken'),
      icon: Link2Off,
      run: () =>
        void patchLights(
          ctx,
          entities,
          (l) => ({ attachedTokenId: null, pos: roundPoint(lightPosition(engine, l)) }),
          translate('map.lights.detach'),
        ),
    });
  return items;
}

/**
 * Menu d'un token qui porte une lumière (MJ) : son icône est sur le token, un clic prend le
 * token. « Lumière portée ▸ » : éteindre ou allumer, réglages, détacher, retirer.
 */
export function carriedLightItems(
  ctx: LightContext,
  entities: readonly MapEntity[],
  viewer: MapViewer,
): MenuItem[] {
  if (!isGm(viewer) || !entities.length || entities.some((e) => e.kind.id !== TOKEN_KIND))
    return [];
  const { engine } = ctx;
  const ids = new Set(entities.map((e) => e.id));
  const lights = engine.entitiesOfKind(LIGHT_KIND).filter((l) => {
    const to = lightOf(l).attachedTokenId;
    return to !== null && ids.has(to);
  });
  if (!lights.length) return [];
  const allOn = lights.every((l) => lightOf(l).visible);
  return [
    {
      id: 'light:carried',
      label:
        lights.length > 1 ? translate('map.lights.carriedMany') : translate('map.lights.carried'),
      icon: Lightbulb,
      children: [
        {
          id: 'light:carried:toggle',
          label: allOn ? translate('map.lights.turnOff') : translate('map.lights.turnOn'),
          icon: allOn ? LightbulbOff : Lightbulb,
          run: () =>
            void patchLights(
              ctx,
              lights,
              () => ({ visible: !allOn }),
              allOn ? translate('map.lights.turnOffLight') : translate('map.lights.turnOnLight'),
            ),
        },
        {
          id: 'light:carried:settings',
          label: translate('map.lights.settings'),
          icon: SlidersHorizontal,
          run: () => engine.openInspector(lights.map((l) => l.id)),
        },
        {
          id: 'light:carried:detach',
          label: translate('map.lights.detachFromToken'),
          icon: Link2Off,
          run: () =>
            void patchLights(
              ctx,
              lights,
              (l) => ({ attachedTokenId: null, pos: roundPoint(lightPosition(engine, l)) }),
              translate('map.lights.detach'),
            ),
        },
        {
          id: 'light:carried:remove',
          label:
            lights.length > 1 ? translate('map.lights.removeMany') : translate('map.lights.remove'),
          icon: Trash2,
          danger: true,
          run: () => void engine.deleteEntities(lights),
        },
      ],
    },
  ];
}

const roundPoint = (p: Point): Point => ({
  x: Math.round(p.x * 100) / 100,
  y: Math.round(p.y * 100) / 100,
});

export function lightKind(ctx: LightContext, view: LightView): EntityKind<MapDto> {
  const { engine } = ctx;
  return {
    id: LIGHT_KIND,
    label: translate('map.lights.light'),
    collection: LIGHTS,
    capabilities: ['select', 'move', 'delete', 'inspect', 'duplicate'],
    plane: 'gm',
    display: 'lights',
    editTool: LIGHTS_TOOL_ID,
    pickOutsideTool: true,
    selfOutline: true,
    transformDisplay: false,
    geometry: (l) => {
      const d = l as LightData;
      return { x: d.pos.x, y: d.pos.y, width: 0, height: 0, rotation: 0 };
    },
    applyGeometry: (l, g) => ({ ...(l as LightData), pos: roundPoint(g) }),
    name: (l) => (l as LightData).name?.trim() || translate('map.lights.light'),
    can: gmStrict,
    hitTest: (e, p, tol) =>
      Math.hypot(p.x - e.current.x, p.y - e.current.y) <= LIGHT_ICON_PX / engine.camera.zoom + tol,
    bounds: (e) => {
      const r = Math.max(view.radiusOf(e) * engine.kindContext().pixelsPerUnit, 48);
      return { x: e.current.x - r, y: e.current.y - r, width: 2 * r, height: 2 * r };
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities) => {
      if (!isGm(engine.viewer)) return [];
      const allOn = entities.every((e) => lightOf(e).visible);
      return [
        {
          id: 'light:toggle',
          label: allOn ? translate('map.lights.turnOff') : translate('map.lights.turnOn'),
          icon: allOn ? LightbulbOff : Lightbulb,
          run: () =>
            void patchLights(
              ctx,
              entities,
              () => ({ visible: !allOn }),
              allOn ? translate('map.lights.turnOffLight') : translate('map.lights.turnOnLight'),
            ),
        },
        ...attachItems(ctx, entities),
      ];
    },
    duplicate: (l, offset) => {
      const d = l as LightData;
      const p = lightPosition(engine, d);
      return {
        ...d,
        attachedTokenId: null,
        pos: roundPoint({ x: p.x + offset.x, y: p.y + offset.y }),
      };
    },
    // Éteinte : jamais envoyée aux joueurs, son direct non plus
    liveAudience: (e) => (lightOf(e).visible ? 'public' : 'gm'),
    persistence: ctx.persistence as never,
  };
}

/** Lumières attachées de la couche ; une lumière détachée ou supprimée revient à sa place. */
function collectAttached(
  engine: MapEngine,
  lights: ReadonlyMap<string, MapDto> | undefined,
  attached: MapEntity[],
  followed: Set<MapEntity>,
) {
  attached.length = 0;
  for (const [id, l] of lights ?? []) {
    if (!(l as LightData).attachedTokenId) continue;
    const e = engine.entity(id);
    if (e) attached.push(e);
  }
  // Détachée ou supprimée : elle revient à sa propre position
  for (const e of followed)
    if (!attached.includes(e)) {
      followed.delete(e);
      if (engine.entity(e.id) === e) engine.setPreview(e, null);
    }
}

/** Lumière placée sur son token (aperçu), ou rendue à sa position s'il a disparu. */
function followToken(engine: MapEngine, e: MapEntity, followed: Set<MapEntity>) {
  const token = engine.entity(lightOf(e).attachedTokenId!);
  if (!token) {
    if (followed.delete(e)) engine.setPreview(e, null);
    return;
  }
  const { x, y } = token.current;
  if (e.current.x === x && e.current.y === y) return;
  const home = x === e.geometry.x && y === e.geometry.y;
  engine.setPreview(e, home ? null : { ...e.geometry, x, y });
  if (home) followed.delete(e);
  else followed.add(e);
}

/**
 * Lumières attachées : à chaque image, elles se placent sur leur token (géométrie affichée :
 * glisser local et direct compris). La liste des lumières attachées n'est refaite que quand la
 * couche change : une image sans changement ne parcourt qu'elles, sans rien allouer. Renvoie le
 * nettoyage.
 */
export function followTokens(engine: MapEngine): () => void {
  let source: unknown = undefined;
  const attached: MapEntity[] = [];
  const followed = new Set<MapEntity>();
  return engine.onFrame(() => {
    const lights = engine.store.getState().collections[LIGHTS];
    if (lights !== source) {
      source = lights;
      collectAttached(engine, lights, attached, followed);
    }
    for (const e of attached) followToken(engine, e, followed);
    return false;
  });
}
