/**
 * Module « dessins » (docs/carte.md § 10, Dessins et textes) : main levée, ligne, rectangle,
 * ellipse, gomme (P), textes (T), tracés en cours des autres en direct. Le branchement est dans
 * `engine/register.ts` ; ici, on lui passe l'interface React (`ui/`).
 */
import { DrawOptions } from './ui/draw-options';
import { DrawingInspector, NoteInspector } from './ui/drawing-inspector';
import { NoteEditorOverlay } from './ui/note-editor-overlay';
import { TextOptions } from './ui/text-options';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerDrawings } from './engine/register';

export const drawingsFeature: MapFeature = {
  id: 'drawings',
  register: (engine) =>
    registerDrawings(engine, {
      ui: { DrawOptions, TextOptions, NoteEditorOverlay, DrawingInspector, NoteInspector },
    }),
};
