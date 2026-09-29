/**
 * Outil de sélection (V), l'outil par défaut (docs/carte.md § 6). Il porte les gestes communs
 * à toutes les entités :
 *
 * | État        | Entrée                                   | Sortie                                   |
 * | ----------- | ---------------------------------------- | ---------------------------------------- |
 * | `idle`      | survol → contour, curseur                | bouton sur une entité → `pressing`       |
 * |             | bouton sur une poignée → `handle`        | bouton dans le vide → `void`             |
 * | `pressing`  | +4 px → `dragging` (si déplaçable)       | lâcher → clic (sélection, ⇧ bascule)     |
 * | `dragging`  | aperçu, direct, aimantation (Alt : sans) | lâcher → une commande ; Échap → annule   |
 * | `void`      | +4 px → `lasso`                          | lâcher → désélectionne (Alt : ping)      |
 * | `lasso`     | rectangle                                | lâcher → sélection (⇧ : ajoute)          |
 * | `handle`    | rotation ou taille                       | lâcher → une commande ; Échap → annule   |
 */
import { rectFromPoints, type Rect } from '../geometry';
import type { MapEntity } from '../entities/entity';
import { hasCapability } from '../entities/entity-kind';
import { DragSession, exceedsThreshold, TransformSession } from '../interaction/drag';
import type { MapEngine } from '../map-engine';
import type { MapPointer, Tool } from './tool';
import { SELECT_TOOL_ID } from './tool-manager';

export type SelectState = 'idle' | 'pressing' | 'dragging' | 'void' | 'lasso' | 'handle';

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

  cursor(engine: MapEngine): string | null {
    if (this.state === 'dragging' || this.state === 'handle') return 'grabbing';
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
      if (!e.alt && !engine.selection.has(hit.id)) {
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
        const movable = engine.movableSelection(this.target);
        if (!movable.length) {
          // Verrouillée ou sans droit : le geste n'est plus qu'un clic manqué
          this.state = 'idle';
          this.target = null;
          engine.refreshCursor();
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
        this.state = 'lasso';
        this.lassoAdditive = this.start.shift;
        this.lasso = rectFromPoints(this.start.world, e.world);
        engine.invalidate();
        engine.refreshCursor();
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
    engine.refreshCursor();
    return state !== 'idle';
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    engine.setHovered(null);
  }

  private reset() {
    this.state = 'idle';
    this.start = null;
    this.target = null;
    this.lasso = null;
  }
}
