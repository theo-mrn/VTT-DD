/**
 * Outil portails (X, MJ) (docs/carte.md § 10, Portails) : une machine à états, testée sans rendu.
 *
 * | État          | Entrée                                                        | Sortie                                                   |
 * | ------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
 * | `idle`        | poignée de rayon → `radius` ; poignée d'arrivée → `arrival`   | portail : gestes communs (`select`) ; vide → `pressing`  |
 * | `pressing`    | +4 px : gestes communs (la vue se déplace ; ⇧ : lasso)        | lâcher : entrée posée (brouillon) → `destination`        |
 * | `destination` | clic sur la carte : arrivée ici ; panneau : une autre scène   | le portail (et son retour) en une commande ; Échap : rien |
 * | `pick`        | « Choisir l'arrivée sur la carte » (inspecteur)               | clic : arrivée du portail (commande) ; Échap : rien      |
 * | `radius`      | rayon par demi-case (Alt : libre), valeur affichée            | lâcher : une commande ; Échap : rien                     |
 * | `arrival`     | glisser l'arrivée d'un portail interne non relié (aimantée)   | lâcher : une commande ; Échap : rien                     |
 * | `select`      | clic, glisser, lasso (gestes communs, portails seulement)     | lâcher                                                   |
 *
 * Entrée et arrivée s'aimantent au centre de la case, comme le glisser commun (Alt : libre).
 * Aller-retour (réglage) : le retour est posé à l'arrivée, relié, en la même commande.
 */
import type { MapPortalIcon } from '@vtt/contracts';
import type { BitmapText, Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import type { Point, Rect } from '../../engine/geometry';
import { exceedsThreshold } from '../../engine/interaction/drag';
import { snapToCellCenter } from '../../engine/interaction/snapping';
import type { MapEngine } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SelectTool } from '../../engine/tools/select-tool';
import { createCommand } from '../../store/commands';
import { dashedCircle, dashedPolyline, dataColor } from '../obstacles/overlay';
import { placeWithRemoteReturn } from './commands';
import { patchPortals, type PortalContext } from './kind';
import {
  DEFAULT_PORTAL,
  PORTAL_ICONS,
  PORTAL_KIND,
  PORTALS,
  PORTALS_TOOL_ID,
  portalDraft,
  radiusFromDistance,
  RADIUS_RANGE,
  roundPoint,
  sceneArrival,
  type PortalData,
  type PortalDefaults,
} from './model';

export type PortalToolState =
  'idle' | 'pressing' | 'destination' | 'pick' | 'radius' | 'arrival' | 'select';

/** Ce que l'interface suit : le panneau « Destination » et le choix de l'arrivée. */
export interface PortalToolUi {
  state: PortalToolState;
  /** Entrée posée, en attente de sa destination (`destination`). */
  entry: Point | null;
  /** Portail dont on choisit l'arrivée sur la carte (`pick`). */
  pickFor: string | null;
}

/** Rayon des poignées, en pixels d'écran. */
export const HANDLE_PX = 8;

const SETTINGS_KEY = 'vtt:map:portals';

const isPortal = (e: MapEntity) => e.kind.id === PORTAL_KIND;
const portalOf = (e: MapEntity) => e.data as PortalData;

/** Réglages gardés dans le navigateur (lus prudemment : une valeur inconnue revient au défaut). */
function readSettings(): PortalDefaults {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? 'null') as Partial<
      Record<keyof PortalDefaults, unknown>
    > | null;
    if (!raw) return { ...DEFAULT_PORTAL };
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    const radius = Number(raw.radius);
    return {
      icon: PORTAL_ICONS.some((i) => i.value === raw.icon)
        ? (raw.icon as MapPortalIcon)
        : DEFAULT_PORTAL.icon,
      color:
        typeof raw.color === 'string' && raw.color.length <= 50 ? raw.color : DEFAULT_PORTAL.color,
      radius:
        radius >= RADIUS_RANGE.min && radius <= RADIUS_RANGE.max ? radius : DEFAULT_PORTAL.radius,
      twoWay: bool(raw.twoWay, DEFAULT_PORTAL.twoWay),
      auto: bool(raw.auto, DEFAULT_PORTAL.auto),
      visible: bool(raw.visible, DEFAULT_PORTAL.visible),
    };
  } catch {
    return { ...DEFAULT_PORTAL };
  }
}

export class PortalTool implements Tool {
  readonly id = PORTALS_TOOL_ID;
  readonly settings: StoreApi<PortalDefaults>;
  readonly ui: StoreApi<PortalToolUi> = createStore<PortalToolUi>()(() => ({
    state: 'idle',
    entry: null,
    pickFor: null,
  }));
  private readonly select = new SelectTool();
  private press: MapPointer | null = null;
  /** Dernier point du pointeur (aperçu de la destination). */
  private pointer: Point | null = null;
  /** Poignée de rayon en cours : portail et rayon affiché (pixels du monde). */
  radiusDrag: { entity: MapEntity; radius: number; units: number } | null = null;
  /** Poignée d'arrivée en cours : portail et arrivée affichée. */
  arrivalDrag: { entity: MapEntity; target: Point } | null = null;
  private hoverHandle: 'radius' | 'arrival' | null = null;

  constructor(
    private readonly ctx: PortalContext,
    opts: { settings?: PortalDefaults } = {},
  ) {
    this.settings = createStore<PortalDefaults>()(() => opts.settings ?? readSettings());
    this.settings.subscribe((s) => {
      try {
        globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch {
        // Stockage indisponible (navigation privée) : réglages gardés pour la session
      }
    });
  }

  get state(): PortalToolState {
    return this.ui.getState().state;
  }

  private setState(state: PortalToolState, extra: Partial<PortalToolUi> = {}) {
    this.ui.setState({ state, ...extra });
  }

  targets(e: MapEntity): boolean {
    return isPortal(e);
  }

  cursor(engine: MapEngine): string | null {
    const state = this.state;
    if (state === 'radius') return 'ew-resize';
    if (state === 'arrival') return 'grabbing';
    if (state === 'destination' || state === 'pick') return 'crosshair';
    if (state === 'select') return this.select.cursor(engine);
    if (this.hoverHandle === 'radius') return 'ew-resize';
    if (this.hoverHandle === 'arrival') return 'grab';
    return engine.hovered ? engine.hoverCursor() : 'crosshair';
  }

  activate(engine: MapEngine) {
    const keep = engine.selectedEntities().filter(isPortal);
    if (keep.length !== engine.selection.size) engine.selection.replace(keep.map((e) => e.id));
    engine.invalidate();
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    this.select.deactivate(engine);
    const portals = engine.selectedEntities().filter(isPortal);
    if (portals.length) engine.selection.remove(portals.map((e) => e.id));
    this.hoverHandle = null;
    if (this.root) this.root.visible = false;
    this.drawn.ui = null;
    engine.invalidate();
  }

  // ─── Poignées ──────────────────────────────────────────────────────────────

  /** Portail seul sélectionné (touchable par le MJ). */
  private single(engine: MapEngine): MapEntity | null {
    if (engine.selection.size !== 1) return null;
    const e = engine.entity(engine.selection.ids[0]!);
    return e && isPortal(e) && e.kind.can('move', e, engine.viewer) ? e : null;
  }

  /** Poignée de rayon : à l'est de la zone du portail seul sélectionné. */
  radiusHandle(engine: MapEngine): { entity: MapEntity; at: Point } | null {
    const e = this.single(engine);
    if (!e) return null;
    const r = this.ctx.view.radiusOf(e);
    return { entity: e, at: { x: e.current.x + r, y: e.current.y } };
  }

  /** Poignée d'arrivée : l'arrivée d'un portail interne non relié (relié : son retour la porte). */
  arrivalHandle(engine: MapEngine): { entity: MapEntity; at: Point } | null {
    const e = this.single(engine);
    if (!e) return null;
    const p = portalOf(e);
    if (p.kind !== 'same_map' || !p.target || p.linkedPortalId) return null;
    const at = this.arrivalDrag?.entity === e ? this.arrivalDrag.target : p.target;
    return { entity: e, at };
  }

  private handleAt(engine: MapEngine, world: Point): 'radius' | 'arrival' | null {
    const tol = engine.camera.screenToWorldLength(HANDLE_PX + 2);
    const near = (h: { at: Point } | null) =>
      !!h && Math.hypot(world.x - h.at.x, world.y - h.at.y) <= tol;
    if (near(this.arrivalHandle(engine))) return 'arrival';
    if (near(this.radiusHandle(engine))) return 'radius';
    return null;
  }

  /** Point aimanté au centre de la case (Alt : libre). */
  private snapped(engine: MapEngine, e: MapPointer): Point {
    const grid = engine.snapGrid(e.alt);
    return roundPoint(grid ? snapToCellCenter(e.world, grid) : e.world);
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    const state = this.state;
    if (state === 'destination') {
      this.placeHere(engine, this.snapped(engine, e));
      return true;
    }
    if (state === 'pick') {
      this.pickArrival(engine, this.snapped(engine, e));
      return true;
    }
    const handle = this.handleAt(engine, e.world);
    if (handle === 'radius') {
      const h = this.radiusHandle(engine)!;
      const radius = portalOf(h.entity).radius;
      const ppu = engine.kindContext().pixelsPerUnit;
      this.radiusDrag = { entity: h.entity, radius, units: radius / ppu };
      this.setState('radius');
      engine.setHovered(null);
      engine.refreshCursor();
      return true;
    }
    if (handle === 'arrival') {
      const h = this.arrivalHandle(engine)!;
      this.arrivalDrag = { entity: h.entity, target: h.at };
      this.setState('arrival');
      engine.setHovered(null);
      engine.refreshCursor();
      return true;
    }
    if (engine.hitTest(e.world)) {
      this.setState('select');
      return this.select.down(e, engine);
    }
    this.press = e;
    this.setState('pressing');
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    this.pointer = e.world;
    switch (this.state) {
      case 'idle': {
        if (e.buttons !== 0) return;
        const on = this.handleAt(engine, e.world);
        if (on !== this.hoverHandle) {
          this.hoverHandle = on;
          engine.invalidate();
        }
        this.select.move(e, engine);
        engine.refreshCursor();
        return;
      }
      case 'destination':
      case 'pick':
        engine.invalidate();
        return;
      case 'select':
        this.select.move(e, engine);
        return;
      case 'pressing': {
        const press = this.press;
        if (!press || !exceedsThreshold(press.screen, e.screen)) return;
        // Glisser dans le vide : gestes communs (la vue se déplace ; ⇧ : lasso)
        this.setState('select');
        this.press = null;
        this.select.down(press, engine);
        this.select.move(e, engine);
        return;
      }
      case 'radius': {
        const drag = this.radiusDrag;
        if (!drag) return;
        const c = drag.entity.current;
        const ppu = engine.kindContext().pixelsPerUnit;
        drag.units = radiusFromDistance(Math.hypot(e.world.x - c.x, e.world.y - c.y), ppu, e.alt);
        drag.radius = Math.round(drag.units * ppu * 100) / 100;
        this.ctx.view.setRadiusPreview({ id: drag.entity.id, radius: drag.radius });
        engine.invalidate();
        return;
      }
      case 'arrival': {
        if (!this.arrivalDrag) return;
        this.arrivalDrag.target = this.snapped(engine, e);
        engine.invalidate();
        return;
      }
    }
  }

  up(e: MapPointer, engine: MapEngine) {
    const state = this.state;
    switch (state) {
      case 'select':
        this.setState('idle');
        this.select.up(e, engine);
        break;
      case 'pressing':
        this.press = null;
        // L'entrée est posée : reste à choisir où elle mène
        this.setState('destination', { entry: this.snapped(engine, e), pickFor: null });
        engine.selection.clear();
        break;
      case 'radius': {
        this.setState('idle');
        const drag = this.radiusDrag;
        this.radiusDrag = null;
        this.ctx.view.setRadiusPreview(null);
        if (drag && drag.radius !== portalOf(drag.entity).radius)
          void patchPortals(
            this.ctx,
            [drag.entity],
            () => ({ radius: drag.radius }),
            'Rayon du portail',
          );
        break;
      }
      case 'arrival': {
        this.setState('idle');
        const drag = this.arrivalDrag;
        this.arrivalDrag = null;
        if (drag)
          void patchPortals(
            this.ctx,
            [drag.entity],
            () => ({ target: drag.target }),
            'Arrivée du portail',
          );
        break;
      }
      default:
        break;
    }
    engine.refreshCursor();
    engine.invalidate();
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    if (this.state === 'destination' || this.state === 'pick') return true;
    return this.select.doubleClick(e, engine);
  }

  cancel(engine: MapEngine): boolean {
    const state = this.state;
    this.press = null;
    if (state === 'select') {
      this.setState('idle');
      return this.select.cancel(engine);
    }
    if (state === 'radius') {
      this.radiusDrag = null;
      this.ctx.view.setRadiusPreview(null);
    }
    this.arrivalDrag = null;
    this.setState('idle', { entry: null, pickFor: null });
    engine.invalidate();
    return state !== 'idle';
  }

  // ─── Pose ──────────────────────────────────────────────────────────────────

  private defaults() {
    return this.settings.getState();
  }

  /** Arrivée sur cette carte : le portail, et son retour s'il est aller-retour. */
  placeHere(engine: MapEngine, target: Point) {
    const entry = this.ui.getState().entry;
    if (!entry) return;
    const s = engine.store.getState();
    const d = this.defaults();
    const ppu = engine.kindContext().pixelsPerUnit;
    const a = portalDraft(s.mapId, entry, d, ppu, { kind: 'same_map', target });
    const items = [a];
    if (d.twoWay) {
      const b = portalDraft(s.mapId, target, d, ppu, { kind: 'same_map', target: entry });
      a.linkedPortalId = b.id;
      b.linkedPortalId = a.id;
      items.push(b);
    }
    void engine.execute(
      createCommand({
        label: d.twoWay ? 'Poser un portail aller-retour' : 'Poser un portail',
        collection: PORTALS,
        persistence: this.ctx.persistence,
        items,
      }),
    );
    this.setState('idle', { entry: null });
    engine.selection.replace([a.id]);
  }

  /**
   * Vers une autre scène : `target` sur cette scène, nul pour son point d'arrivée des joueurs.
   * Aller-retour : le retour est posé sur la scène visée, à l'arrivée.
   */
  placeToScene(engine: MapEngine, targetMapId: string, target: Point | null) {
    const entry = this.ui.getState().entry;
    if (!entry) return;
    const s = engine.store.getState();
    const d = this.defaults();
    const ppu = engine.kindContext().pixelsPerUnit;
    const a = portalDraft(s.mapId, entry, d, ppu, {
      kind: 'scene_change',
      targetMapId,
      target,
    });
    const scene = this.ctx.scenes().find((x) => x.id === targetMapId);
    const label = d.twoWay ? 'Poser un portail aller-retour' : 'Poser un portail';
    if (d.twoWay && scene) {
      const at = roundPoint(target ?? sceneArrival(scene));
      void engine.execute(
        placeWithRemoteReturn({
          label,
          persistence: this.ctx.persistence,
          api: this.ctx.api,
          entry: a,
          remote: {
            mapId: targetMapId,
            body: {
              pos: at,
              name: a.name,
              icon: a.icon,
              color: a.color,
              radius: a.radius,
              visible: a.visible,
              auto: a.auto,
            },
          },
        }),
      );
    } else
      void engine.execute(
        createCommand({
          label,
          collection: PORTALS,
          persistence: this.ctx.persistence,
          items: [a],
        }),
      );
    this.setState('idle', { entry: null });
    engine.selection.replace([a.id]);
  }

  /** Pose l'entrée sans destination (à régler dans l'inspecteur). */
  placeWithoutDestination(engine: MapEngine) {
    const entry = this.ui.getState().entry;
    if (!entry) return;
    const a = portalDraft(
      engine.store.getState().mapId,
      entry,
      this.defaults(),
      engine.kindContext().pixelsPerUnit,
      null,
    );
    void engine.execute(
      createCommand({
        label: 'Poser un portail',
        collection: PORTALS,
        persistence: this.ctx.persistence,
        items: [a],
      }),
    );
    this.setState('idle', { entry: null });
    engine.selection.replace([a.id]);
    engine.openInspector([a.id]);
  }

  /** Choisir l'arrivée d'un portail existant par un clic sur la carte (inspecteur). */
  startPick(engine: MapEngine, portalId: string) {
    this.cancel(engine);
    this.setState('pick', { pickFor: portalId, entry: null });
    engine.selection.replace([portalId]);
    engine.refreshCursor();
  }

  private pickArrival(engine: MapEngine, target: Point) {
    const id = this.ui.getState().pickFor;
    const e = id ? engine.entity(id) : undefined;
    this.setState('idle', { pickFor: null });
    if (!e) return;
    void patchPortals(
      this.ctx,
      [e],
      () => ({ kind: 'same_map', targetMapId: null, target }),
      'Arrivée du portail',
    );
  }

  // ─── Aperçu ────────────────────────────────────────────────────────────────

  private root: Container | null = null;
  private gfx: Graphics | null = null;
  private label: BitmapText | null = null;
  /** Ce qui est dessiné : rien n'est refait (ni alloué) sans changement. */
  private readonly drawn = {
    ui: null as PortalToolUi | null,
    settings: null as PortalDefaults | null,
    lasso: null as unknown,
    px: Number.NaN,
    py: Number.NaN,
    entity: null as MapEntity | null,
    x: Number.NaN,
    y: Number.NaN,
    radius: Number.NaN,
    arrival: null as Point | null,
    pickX: Number.NaN,
    pickY: Number.NaN,
    hover: null as string | null,
    zoom: Number.NaN,
  };

  renderPreview(layer: Container, rc: RenderContext) {
    this.ensureRoot(layer, rc);
    const engine = this.ctx.engine;
    const ui = this.ui.getState();
    const settings = this.settings.getState();
    const lasso = this.select.lasso;
    const single = this.single(engine);
    const pick = ui.pickFor ? engine.entity(ui.pickFor) : undefined;
    const tracking = ui.state === 'destination' || ui.state === 'pick';
    const p = this.pointer;
    const d = this.drawn;
    // Redessiné seulement si ce qu'il montre a changé
    const arrivalAt = this.arrivalOf(single);
    const px = tracking && p ? p.x : Number.NaN;
    const py = tracking && p ? p.y : Number.NaN;
    const x = single?.current.x ?? Number.NaN;
    const y = single?.current.y ?? Number.NaN;
    const r = single ? this.ctx.view.radiusOf(single) : Number.NaN;
    const pickX = pick?.current.x ?? Number.NaN;
    const pickY = pick?.current.y ?? Number.NaN;
    if (
      d.ui === ui &&
      d.settings === settings &&
      d.lasso === lasso &&
      Object.is(d.px, px) &&
      Object.is(d.py, py) &&
      d.entity === single &&
      Object.is(d.x, x) &&
      Object.is(d.y, y) &&
      Object.is(d.radius, r) &&
      d.arrival === arrivalAt &&
      Object.is(d.pickX, pickX) &&
      Object.is(d.pickY, pickY) &&
      d.hover === this.hoverHandle &&
      d.zoom === rc.zoom
    )
      return;
    d.ui = ui;
    d.settings = settings;
    d.lasso = lasso;
    d.px = px;
    d.py = py;
    d.entity = single;
    d.x = x;
    d.y = y;
    d.radius = r;
    d.arrival = arrivalAt;
    d.pickX = pickX;
    d.pickY = pickY;
    d.hover = this.hoverHandle;
    d.zoom = rc.zoom;
    this.paint(rc, ui, settings, lasso, pick, p);
  }

  /** Conteneur de l'aperçu, créé au premier rendu, dans le plan donné. */
  private ensureRoot(layer: Container, rc: RenderContext) {
    if (!this.root) {
      this.root = new rc.pixi.Container({ label: 'portals-tool' });
      this.gfx = new rc.pixi.Graphics();
      this.label = new rc.pixi.BitmapText({
        text: '',
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fill: rc.theme.foreground,
        },
      });
      this.root.addChild(this.gfx, this.label);
    }
    if (this.root.parent !== layer) layer.addChild(this.root);
    this.root.visible = true;
  }

  /** Arrivée montrée du portail seul sélectionné (celle du glisser en cours d'abord). */
  private arrivalOf(single: MapEntity | null): Point | null {
    if (!single) return null;
    if (this.arrivalDrag?.entity === single) return this.arrivalDrag.target;
    return portalOf(single).target;
  }

  /** Dessine l'aperçu : lasso, entrée posée, choix de l'arrivée, poignées. */
  private paint(
    rc: RenderContext,
    ui: PortalToolUi,
    settings: PortalDefaults,
    lasso: Rect | null,
    pick: MapEntity | undefined,
    p: Point | null,
  ) {
    const engine = this.ctx.engine;
    const radius = this.radiusHandle(engine);
    const arrival = this.arrivalHandle(engine);
    const g = this.gfx!;
    g.clear();
    this.label!.visible = false;
    const u = 1 / rc.zoom;
    const { primary } = rc.theme;
    const color = dataColor(rc.pixi, settings.color, primary);

    if (lasso)
      g.rect(lasso.x, lasso.y, lasso.width, lasso.height)
        .fill({ color: primary, alpha: 0.08 })
        .stroke({ width: u, color: primary, alpha: 0.9 });

    // Entrée posée : sa zone, et la ligne vers l'arrivée sous le pointeur
    if (ui.state === 'destination' && ui.entry)
      drawEntry(g, ui.entry, p, settings.radius * rc.pixelsPerUnit, u, color);
    if (ui.state === 'pick' && pick && p) {
      dashedPolyline(g, [pick.current, p], 8 * u, 6 * u);
      g.stroke({ width: 1.5 * u, color: primary, alpha: 0.9 });
      drawCross(g, p, primary, u);
    }

    if (ui.state !== 'idle' && ui.state !== 'radius' && ui.state !== 'arrival') return;
    if (arrival)
      drawKnob(g, arrival.at, this.state === 'arrival' || this.hoverHandle === 'arrival', u, rc);
    if (radius) this.drawRadiusHandle(g, radius, u, rc);
  }

  /** Poignée du rayon : trait depuis le centre, bouton, rayon en cases sur sa pastille. */
  private drawRadiusHandle(
    g: Graphics,
    radius: { entity: MapEntity; at: Point },
    u: number,
    rc: RenderContext,
  ) {
    const engine = this.ctx.engine;
    const text = this.label!;
    const { primary, background } = rc.theme;
    const c = radius.entity.current;
    g.moveTo(c.x, c.y)
      .lineTo(radius.at.x, radius.at.y)
      .stroke({ width: u, color: primary, alpha: 0.6 });
    drawKnob(g, radius.at, this.state === 'radius' || this.hoverHandle === 'radius', u, rc);
    // Rayon en cases
    const units =
      this.radiusDrag?.units ??
      portalOf(radius.entity).radius / (engine.kindContext().pixelsPerUnit || 50);
    text.text = `${units.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${rc.unitName}`;
    text.visible = true;
    text.scale.set(u);
    text.position.set(radius.at.x + 12 * u, radius.at.y - 8 * u);
    g.roundRect(
      radius.at.x + 8 * u,
      radius.at.y - 10 * u,
      text.width + 8 * u,
      text.height + 4 * u,
      4 * u,
    ).fill({ color: background, alpha: 0.85 });
  }
}

/** Bouton d'une poignée (agrandi quand elle est active). */
function drawKnob(g: Graphics, at: Point, active: boolean, u: number, rc: RenderContext) {
  g.circle(at.x, at.y, (active ? HANDLE_PX + 1 : HANDLE_PX) * u * 0.8)
    .fill({ color: rc.theme.background })
    .stroke({ width: 1.5 * u, color: rc.theme.primary });
}

/** Croix cerclée : l'arrivée sous le pointeur. */
function drawCross(g: Graphics, at: Point, c: number, u: number) {
  const s = 6 * u;
  g.moveTo(at.x - s, at.y - s)
    .lineTo(at.x + s, at.y + s)
    .moveTo(at.x + s, at.y - s)
    .lineTo(at.x - s, at.y + s)
    .stroke({ width: 2 * u, color: c, cap: 'round' });
  g.circle(at.x, at.y, 9 * u).stroke({ width: 1.5 * u, color: c, alpha: 0.9 });
}

/** Entrée posée : sa zone, et la ligne vers l'arrivée sous le pointeur. */
function drawEntry(
  g: Graphics,
  entry: Point,
  p: Point | null,
  r: number,
  u: number,
  color: number,
) {
  g.circle(entry.x, entry.y, r).fill({ color, alpha: 0.12 });
  dashedCircle(g, entry.x, entry.y, r, 6 * u, 5 * u);
  g.stroke({ width: 1.5 * u, color, alpha: 0.9 });
  g.circle(entry.x, entry.y, 10 * u).fill({ color, alpha: 0.9 });
  if (!p) return;
  dashedPolyline(g, [entry, p], 8 * u, 6 * u);
  g.stroke({ width: 1.5 * u, color, alpha: 0.9 });
  drawCross(g, p, color, u);
}
