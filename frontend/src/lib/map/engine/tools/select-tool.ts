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
 * | `measure`   | ⌘/Ctrl + bouton ; +4 px → `panning`      | lâcher → clic de mesure, sélection gardée |
 *
 * Un clic simple (`pressing`, `void`, `measure` lâchés sans glisser) est signalé aux modules
 * après son effet (`engine.emitMapClick`) : la distance au clic s'y branche (§ 10, Mesures).
 *
 * Plusieurs éléments presque confondus sous le pointeur (`confusablesAt`) : un menu demande
 * lequel prendre ; l'élément choisi est sélectionné, les autres mis de côté (estompés,
 * intouchables) tant qu'il le reste. Si l'un d'eux est déjà sélectionné, il est pris.
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
  'idle' | 'pressing' | 'dragging' | 'void' | 'panning' | 'lasso' | 'handle' | 'measure';

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
  /** Sélection au bouton (avant que le clic la change), pour le clic signalé aux modules. */
  private selectionBefore: readonly string[] = [];

  cursor(engine: MapEngine): string | null {
    if (this.state === 'dragging' || this.state === 'handle' || this.state === 'panning')
      return 'grabbing';
    if (this.state === 'lasso') return 'crosshair';
    return engine.hoverCursor();
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    this.start = e;
    this.selectionBefore = engine.selection.ids;

    // Poignée de l'entité seule sélectionnée
    const handle = engine.gizmoAt(e.world);
    if (handle) {
      this.state = 'handle';
      this.transform = new TransformSession(engine, handle.entity, handle.handle, e.world);
      engine.refreshCursor();
      return true;
    }

    // ⌘/Ctrl + clic : clic de mesure, la sélection ne change pas (glisser : la vue se déplace)
    if ((e.ctrl || e.meta) && !e.alt) {
      this.target = engine.hitTest(e.world);
      this.state = 'measure';
      return true;
    }

    let hit = engine.hitTest(e.world);
    // Éléments presque confondus : celui déjà sélectionné s'il y en a un, sinon on demande
    const stack = hit && !e.shift && !e.alt ? engine.confusablesAt(e.world) : null;
    if (stack) {
      const selected = stack.find((x) => engine.selection.has(x.id));
      if (!selected) {
        engine.openPicker({ screen: e.screen, world: e.world, ids: stack.map((x) => x.id) });
        this.target = null;
        this.state = 'idle';
        return true;
      }
      hit = selected;
    }
    if (hit) {
      this.pressEntity(hit, e, engine);
      return true;
    }

    this.target = null;
    this.state = 'void';
    return true;
  }

  /** Bouton sur une entité : sélectionnée tout de suite, sauf action de clic (porte) ou Alt. */
  private pressEntity(hit: MapEntity, e: MapPointer, engine: MapEngine) {
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
  }

  move(e: MapPointer, engine: MapEngine) {
    switch (this.state) {
      case 'idle':
        if (e.buttons === 0) engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
        return;
      case 'pressing':
        this.movePressing(e, engine);
        return;
      case 'dragging':
        this.drag?.update(e.world, { snap: !e.alt });
        return;
      case 'measure':
        if (this.start && exceedsThreshold(this.start.screen, e.screen))
          this.startPanning(e, engine);
        return;
      case 'void':
        this.moveVoid(e, engine);
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

  /** Appui sur une entité qui dépasse le seuil : glisser de la sélection, sinon la carte. */
  private movePressing(e: MapPointer, engine: MapEngine) {
    const start = this.start;
    const target = this.target;
    if (!start || !target) return;
    if (!exceedsThreshold(start.screen, e.screen)) return;
    // Touchée pour son seul clic (porte hors de l'outil obstacles) : la carte se déplace
    if (!engine.isInteractive(target)) {
      this.startPanning(e, engine);
      return;
    }
    // Alt + glisser d'une entité non sélectionnée : elle rejoint la sélection
    if (!engine.selection.has(target.id)) {
      if (start.shift) engine.selection.add([target.id]);
      else engine.selection.replace([target.id]);
    }
    const movable = engine.movableSelection(target);
    if (!movable.length) {
      // Verrouillée, sans droit ou mur hors de son outil : c'est la carte qui se déplace
      this.startPanning(e, engine);
      return;
    }
    this.state = 'dragging';
    engine.setHovered(null);
    // On déplace : pas de panneau, ni pendant ni après
    engine.showSelectionPanel(false);
    const primary = movable.includes(target) ? target : movable[0]!;
    this.drag = new DragSession(engine, movable, start.world, primary);
    this.drag.update(e.world, { snap: !e.alt });
    engine.refreshCursor();
  }

  /** Glisser dans le vide : ⇧, lasso ; sinon la carte se déplace, comme on s'y attend. */
  private moveVoid(e: MapPointer, engine: MapEngine) {
    if (!this.start || !exceedsThreshold(this.start.screen, e.screen)) return;
    if (!this.start.shift) {
      this.startPanning(e, engine);
      return;
    }
    this.state = 'lasso';
    this.lassoAdditive = true;
    this.lasso = rectFromPoints(this.start.world, e.world);
    engine.invalidate();
    engine.refreshCursor();
  }

  up(e: MapPointer, engine: MapEngine) {
    const state = this.state;
    const target = this.target;
    const start = this.start;
    const selectionBefore = this.selectionBefore;
    this.reset();
    switch (state) {
      case 'pressing':
        if (target) this.clickEntity(target, e, engine);
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
      case 'lasso':
        if (start) this.selectInLasso(start, e, engine);
        break;
      case 'handle':
        void this.transform?.commit();
        break;
    }
    this.drag = null;
    this.transform = null;
    engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
    engine.refreshCursor();
    // Clic simple : signalé aux modules après son effet (distance au clic)
    if (state === 'pressing' || state === 'void' || state === 'measure')
      engine.emitMapClick({
        world: e.world,
        target,
        measure: state === 'measure',
        shift: e.shift,
        alt: e.alt,
        selectionBefore,
      });
  }

  /** Clic simple sur une entité : Alt, ping ; action de clic (porte) ; sinon la sélection. */
  private clickEntity(target: MapEntity, e: MapPointer, engine: MapEngine) {
    if (e.alt) {
      engine.ping(e.world);
      return;
    }
    // Action de clic de la sorte (ouvrir une porte) : la sélection ne change pas
    if (!e.shift && target.kind.click?.(target, { viewer: engine.viewer, engine, world: e.world }))
      return;
    if (!engine.isInteractive(target)) return;
    // Clic sur une entité déjà sélectionnée : ⇧ la retire, sinon elle reste seule
    if (!this.selectedOnDown) {
      if (e.shift) engine.selection.toggle(target.id);
      else engine.selection.replace([target.id]);
    }
    // Clic simple, sans glisser : le panneau de la sélection s'ouvre
    engine.showSelectionPanel();
  }

  /** Lasso lâché : les entités du rectangle sélectionnées (ajoutées avec ⇧). */
  private selectInLasso(start: MapPointer, e: MapPointer, engine: MapEngine) {
    const rect = rectFromPoints(start.world, e.world);
    const ids = engine.entitiesInRect(rect).map((x) => x.id);
    if (this.lassoAdditive) engine.selection.add(ids);
    else engine.selection.replace(ids);
    engine.showSelectionPanel();
    engine.invalidate();
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
      engine.showSelectionPanel();
      return true;
    }
    if (!hit || !hasCapability(hit.kind, 'inspect') || !hit.kind.can('inspect', hit, engine.viewer))
      return false;
    engine.selection.replace([hit.id]);
    engine.showSelectionPanel();
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
    this.selectionBefore = [];
  }
}
