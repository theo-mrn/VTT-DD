/**
 * Outil de sélection (V), l'outil par défaut (docs/carte.md § 6). Il porte les gestes communs
 * à toutes les entités :
 *
 * | État        | Entrée                                   | Sortie                                   |
 * | ----------- | ---------------------------------------- | ---------------------------------------- |
 * | `idle`      | survol → contour, curseur                | bouton sur une entité → `pressing`       |
 * |             | bouton sur une poignée → `handle`        | bouton dans le vide → `void`             |
 * | `pressing`  | +4 px → `dragging` (sinon `panning`)     | lâcher → clic (sélection, ⇧ bascule)     |
 * | `dragging`  | aperçu, direct, aimantation (Alt : sans) | lâcher → une commande ; Échap → annule   |
 * | `void`      | +4 px → `panning` (⇧ : `lasso`)          | lâcher → désélectionne (Alt : ping)      |
 * | `panning`   | la carte suit le pointeur                | lâcher → la vue reste là                 |
 * | `lasso`     | rectangle (⇧ + glisser dans le vide)     | lâcher → sélection, ajoutée à l'actuelle |
 * | `handle`    | rotation ou taille                       | lâcher → une commande ; Échap → annule   |
 *
 * Une sorte à action de clic (`EntityKind.click` : porte) la reçoit au lâcher d'un clic simple,
 * sans que la sélection change ; hors de son outil, elle ne se sélectionne ni ne se glisse.
 */
import { rectFromPoints, type Rect } from '../geometry';
import type { MapEntity } from '../entities/entity';
import { hasCapability } from '../entities/entity-kind';
import { DragSession, exceedsThreshold, TransformSession } from '../interaction/drag';
import type { MapEngine } from '../map-engine';
import type { MapPointer, Tool } from './tool';
import { SELECT_TOOL_ID } from './tool-manager';

export type SelectState =
  'idle' | 'pressing' | 'dragging' | 'void' | 'panning' | 'lasso' | 'handle';

export class SelectTool implements Tool {
  readonly id = SELECT_TOOL_ID;
  state: SelectState = 'idle';
  private start: MapPointer | null = null;
  private target: MapEntity | null = null;
  /** La cible n'était pas sélectionnée au bouton : elle l'a été tout de suite. */
  private selectedOnDown = false;
  private drag: DragSession | null = null;
  private transform: TransformSession | null = null;
  /** Rectangle du lasso (monde), lu par le rendu. */
  lasso: Rect | null = null;
  private lassoAdditive = false;
  /** Dernier point d'écran du glisser de la vue. */
  private panFrom: { x: number; y: number } | null = null;

  cursor(engine: MapEngine): string | null {
    if (this.state === 'dragging' || this.state === 'handle' || this.state === 'panning')
      return 'grabbing';
    if (this.state === 'lasso') return 'crosshair';
    return engine.hoverCursor();
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    this.start = e;

    // Poignée de l'entité seule sélectionnée
    const handle = engine.gizmoAt(e.world);
    if (handle) {
      this.state = 'handle';
      this.transform = new TransformSession(engine, handle.entity, handle.handle, e.world);
      engine.refreshCursor();
      return true;
    }

    const hit = engine.hitTest(e.world);
    if (hit) {
      this.target = hit;
      this.selectedOnDown = false;
      // Action de clic (porte) : décidée au lâcher, sans sélectionner au bouton
      const clickAction = !!hit.kind.click && !e.shift && !e.alt;
      if (!clickAction && !e.alt && !engine.selection.has(hit.id) && engine.isInteractive(hit)) {
        if (e.shift) engine.selection.add([hit.id]);
        else engine.selection.replace([hit.id]);
        this.selectedOnDown = true;
      }
      this.state = 'pressing';
      return true;
    }

    this.target = null;
    this.state = 'void';
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    switch (this.state) {
      case 'idle':
        if (e.buttons === 0) engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
        return;
      case 'pressing': {
        if (!this.start || !this.target) return;
        if (!exceedsThreshold(this.start.screen, e.screen)) return;
        // Touchée pour son seul clic (porte hors de l'outil obstacles) : la carte se déplace
        if (!engine.isInteractive(this.target)) {
          this.startPanning(e, engine);
          return;
        }
        // Alt + glisser d'une entité non sélectionnée : elle rejoint la sélection
        if (!engine.selection.has(this.target.id)) {
          if (this.start.shift) engine.selection.add([this.target.id]);
          else engine.selection.replace([this.target.id]);
        }
        const movable = engine.movableSelection(this.target);
        if (!movable.length) {
          // Verrouillée, sans droit ou mur hors de son outil : c'est la carte qui se déplace
          this.startPanning(e, engine);
          return;
        }
        this.state = 'dragging';
        engine.setHovered(null);
        const primary = movable.includes(this.target) ? this.target : movable[0]!;
        this.drag = new DragSession(engine, movable, this.start.world, primary);
        this.drag.update(e.world, { snap: !e.alt });
        engine.refreshCursor();
        return;
      }
      case 'dragging':
        this.drag?.update(e.world, { snap: !e.alt });
        return;
      case 'void':
        if (!this.start || !exceedsThreshold(this.start.screen, e.screen)) return;
        // ⇧ + glisser dans le vide : lasso ; sinon la carte se déplace, comme on s'y attend
        if (!this.start.shift) {
          this.startPanning(e, engine);
          return;
        }
        this.state = 'lasso';
        this.lassoAdditive = true;
        this.lasso = rectFromPoints(this.start.world, e.world);
        engine.invalidate();
        engine.refreshCursor();
        return;
      case 'panning':
        if (!this.panFrom) return;
        engine.camera.panBy(e.screen.x - this.panFrom.x, e.screen.y - this.panFrom.y);
        this.panFrom = e.screen;
        return;
      case 'lasso':
        if (!this.start) return;
        this.lasso = rectFromPoints(this.start.world, e.world);
        engine.invalidate();
        return;
      case 'handle':
        this.transform?.update(e.world, { shift: e.shift });
        return;
    }
  }

  up(e: MapPointer, engine: MapEngine) {
    const state = this.state;
    const target = this.target;
    const start = this.start;
    this.reset();
    switch (state) {
      case 'pressing':
        if (!target) break;
        if (e.alt) {
          engine.ping(e.world);
          break;
        }
        // Action de clic de la sorte (ouvrir une porte) : la sélection ne change pas
        if (
          !e.shift &&
          target.kind.click?.(target, { viewer: engine.viewer, engine, world: e.world })
        )
          break;
        if (!engine.isInteractive(target)) break;
        // Clic sur une entité déjà sélectionnée : ⇧ la retire, sinon elle reste seule
        if (!this.selectedOnDown) {
          if (e.shift) engine.selection.toggle(target.id);
          else engine.selection.replace([target.id]);
        }
        break;
      case 'dragging':
        void this.drag?.commit();
        break;
      case 'void':
        if (e.alt) engine.ping(e.world);
        else if (!start?.shift) engine.selection.clear();
        break;
      case 'panning':
        engine.cameraSettled();
        break;
      case 'lasso': {
        if (!start) break;
        const rect = rectFromPoints(start.world, e.world);
        const ids = engine.entitiesInRect(rect).map((x) => x.id);
        if (this.lassoAdditive) engine.selection.add(ids);
        else engine.selection.replace(ids);
        engine.invalidate();
        break;
      }
      case 'handle':
        void this.transform?.commit();
        break;
    }
    this.drag = null;
    this.transform = null;
    engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
    engine.refreshCursor();
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    const hit = engine.hitTest(e.world);
    // Touchée pour son seul clic (porte) : chaque clic compte, le second aussi
    if (hit && !engine.isInteractive(hit)) {
      hit.kind.click?.(hit, { viewer: engine.viewer, engine, world: e.world });
      return true;
    }
    // La sorte prend le double clic (texte édité en place), sinon l'inspecteur
    if (hit?.kind.doubleClick?.(hit, { viewer: engine.viewer, engine, world: e.world })) {
      engine.selection.replace([hit.id]);
      return true;
    }
    if (!hit || !hasCapability(hit.kind, 'inspect') || !hit.kind.can('inspect', hit, engine.viewer))
      return false;
    engine.selection.replace([hit.id]);
    engine.openInspector([hit.id]);
    return true;
  }

  cancel(engine: MapEngine): boolean {
    const state = this.state;
    if (state === 'dragging') this.drag?.cancel();
    if (state === 'handle') this.transform?.cancel();
    this.reset();
    this.drag = null;
    this.transform = null;
    if (state === 'lasso') engine.invalidate();
    if (state === 'panning') engine.cameraSettled();
    engine.refreshCursor();
    return state !== 'idle';
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    engine.setHovered(null);
  }

  /** Le glisser déplace la carte depuis le point de départ (seuil franchi). */
  private startPanning(e: MapPointer, engine: MapEngine) {
    const from = this.start?.screen ?? e.screen;
    this.state = 'panning';
    this.target = null;
    engine.setHovered(null);
    engine.camera.cancelAnimation();
    engine.camera.panBy(e.screen.x - from.x, e.screen.y - from.y);
    this.panFrom = e.screen;
    engine.refreshCursor();
  }

  private reset() {
    this.state = 'idle';
    this.start = null;
    this.target = null;
    this.lasso = null;
    this.panFrom = null;
  }
}
