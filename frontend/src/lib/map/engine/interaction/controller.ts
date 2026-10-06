/**
 * Contrôleur d'interaction (docs/carte.md § 6) : le seul endroit qui transforme pointeur,
 * molette, tactile et clavier en gestes. Il ne connaît pas le DOM (voir `dom-input.ts`) : il
 * reçoit des événements normalisés, ce qui le rend testable sans navigateur.
 *
 * Communs à tous les outils, avant l'outil actif :
 * - caméra : molette (zoom autour du curseur ; `ctrlKey` : pincement du pavé tactile), clic du
 *   milieu ou Espace + glisser (pan), double clic du milieu (recadrer), deux doigts (zoom et
 *   pan) ; un bouton gauche que l'outil ne prend pas déplace aussi la vue ;
 * - menu contextuel : clic droit, ou appui long (500 ms) au doigt ;
 * - double clic : d'abord à l'outil (fin d'une chaîne de murs), sinon inspecteur (outil
 *   sélection) ;
 * - clavier (carte focalisée, jamais pendant la saisie) : Échap (geste, puis outil, puis
 *   sélection), ⌘/Ctrl+Z et ⌘/Ctrl+⇧+Z, ⌘/Ctrl+D, Suppr, flèches (⇧ : 5 cases), R et ⇧R,
 *   ⌘/Ctrl+↑↓ (ordre ; ⇧ : premier plan, arrière-plan ; ⌥ : calque), lettres des outils et
 *   des actions des modules (K : calques, Q : quadrillage).
 */
import { chordFromEvent } from '@/lib/shortcuts/chord';
import { wheelZoomFactor } from '../camera';
import type { Point } from '../geometry';
import type { MapEngine } from '../map-engine';
import type { MapKey, MapPointer } from '../tools/tool';
import { SELECT_TOOL_ID } from '../tools/tool-manager';
import { DRAG_THRESHOLD_PX, exceedsThreshold } from './drag';

export const LONG_PRESS_MS = 500;
export const DOUBLE_CLICK_MS = 350;
export const DOUBLE_CLICK_PX = 6;
/** Pas de rotation au clavier (R, ⇧R). */
export const ROTATE_STEP = 15;
/** Direction d'un déplacement au clavier, en pas de grille. */
const NUDGE: Record<'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type Mode = 'none' | 'tool' | 'pan' | 'pinch';

interface Pinch {
  a: number;
  b: number;
  distance: number;
  mid: Point;
}

export interface ControllerTimers {
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const defaultTimers: ControllerTimers = {
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class InteractionController {
  private mode: Mode = 'none';
  private readonly pointers = new Map<number, MapPointer>();
  private panFrom: Point | null = null;
  private pinch: Pinch | null = null;
  private longPress: { handle: unknown; start: MapPointer } | null = null;
  private lastDown: { time: number; screen: Point; button: number } | null = null;
  /** Dernier pointeur connu : rejoué à l'outil après un zoom pendant un geste. */
  private lastPointer: MapPointer | null = null;
  spaceHeld = false;

  constructor(
    private readonly engine: MapEngine,
    private readonly timers: ControllerTimers = defaultTimers,
  ) {}

  /** Geste en cours (outil, pan, pincement). */
  get busy(): boolean {
    return this.mode !== 'none';
  }

  get currentMode(): Mode {
    return this.mode;
  }

  /** Curseur imposé par le contrôleur (Espace, pan), sinon null. */
  cursor(): string | null {
    if (this.mode === 'pan') return 'grabbing';
    if (this.spaceHeld) return 'grab';
    return null;
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  pointerDown(e: MapPointer): boolean {
    this.pointers.set(e.id, e);
    this.lastPointer = e;
    const engine = this.engine;
    engine.lastPress = { world: e.world, time: e.time };

    // Deuxième doigt : le geste de l'outil s'efface devant le pincement
    const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');
    if (e.type === 'touch' && touches.length === 2) {
      this.startPinch(touches as [MapPointer, MapPointer]);
      return true;
    }
    // Un seul geste à la fois (un clic droit pendant un glisser est ignoré)
    if (this.mode !== 'none') return true;

    const double = this.isDouble(e);
    this.lastDown = double ? null : { time: e.time, screen: e.screen, button: e.button };
    return this.press(e, double);
  }

  /** Deux doigts posés : pincement (zoom et pan). */
  private startPinch([a, b]: [MapPointer, MapPointer]) {
    const engine = this.engine;
    this.cancelLongPress();
    if (this.mode === 'tool') engine.tools.active.cancel?.(engine);
    this.pinch = {
      a: a.id,
      b: b.id,
      distance: Math.max(1, Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y)),
      mid: mid(a.screen, b.screen),
    };
    this.mode = 'pinch';
  }

  /** Appui d'un bouton hors geste : milieu (pan, recadrer), droit (menu), gauche (outil). */
  private press(e: MapPointer, double: boolean): boolean {
    if (e.button === 1) {
      if (double) this.engine.fitView();
      else this.startPan(e);
      return true;
    }
    if (e.button === 0 && this.spaceHeld) {
      this.startPan(e);
      return true;
    }
    if (e.button === 2) {
      this.openMenuAt(e);
      return true;
    }
    if (e.button !== 0) return false;
    return this.pressPrimary(e, double);
  }

  /** Bouton gauche : double clic à l'outil, sinon geste de l'outil, sinon pan. */
  private pressPrimary(e: MapPointer, double: boolean): boolean {
    const engine = this.engine;
    if (double && engine.tools.active.doubleClick?.(e, engine)) {
      this.mode = 'none';
      return true;
    }

    if (e.type === 'touch') this.startLongPress(e);
    const took = engine.tools.active.down?.(e, engine) ?? false;
    if (took) this.mode = 'tool';
    else this.startPan(e);
    return true;
  }

  pointerMove(e: MapPointer) {
    if (this.pointers.has(e.id)) this.pointers.set(e.id, e);
    this.lastPointer = e;
    const engine = this.engine;
    if (
      this.longPress &&
      exceedsThreshold(this.longPress.start.screen, e.screen, DRAG_THRESHOLD_PX * 2)
    )
      this.cancelLongPress();

    switch (this.mode) {
      case 'pan':
        if (this.panFrom) {
          engine.camera.panBy(e.screen.x - this.panFrom.x, e.screen.y - this.panFrom.y);
          this.panFrom = e.screen;
        }
        break;
      case 'pinch':
        this.updatePinch();
        break;
      case 'tool':
        engine.tools.active.move?.(e, engine);
        break;
      default:
        if (e.buttons === 0) engine.tools.active.move?.(e, engine);
    }
    engine.shareCursor(e.world);
  }

  pointerUp(e: MapPointer) {
    this.pointers.delete(e.id);
    this.lastPointer = e;
    this.cancelLongPress();
    const engine = this.engine;
    switch (this.mode) {
      case 'pinch':
        if ([...this.pointers.values()].filter((p) => p.type === 'touch').length < 2) {
          this.pinch = null;
          // Le doigt restant ne reprend pas de geste avant d'être levé
          this.mode = this.pointers.size ? 'pan' : 'none';
          this.panFrom = this.pointers.size ? [...this.pointers.values()][0]!.screen : null;
          engine.cameraSettled();
        }
        return;
      case 'pan':
        if (this.pointers.size) return;
        this.mode = 'none';
        this.panFrom = null;
        engine.cameraSettled();
        engine.refreshCursor();
        return;
      case 'tool':
        this.mode = 'none';
        engine.tools.active.up?.(e, engine);
        return;
    }
  }

  /** Pointeur perdu (le navigateur a repris la main) : tout geste est annulé. */
  pointerCancel(e: MapPointer) {
    this.pointers.delete(e.id);
    this.cancelLongPress();
    if (this.mode === 'tool') this.engine.tools.active.cancel?.(this.engine);
    if (this.mode === 'pan' || this.mode === 'pinch') this.engine.cameraSettled();
    this.mode = 'none';
    this.pinch = null;
    this.panFrom = null;
    this.engine.refreshCursor();
  }

  /** Molette : zoom autour du curseur. */
  wheel(screen: Point, deltaY: number, deltaMode: number, ctrlKey: boolean) {
    const engine = this.engine;
    engine.camera.zoomAt(screen, wheelZoomFactor(deltaY, deltaMode, ctrlKey));
    engine.cameraSettled();
    // Pendant un geste, le point du monde sous le pointeur a changé
    if (this.mode === 'tool' && this.lastPointer) {
      const p = this.lastPointer;
      engine.tools.active.move?.({ ...p, world: engine.camera.screenToWorld(p.screen) }, engine);
    }
  }

  private startPan(e: MapPointer) {
    this.mode = 'pan';
    this.panFrom = e.screen;
    this.engine.camera.cancelAnimation();
    this.engine.refreshCursor();
  }

  private updatePinch() {
    const p = this.pinch;
    if (!p) return;
    const a = this.pointers.get(p.a);
    const b = this.pointers.get(p.b);
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y));
    const m = mid(a.screen, b.screen);
    const camera = this.engine.camera;
    camera.panBy(m.x - p.mid.x, m.y - p.mid.y);
    camera.zoomAt(m, distance / p.distance);
    p.distance = distance;
    p.mid = m;
  }

  private isDouble(e: MapPointer): boolean {
    const last = this.lastDown;
    return (
      !!last &&
      last.button === e.button &&
      e.time - last.time <= DOUBLE_CLICK_MS &&
      !exceedsThreshold(last.screen, e.screen, DOUBLE_CLICK_PX)
    );
  }

  // ─── Menu contextuel ───────────────────────────────────────────────────────

  private startLongPress(e: MapPointer) {
    this.cancelLongPress();
    const handle = this.timers.setTimer(() => {
      const lp = this.longPress;
      this.longPress = null;
      if (!lp || !this.pointers.has(lp.start.id)) return;
      if (this.mode === 'tool') this.engine.tools.active.cancel?.(this.engine);
      this.mode = 'none';
      this.openMenuAt(lp.start);
    }, LONG_PRESS_MS);
    this.longPress = { handle, start: e };
  }

  private cancelLongPress() {
    if (!this.longPress) return;
    this.timers.clearTimer(this.longPress.handle);
    this.longPress = null;
  }

  /**
   * Clic droit ou appui long. Sur une entité : elle rejoint la sélection (seule si elle n'y était
   * pas) et le panneau de la sélection tient lieu de menu. Dans le vide : le menu de la carte.
   */
  private openMenuAt(e: MapPointer) {
    const engine = this.engine;
    const hit = engine.hitTest(e.world);
    if (hit) {
      if (!engine.selection.has(hit.id)) engine.selection.replace([hit.id]);
      engine.showSelectionPanel();
      engine.closeMenu();
      return;
    }
    engine.selection.clear();
    engine.openMenu({ screen: e.screen, world: e.world, ids: [] });
  }

  // ─── Clavier ───────────────────────────────────────────────────────────────

  /** Touche enfoncée, carte focalisée ; renvoie vrai si elle est prise. */
  keyDown(k: MapKey): boolean {
    const engine = this.engine;
    if (k.code === 'Space' && !k.ctrl && !k.meta) return this.holdSpace();
    if (k.key === 'Escape') return this.escape();
    if (engine.tools.active.key?.(k, engine)) return true;
    // Gestes communs d'abord (⌘Z, Suppr, flèches, R…) : non modifiables (docs/raccourcis.md)
    if ((k.ctrl || k.meta) && this.modifiedKey(k)) return true;
    // Pendant un geste, pas de raccourci qui modifierait ce qu'on tient
    if (this.mode !== 'none') return false;
    if (!k.ctrl && !k.meta && !k.alt && this.plainKey(k)) return true;
    if (k.repeat) return false;
    return this.shortcutKey(k);
  }

  /** Espace enfoncé : la vue se déplace au glisser. */
  private holdSpace(): boolean {
    if (!this.spaceHeld) {
      this.spaceHeld = true;
      this.engine.refreshCursor();
    }
    return true;
  }

  /** Échap : geste, puis outil, puis surcouches, puis outil sélection, puis sélection. */
  private escape(): boolean {
    const engine = this.engine;
    const tools = engine.tools;
    if (this.mode === 'pan' || this.mode === 'pinch') return true;
    if (tools.active.cancel?.(engine)) {
      this.mode = 'none';
      return true;
    }
    if (engine.closeOverlays()) return true;
    if (tools.getActiveId() !== SELECT_TOOL_ID) {
      tools.activate(SELECT_TOOL_ID);
      return true;
    }
    if (engine.selection.size) {
      engine.selection.clear();
      return true;
    }
    return false;
  }

  /** Raccourcis avec ⌘/Ctrl : ordre et calque, annuler, rétablir, dupliquer. */
  private modifiedKey(k: MapKey): boolean {
    const engine = this.engine;
    if ((k.key === 'ArrowUp' || k.key === 'ArrowDown') && this.mode === 'none')
      return this.arrangeSelection(k, k.key === 'ArrowUp');
    if (k.code === 'KeyZ') {
      void (k.shift ? engine.commands.redo() : engine.commands.undo());
      return true;
    }
    if (k.code === 'KeyY') {
      void engine.commands.redo();
      return true;
    }
    if (k.code === 'KeyD') {
      void engine.duplicateSelection();
      return true;
    }
    return false;
  }

  /** ⌘/Ctrl+↑↓ un cran, +⇧ premier plan / arrière-plan, +⌥ changer de calque. */
  private arrangeSelection(k: MapKey, up: boolean): boolean {
    const engine = this.engine;
    if (engine.selection.size === 0) return false;
    const entities = engine.selectedEntities();
    if (k.alt) void engine.moveToLayer(entities, up ? 'above' : 'below');
    else if (k.shift) void engine.arrange(entities, up ? 'front' : 'back');
    else void engine.arrange(entities, up ? 'forward' : 'backward');
    return true;
  }

  /** Gestes sans modificateur : suppression, flèches, rotation de la sélection. */
  private plainKey(k: MapKey): boolean {
    const engine = this.engine;
    const selected = engine.selection.size > 0;
    switch (k.key) {
      case 'Delete':
      case 'Backspace':
        if (!selected) return false;
        void engine.deleteSelection();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        return selected && this.nudge(k.key, k.shift);
    }
    if (k.code === 'KeyR' && selected) {
      void engine.rotateEntities(engine.selectedEntities(), k.shift ? -ROTATE_STEP : ROTATE_STEP);
      return true;
    }
    return false;
  }

  /** Flèches : la sélection avance d'une case (⇧ : 5 cases). */
  private nudge(key: keyof typeof NUDGE, fast: boolean): boolean {
    const engine = this.engine;
    const step = (engine.grid()?.size ?? 50) * (fast ? 5 : 1);
    const [dx, dy] = NUDGE[key];
    void engine.nudgeSelection(dx * step, dy * step);
    return true;
  }

  /** Touche d'un outil, sinon d'une action (K : calques, Q : quadrillage), choisie ou par défaut. */
  private shortcutKey(k: MapKey): boolean {
    const chord = chordFromEvent({
      key: k.key,
      code: k.code,
      metaKey: k.meta,
      ctrlKey: k.ctrl,
      altKey: k.alt,
      shiftKey: k.shift,
    });
    if (!chord) return false;
    const tools = this.engine.tools;
    const def = tools.byShortcut(chord);
    if (def) return tools.activate(def.id);
    const action = this.engine.actionForKey(chord);
    if (action) {
      action.run(this.engine);
      return true;
    }
    return false;
  }

  keyUp(k: MapKey) {
    if (k.code === 'Space' && this.spaceHeld) {
      this.spaceHeld = false;
      this.engine.refreshCursor();
    }
  }

  /** La carte perd le focus : Espace relâché, gestes clavier oubliés. */
  blur() {
    if (this.spaceHeld) {
      this.spaceHeld = false;
      this.engine.refreshCursor();
    }
  }

  dispose() {
    this.cancelLongPress();
    this.pointers.clear();
    this.mode = 'none';
  }
}
