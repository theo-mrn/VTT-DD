/**
 * Sorte `sound-zone` (docs/carte.md § 10, Zones sonores) : un cercle, un son de la bibliothèque,
 * un volume, lancée ou arrêtée.
 *
 * - Réservée à l'outil Zones sonores (`editTool`, F), touchable hors de lui en dernier recours.
 * - Dessin MJ (plan `gm`, famille `music`) : disque teinté et cercle du rayon, icône de note à
 *   taille constante ; tirets et icône grisée si la zone est arrêtée ou sans son. Les joueurs
 *   ne voient rien : ils l'entendent (`MapSounds`).
 * - Arrêtée : le serveur ne l'envoie pas aux joueurs.
 */
import { translate } from '@/i18n/runtime';
import { Play, Square } from 'lucide-react';
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
import { createCommand, updateCommand, type Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import {
  OverlayRedraw,
  dashedCircle,
  dataColor,
} from '@/lib/map/features/obstacles/engine/overlay';
import { snapToCellCenter } from '@/lib/map/engine/interaction/snapping';
import {
  SOUND_ZONE_KIND,
  SOUND_ZONES,
  soundZoneDraft,
  SOUNDS_TOOL_ID,
  type SoundZoneData,
} from './model';

/** Rayon de l'icône, en pixels d'écran. */
export const SOUND_ICON_PX = 11;

export const zoneOf = (e: MapEntity) => e.data as SoundZoneData;

/** La zone a-t-elle un son à jouer ? */
export const hasSound = (z: Pick<SoundZoneData, 'assetId' | 'url'>) => !!(z.assetId || z.url);

export interface SoundContext {
  engine: MapEngine;
  persistence: Persistence<MapDto>;
}

/** Modifie des zones : une commande. */
export function patchZones(
  ctx: SoundContext,
  entities: readonly MapEntity[],
  patch: (z: SoundZoneData) => Partial<SoundZoneData>,
  label: string,
) {
  const changes = entities.flatMap((e) => {
    const before = zoneOf(e);
    const p = patch(before);
    const changed = Object.entries(p).some(
      ([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v),
    );
    return changed ? [{ before: before as MapDto, after: { ...before, ...p } as MapDto }] : [];
  });
  if (!changes.length) return null;
  return ctx.engine.execute(
    updateCommand({ label, collection: SOUND_ZONES, persistence: ctx.persistence, changes }),
  );
}

/**
 * Pose une zone (une commande) au point, aimanté au centre de la case sauf `free` ; la
 * sélectionne et renvoie son id provisoire.
 */
export function placeZone(
  ctx: SoundContext,
  at: Point,
  o: { radius: number; volume: number; assetId: string | null; name: string; free?: boolean },
): string {
  const { engine } = ctx;
  const grid = engine.snapGrid(o.free ?? false);
  const p = grid ? snapToCellCenter(at, grid) : at;
  const draft = soundZoneDraft(engine.store.getState().mapId, p, {
    radiusPx: o.radius * (engine.kindContext().pixelsPerUnit || 50),
    volume: o.volume,
    assetId: o.assetId,
    name: o.name,
  });
  void engine.execute(
    createCommand({
      label: translate('map.sounds.place'),
      collection: SOUND_ZONES,
      persistence: ctx.persistence,
      items: [draft],
    }),
  );
  engine.selection.replace([draft.id]);
  return draft.id;
}

/** Lancer ou arrêter des zones. */
export function toggleItem(ctx: SoundContext, entities: readonly MapEntity[]): MenuItem {
  const allOn = entities.every((e) => zoneOf(e).active);
  return {
    id: 'sound:toggle',
    label: allOn ? translate('map.sounds.stopShort') : translate('map.sounds.startShort'),
    icon: allOn ? Square : Play,
    primary: true,
    run: () =>
      void patchZones(
        ctx,
        entities,
        () => ({ active: !allOn }),
        allOn ? translate('map.sounds.stop') : translate('map.sounds.start'),
      ),
  };
}

interface SoundVisual {
  area: Graphics;
  icon: Container;
  base: Graphics;
  glyph: Graphics;
  unregister: () => void;
}

interface IconContexts {
  base: GraphicsContext;
  selected: GraphicsContext;
  on: GraphicsContext;
  off: GraphicsContext;
}

/** Dessin des zones (MJ) : icône partagée et teintée, disque et cercle du rayon. */
export class SoundZoneView {
  private readonly redraw: OverlayRedraw;
  private contexts: IconContexts | null = null;
  /** Rayon affiché pendant la poignée de rayon (pixels du monde). */
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

  /** Rayon affiché (aperçu de la poignée, sinon la donnée), en pixels du monde. */
  radiusOf(e: MapEntity): number {
    return this.radiusPreview?.id === e.id ? this.radiusPreview.radius : zoneOf(e).radius;
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
    const area = new pixi.Graphics({ label: 'sound-area' });
    const icon = new pixi.Container({ label: 'sound-icon' });
    const base = new pixi.Graphics(ctxs.base);
    const glyph = new pixi.Graphics(ctxs.on);
    icon.addChild(base, glyph);
    e.display.addChild(area, icon);
    const unregister = this.engine.screenSpace.add(icon);
    e.renderState.sound = { area, icon, base, glyph, unregister } satisfies SoundVisual;
    this.entities.set(e.id, e);
    this.redraw.track(e);
    this.draw(e);
  }

  unmount(e: MapEntity) {
    (e.renderState.sound as SoundVisual | undefined)?.unregister();
    this.redraw.untrack(e);
    this.entities.delete(e.id);
    e.renderState = {};
  }

  draw(e: MapEntity) {
    const v = e.renderState.sound as SoundVisual | undefined;
    const theme = this.engine.theme;
    const pixi = this.engine.pixi;
    const ctxs = this.iconContexts();
    if (!v || !theme || !pixi || !ctxs) return;
    const gm = isGm(this.engine.viewer);
    v.area.visible = gm;
    v.icon.visible = gm;
    if (!gm) return;
    const z = zoneOf(e);
    // Dessin à la position de la donnée : le moteur translate le conteneur (aperçu d'un glisser)
    const c = z.pos;
    const u = this.redraw.unit;
    const r = this.radiusOf(e);
    const on = z.active && hasSound(z);
    const color = dataColor(pixi, z.color, theme.primary);
    const g = v.area;
    g.clear();
    if (on) {
      g.circle(c.x, c.y, r).fill({ color, alpha: 0.04 + 0.08 * z.volume });
      g.circle(c.x, c.y, r).stroke({
        width: (e.state.selected ? 2.5 : 1.5) * u,
        color,
        alpha: e.state.selected || e.state.hovered ? 0.95 : 0.7,
      });
    } else {
      dashedCircle(g, c.x, c.y, r, 6 * u, 6 * u);
      g.stroke({ width: 1.25 * u, color: theme.muted, alpha: 0.8 });
    }
    v.icon.position.set(c.x, c.y);
    v.base.context = e.state.selected ? ctxs.selected : ctxs.base;
    v.glyph.context = on ? ctxs.on : ctxs.off;
    v.glyph.tint = on ? color : theme.muted;
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
    const R = SOUND_ICON_PX;
    // Croche : tête, hampe, crochet (blanc : teintée de la couleur de la zone)
    const note = (c: GraphicsContext) => {
      c.ellipse(-2, 4.5, 3, 2.3).fill({ color: 0xffffff });
      c.moveTo(0.8, 4.2).lineTo(0.8, -6.5).quadraticCurveTo(1.5, -3, 5, -2);
      c.stroke({ width: 1.6, color: 0xffffff, cap: 'round', join: 'round' });
    };
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
      on: make((c) => note(c)),
      off: make((c) => {
        note(c);
        c.moveTo(-6, 6).lineTo(6, -6).stroke({ width: 1.5, color: 0xffffff, cap: 'round' });
      }),
    };
    return this.contexts;
  }
}

const gmOnly = (action: EntityAction, _e: MapEntity, viewer: MapViewer) =>
  action === 'view' || isGm(viewer);

const roundPoint = (p: Point): Point => ({
  x: Math.round(p.x * 100) / 100,
  y: Math.round(p.y * 100) / 100,
});

export function soundZoneKind(ctx: SoundContext, view: SoundZoneView): EntityKind<MapDto> {
  const { engine } = ctx;
  return {
    id: SOUND_ZONE_KIND,
    label: translate('map.sounds.zone'),
    collection: SOUND_ZONES,
    capabilities: ['select', 'move', 'delete', 'inspect', 'duplicate'],
    plane: 'gm',
    display: 'music',
    editTool: SOUNDS_TOOL_ID,
    pickOutsideTool: true,
    selfOutline: true,
    transformDisplay: false,
    geometry: (z) => {
      const d = z as SoundZoneData;
      return { x: d.pos.x, y: d.pos.y, width: 0, height: 0, rotation: 0 };
    },
    applyGeometry: (z, g) => ({ ...(z as SoundZoneData), pos: roundPoint(g) }),
    name: (z) => (z as SoundZoneData).name?.trim() || translate('map.sounds.zone'),
    can: gmOnly,
    hitTest: (e, p, tol) =>
      isGm(engine.viewer) &&
      Math.hypot(p.x - e.current.x, p.y - e.current.y) <= SOUND_ICON_PX / engine.camera.zoom + tol,
    bounds: (e) => {
      const r = Math.max(view.radiusOf(e), 48);
      return { x: e.current.x - r, y: e.current.y - r, width: 2 * r, height: 2 * r };
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities) => (isGm(engine.viewer) ? [toggleItem(ctx, entities)] : []),
    duplicate: (z, offset) => {
      const d = z as SoundZoneData;
      return { ...d, pos: roundPoint({ x: d.pos.x + offset.x, y: d.pos.y + offset.y }) };
    },
    // Arrêtée : jamais envoyée aux joueurs, son direct non plus
    liveAudience: (e) => (zoneOf(e).active ? 'public' : 'gm'),
    persistence: ctx.persistence as never,
  };
}
