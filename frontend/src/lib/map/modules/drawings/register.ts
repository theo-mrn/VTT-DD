/**
 * Branchement du module « dessins » sur le moteur (docs/carte.md § 10) : sortes `drawing` et
 * `note`, outils Dessin (P) et Texte (T), tracés en cours des autres (plan `live`), netteté des
 * textes au zoom. L'interface React (barres contextuelles, inspecteur, éditeur en place) est
 * passée par `index.ts` : sans elle (tests), tout le reste fonctionne.
 */
import { Pencil, Type } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Container, Graphics } from 'pixi.js';
import { destroyDisplay } from '../../engine/destroy-display';
import type { InspectorSectionProps, MapEngine } from '../../engine/map-engine';
import { drawingKind } from './drawing-kind';
import { DrawTool } from './draw-tool';
import { LiveStrokes, type Ghost } from './live-strokes';
import { NoteEditor } from './note-editor';
import { noteKind, refreshNoteResolutions } from './note-kind';
import { drawFlatPolyline, drawShape, pixiColor } from './render';
import { attachRuntime, persistenceOf, type DrawingsRuntime } from './runtime';
import { createDrawSettings, type SettingsStorage } from './settings';
import { shapeOf } from './shapes';
import { TextTool } from './text-tool';
import {
  canAnnotate,
  DRAW_TOOL_ID,
  DRAWING_KIND,
  DRAWINGS_COLLECTION,
  NOTE_KIND,
  NOTES_COLLECTION,
  TEXT_TOOL_ID,
  type DrawingData,
  type NoteData,
} from './types';
import { onFontsLoaded } from './text-layout';

/** Interface React du module (absente dans les tests). */
export interface DrawingsUi {
  DrawOptions: ComponentType<{ engine: MapEngine }>;
  TextOptions: ComponentType<{ engine: MapEngine }>;
  /** Surcouche de l'éditeur de texte en place. */
  NoteEditorOverlay: ComponentType<{ engine: MapEngine }>;
  DrawingInspector: ComponentType<InspectorSectionProps>;
  NoteInspector: ComponentType<InspectorSectionProps>;
}

export interface RegisterOptions {
  ui?: DrawingsUi | null;
  /** Mémoire des réglages (défaut : `localStorage`). */
  storage?: SettingsStorage | null;
}

export function registerDrawings(engine: MapEngine, opts: RegisterOptions = {}): () => void {
  const ui = opts.ui ?? null;
  const partial = {
    engine,
    settings: createDrawSettings(opts.storage === undefined ? undefined : opts.storage),
    drawings: persistenceOf<DrawingData>(engine, DRAWINGS_COLLECTION),
    notes: persistenceOf<NoteData>(engine, NOTES_COLLECTION),
  };
  const rt: DrawingsRuntime = { ...partial, editor: new NoteEditor(partial) };

  const cleanups: (() => void)[] = [
    attachRuntime(rt),
    engine.registerKind(drawingKind(rt)),
    engine.registerKind(noteKind(rt)),
    // Une police arrivée (catalogue, système) : les textes se remesurent et se redessinent
    onFontsLoaded(() => engine.refreshCollection(NOTES_COLLECTION)),
    engine.registerTool({
      id: DRAW_TOOL_ID,
      label: 'Dessin',
      icon: Pencil,
      shortcut: { code: 'KeyP', label: 'P' },
      order: 10,
      available: canAnnotate,
      create: () => new DrawTool(rt),
      ...(ui ? { options: ui.DrawOptions } : {}),
    }),
    engine.registerTool({
      id: TEXT_TOOL_ID,
      label: 'Texte',
      icon: Type,
      shortcut: { code: 'KeyT', label: 'T' },
      order: 11,
      available: canAnnotate,
      create: () => new TextTool(rt),
      ...(ui ? { options: ui.TextOptions } : {}),
    }),
    mountLiveStrokes(engine),
    mountNoteResolution(engine),
  ];
  if (ui)
    cleanups.push(
      engine.registerInspectorSection({
        id: 'drawings:drawing',
        title: 'Trait',
        order: 20,
        appliesTo: (es) => es.length > 0 && es.every((e) => e.kind.id === DRAWING_KIND),
        component: ui.DrawingInspector,
      }),
      engine.registerInspectorSection({
        id: 'drawings:note',
        title: 'Texte',
        order: 20,
        appliesTo: (es) => es.length > 0 && es.every((e) => e.kind.id === NOTE_KIND),
        component: ui.NoteInspector,
      }),
      // Champ d'édition des textes, posé sur la carte (rendu libre)
      engine.registerOverlay({
        id: 'drawings:note-editor',
        slot: 'none',
        available: canAnnotate,
        component: ui.NoteEditorOverlay,
      }),
    );

  return () => {
    rt.editor.cancel();
    for (const c of cleanups.toReversed()) c();
  };
}

// ─── Tracés en cours des autres ──────────────────────────────────────────────

/** Fantômes des tracés en cours, dessinés dans le plan `live`, posés sans clignoter. */
export function mountLiveStrokes(engine: MapEngine): () => void {
  const live = engine.live;
  if (!live) return () => undefined;
  const ghosts = new LiveStrokes();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const wait = ghosts.nextExpiry(engine.now());
    if (wait === null) return;
    timer = setTimeout(() => {
      timer = null;
      if (ghosts.expire(engine.now())) engine.invalidate();
      schedule();
    }, wait + 20);
  };

  const unStroke = live.onStroke((ev) => {
    if (ghosts.receive(ev, engine.now())) engine.invalidate();
    schedule();
  });

  // Le dessin enregistré arrive : le fantôme de son auteur se pose
  const unStore = engine.store.subscribe((s, prev) => {
    const next = s.collections[DRAWINGS_COLLECTION];
    const before = prev.collections[DRAWINGS_COLLECTION];
    if (next === before || !next || !ghosts.size) return;
    const now = engine.now();
    let changed = false;
    for (const [id, d] of next)
      if (!before?.has(id) && ghosts.arrived(d as DrawingData, now)) changed = true;
    if (changed) {
      engine.invalidate();
      schedule();
    }
  });

  const unMount = engine.whenMounted(() => {
    const pixi = engine.pixi;
    const plane = engine.plane('live');
    if (!pixi || !plane) return;
    const root: Container = new pixi.Container({ label: 'live-strokes' });
    plane.addChild(root);
    const drawn = new Map<string, { g: Graphics; version: number }>();
    let seen = -1;

    const sync = () => {
      if (ghosts.version === seen) return;
      seen = ghosts.version;
      const alive = new Set<string>();
      for (const ghost of ghosts.list()) {
        alive.add(ghost.key);
        let entry = drawn.get(ghost.key);
        if (!entry) {
          entry = { g: new pixi.Graphics({ label: `stroke:${ghost.key}` }), version: -1 };
          root.addChild(entry.g);
          drawn.set(ghost.key, entry);
        }
        if (entry.version === ghost.version) continue;
        entry.version = ghost.version;
        drawGhost(entry.g, ghost, pixi);
      }
      for (const [key, entry] of drawn) {
        if (alive.has(key)) continue;
        destroyDisplay(entry.g);
        drawn.delete(key);
      }
    };
    const unFrame = engine.onFrame(() => {
      sync();
      return false;
    });
    return () => {
      unFrame();
      drawn.clear();
      destroyDisplay(root);
    };
  });

  return () => {
    if (timer) clearTimeout(timer);
    unStroke();
    unStore();
    unMount();
    ghosts.clear();
  };
}

/** Tracé en cours d'un autre : forme (origine, extrémité) ou main levée. */
function drawGhost(g: Graphics, ghost: Ghost, pixi: NonNullable<MapEngine['pixi']>) {
  g.clear();
  const c = pixiColor(pixi, ghost.color);
  const stroke = { width: Math.max(0.5, ghost.width), color: c.color, alpha: c.alpha };
  const f = ghost.flat;
  if (ghost.tool !== 'line' && ghost.tool !== 'rectangle' && ghost.tool !== 'circle') {
    drawFlatPolyline(g, f, Math.floor(f.length / 2), stroke);
    return;
  }
  if (f.length < 4) return;
  const shape = shapeOf({
    tool: ghost.tool,
    points: [
      { x: f[0]!, y: f[1]! },
      { x: f[2]!, y: f[3]! },
    ],
    width: ghost.width,
    closed: ghost.tool !== 'line',
  });
  drawShape(g, shape, stroke, ghost.fill ? pixiColor(pixi, ghost.fill) : null);
}

// ─── Netteté des textes ──────────────────────────────────────────────────────

/** Les textes se refont à la résolution du palier de zoom (pas à chaque image). */
function mountNoteResolution(engine: MapEngine): () => void {
  let bucket = 0;
  return engine.camera.onChange(() => {
    const next = Math.ceil(Math.log2(Math.max(1e-3, engine.camera.zoom)));
    if (next === bucket) return;
    bucket = next;
    refreshNoteResolutions(engine);
    engine.invalidate();
  });
}
