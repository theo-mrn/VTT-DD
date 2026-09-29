/**
 * Outil Mesurer (Z, docs/carte.md § 10, Mesures) : règle, cône, cercle, carré.
 *
 * Machine à états, testée sans rendu :
 *
 * | État        | Entrée                                                        | Sortie                                                         |
 * | ----------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
 * | `idle`      | poignée d'extrémité d'un gabarit sélectionné → `reshaping`    | bouton ailleurs → `pressing` (origine aimantée, Alt l'inverse) |
 * | `pressing`  | +4 px d'écran → `measuring`                                   | lâcher (clic) : gabarit touché sélectionné, sinon sélection vide |
 * | `measuring` | extrémité (aimantation ; ⇧ : 15° ; cône à longueur fixe), direct | lâcher → mesure récente (6 s) ou gabarit (« Épingler au lâcher ») |
 * | `reshaping` | extrémité du gabarit (longueur, direction), direct            | lâcher → **une** commande ; Échap → rien                       |
 *
 * Clavier : 1 à 4 (Règle, Cône, Cercle, Carré), Entrée (épingler la mesure récente), Échap (le
 * geste, puis la mesure récente, puis retour à la sélection).
 *
 * La mesure elle-même (en cours, récente, aperçu de la poignée) est l'état local du module
 * (`ctx.local`), dessiné par `layer.ts` même quand l'outil n'est plus actif.
 */
import type { Container, Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import { exceedsThreshold } from '../../engine/interaction/drag';
import { snapToCellCenter, snapToGridLines } from '../../engine/interaction/snapping';
import type { MapEngine } from '../../engine/map-engine';
import type { MapKey, MapPointer, Tool } from '../../engine/tools/tool';
import { tempId } from '../../store/commands';
import type { LocalMeasure, MeasureModule } from './context';
import { RESHAPE_MASK, specOfEntity, templateGeometry } from './kind';
import {
  constrainConeEnd,
  MEASURE_SHAPES,
  MEASURE_TOOL_ID,
  MEASUREMENT_KIND,
  reach,
  snapAngle,
  specOf,
  type MeasureShape,
  type MeasurementData,
} from './model';
import { clearLocal, pin, release, setLocal, updateTemplates } from './operations';
import { optionsFor, skinFor } from './settings';

export type MeasureToolState = 'idle' | 'pressing' | 'measuring' | 'reshaping';

/** Rayon de la poignée d'extrémité, pixels d'écran. */
export const HANDLE_PX = 9;
/** En dessous (pixels d'écran), une mesure lâchée n'est pas gardée. */
export const MIN_MEASURE_PX = 3;

/**
 * Point aimanté d'une mesure (aimantation de la carte, Alt l'inverse) : le centre de la case à
 * une case, sinon les lignes de la grille fine (demi-case : centres et coins).
 */
export function snapMeasurePoint(engine: MapEngine, p: Point, invert: boolean): Point {
  const grid = engine.snapGrid(invert);
  if (!grid) return { x: p.x, y: p.y };
  const cell = engine.grid()?.size ?? grid.size;
  return grid.size >= cell * 0.99 ? snapToCellCenter(p, grid) : snapToGridLines(p, grid);
}

export class MeasureTool implements Tool {
  readonly id = MEASURE_TOOL_ID;
  state: MeasureToolState = 'idle';
  /** État observable par la barre de l'outil. */
  readonly ui = createStore<{ state: MeasureToolState }>()(() => ({ state: 'idle' }));

  private start: MapPointer | null = null;
  private last: MapPointer | null = null;
  private origin: Point = { x: 0, y: 0 };
  private measureId = '';
  private reshape: { entity: MapEntity; data: MeasurementData } | null = null;
  private hoverHandle = false;

  constructor(private readonly ctx: MeasureModule) {}

  private setState(state: MeasureToolState) {
    this.state = state;
    this.ui.setState({ state });
  }

  cursor(): string {
    if (this.state === 'reshaping') return 'grabbing';
    return this.hoverHandle ? 'grab' : 'crosshair';
  }

  /** Avec l'outil, seuls les gabarits se touchent (clic : sélection). */
  targets(e: MapEntity): boolean {
    return e.kind.id === MEASUREMENT_KIND;
  }

  /** Gabarit sélectionné seul, modifiable, dont la poignée d'extrémité est sous le point. */
  handleAt(world: Point, engine: MapEngine): MapEntity | null {
    const e = this.editableSelection(engine);
    if (!e) return null;
    const end = specOfEntity(e).end;
    const r = engine.camera.screenToWorldLength(HANDLE_PX);
    return Math.hypot(world.x - end.x, world.y - end.y) <= r ? e : null;
  }

  private editableSelection(engine: MapEngine): MapEntity | null {
    if (engine.selection.size !== 1) return null;
    const e = engine.entity(engine.selection.ids[0]!);
    if (!e || e.kind.id !== MEASUREMENT_KIND || e.masks.size) return null;
    return e.kind.can('move', e, engine.viewer) ? e : null;
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || this.state !== 'idle') return false;
    this.start = e;
    this.last = e;
    const handle = this.handleAt(e.world, engine);
    if (handle) {
      this.reshape = { entity: handle, data: handle.data as MeasurementData };
      engine.setMask(handle, RESHAPE_MASK, true);
      engine.setHovered(null);
      this.setState('reshaping');
      this.updateReshape(e, engine);
      engine.refreshCursor();
      return true;
    }
    this.origin = snapMeasurePoint(engine, e.world, e.alt);
    this.setState('pressing');
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    this.last = e;
    switch (this.state) {
      case 'idle': {
        if (e.buttons !== 0) return;
        const handle = !!this.handleAt(e.world, engine);
        if (handle !== this.hoverHandle) {
          this.hoverHandle = handle;
          engine.invalidate();
        }
        engine.setHovered(handle ? null : (engine.hitTest(e.world)?.id ?? null), e);
        return;
      }
      case 'pressing':
        if (!this.start || !exceedsThreshold(this.start.screen, e.screen)) return;
        this.measureId = tempId();
        this.setState('measuring');
        engine.setHovered(null);
        this.updateMeasure(e, engine);
        return;
      case 'measuring':
        this.updateMeasure(e, engine);
        return;
      case 'reshaping':
        this.updateReshape(e, engine);
        return;
    }
  }

  up(e: MapPointer, engine: MapEngine) {
    const state = this.state;
    this.last = e;
    this.setState('idle');
    switch (state) {
      case 'pressing': {
        // Clic : un gabarit touché est sélectionné ; ma mesure récente s'efface
        clearLocal(this.ctx);
        const hit = engine.hitTest(e.world);
        if (hit) engine.selection.replace([hit.id]);
        else engine.selection.clear();
        break;
      }
      case 'measuring': {
        const m = this.ctx.local.getState().measure;
        if (!m || reach(m.spec).length < engine.camera.screenToWorldLength(MIN_MEASURE_PX)) {
          clearLocal(this.ctx);
          break;
        }
        if (this.ctx.settings.getState().pinOnRelease) void pin(this.ctx, m);
        else release(this.ctx, m);
        break;
      }
      case 'reshaping':
        this.commitReshape(engine);
        break;
    }
    this.start = null;
    engine.refreshCursor();
  }

  /** L'extrémité sous le pointeur : aimantée (Alt l'inverse), ⇧ par 15°, cône à longueur fixe. */
  private endPoint(
    e: MapPointer,
    engine: MapEngine,
    origin: Point,
    shape: MeasureShape,
    options: Readonly<Record<string, unknown>>,
  ): Point {
    let p = e.shift ? snapAngle(origin, e.world, 15) : snapMeasurePoint(engine, e.world, e.alt);
    if (shape === 'cone')
      p = constrainConeEnd(origin, p, options, engine.kindContext().pixelsPerUnit);
    return p;
  }

  private updateMeasure(e: MapPointer, engine: MapEngine) {
    const s = this.ctx.settings.getState();
    const options = optionsFor(s, s.shape);
    const m: LocalMeasure = {
      id: this.measureId,
      phase: 'drawing',
      spec: {
        shape: s.shape,
        start: this.origin,
        end: this.endPoint(e, engine, this.origin, s.shape, options),
        options,
      },
      color: s.color,
      skin: skinFor(s, s.shape),
      releasedAt: 0,
    };
    setLocal(this.ctx, m);
  }

  private updateReshape(e: MapPointer, engine: MapEngine) {
    const r = this.reshape;
    if (!r) return;
    const spec = specOf(r.data);
    const end = this.endPoint(e, engine, spec.start, spec.shape, spec.options);
    const next = { ...spec, end };
    setLocal(
      this.ctx,
      {
        id: r.entity.id,
        phase: 'reshape',
        spec: next,
        color: r.data.color,
        skin: r.data.skin,
        releasedAt: 0,
      },
      false,
    );
    // Les autres voient la poignée par le direct commun (longueur et direction)
    const g = templateGeometry(next);
    engine.live?.transform([[r.entity.id, g.x, g.y, g.width, g.height, g.rotation]]);
  }

  private commitReshape(engine: MapEngine) {
    const r = this.reshape;
    this.reshape = null;
    if (!r) return;
    const m = this.ctx.local.getState().measure;
    engine.setMask(r.entity, RESHAPE_MASK, false);
    setLocal(this.ctx, null, false);
    const end = m?.phase === 'reshape' ? m.spec.end : null;
    if (end && (end.x !== r.data.end.x || end.y !== r.data.end.y)) {
      const round = (n: number) => Math.round(n * 100) / 100;
      void updateTemplates(this.ctx, 'Modifier le gabarit', [r.entity], (d) => ({
        ...d,
        end: { x: round(end.x), y: round(end.y) },
      }));
    }
    engine.live?.end();
  }

  /** Annule la poignée : le gabarit revient, les autres le voient revenir. */
  private cancelReshape(engine: MapEngine) {
    const r = this.reshape;
    this.reshape = null;
    if (!r) return;
    engine.setMask(r.entity, RESHAPE_MASK, false);
    setLocal(this.ctx, null, false);
    const g = templateGeometry(r.data);
    engine.live?.transform([[r.entity.id, g.x, g.y, g.width, g.height, g.rotation]]);
    engine.live?.end();
  }

  // ─── Clavier, Échap ────────────────────────────────────────────────────────

  key(k: MapKey, engine: MapEngine): boolean {
    if (k.ctrl || k.meta || k.alt || k.repeat) return false;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(k.code);
    if (digit && this.state !== 'reshaping') {
      const shape = MEASURE_SHAPES[Number(digit[1]) - 1]!.value;
      this.ctx.settings.setState({ shape });
      if (this.state === 'measuring' && this.last) this.updateMeasure(this.last, engine);
      return true;
    }
    if (k.key === 'Enter' && this.state === 'idle') {
      const m = this.ctx.local.getState().measure;
      if (m?.phase !== 'recent') return false;
      void pin(this.ctx, m);
      return true;
    }
    return false;
  }

  cancel(engine: MapEngine): boolean {
    const state = this.state;
    this.setState('idle');
    this.start = null;
    if (state === 'reshaping') {
      this.cancelReshape(engine);
      engine.refreshCursor();
      return true;
    }
    if (state === 'measuring') {
      clearLocal(this.ctx);
      return true;
    }
    if (state === 'pressing') return true;
    // Au repos : Échap efface d'abord ma mesure récente
    if (this.ctx.local.getState().measure?.phase === 'recent') {
      clearLocal(this.ctx);
      return true;
    }
    return false;
  }

  deactivate(engine: MapEngine) {
    // Le geste est annulé ; une mesure récente reste (les autres la voient encore)
    if (this.state !== 'idle') this.cancel(engine);
    this.hoverHandle = false;
    engine.setHovered(null);
    if (this.preview) this.preview.visible = false;
  }

  // ─── Aperçu (plan `tool`) : poignée d'extrémité du gabarit sélectionné ──────

  private preview: Graphics | null = null;
  /** Ce que montre la poignée dessinée (redessinée seulement si cela change). */
  private readonly drawn = { x: NaN, y: NaN, zoom: 0, hover: false };

  renderPreview(layer: Container, rc: RenderContext) {
    const engine = this.ctx.engine;
    if (!this.preview) this.preview = new rc.pixi.Graphics({ label: 'measure-handle' });
    const g = this.preview;
    if (g.parent !== layer) layer.addChild(g);
    g.visible = true;
    const e = this.state === 'reshaping' ? null : this.editableSelection(engine);
    const end = e ? specOfEntity(e).end : null;
    const d = this.drawn;
    const x = end?.x ?? NaN;
    const y = end?.y ?? NaN;
    // NaN ≠ NaN : sans poignée, on ne vide qu'une fois
    if (!end && Number.isNaN(d.x) && d.zoom === -1) return;
    if (end && d.x === x && d.y === y && d.zoom === rc.zoom && d.hover === this.hoverHandle) return;
    d.x = x;
    d.y = y;
    d.zoom = end ? rc.zoom : -1;
    d.hover = this.hoverHandle;
    g.clear();
    if (!end) return;
    const u = 1 / rc.zoom;
    const r = (this.hoverHandle ? HANDLE_PX : HANDLE_PX - 2) * u * 0.8;
    g.circle(end.x, end.y, r)
      .fill({ color: rc.theme.background })
      .stroke({ width: 1.5 * u, color: rc.theme.primary });
  }

  dispose() {
    this.preview?.destroy();
    this.preview = null;
  }
}
