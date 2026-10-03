/**
 * Module « dessins » (docs/carte.md § 10, Dessins et textes) : main levée, ligne, rectangle,
 * ellipse, gomme (P), textes (T), tracés en cours des autres en direct. Le branchement est dans
 * `register.ts` ; ici, on lui passe l'interface React (`components/map/drawings`).
 */
import { DrawOptions } from '@/components/map/drawings/draw-options';
import { DrawingInspector, NoteInspector } from '@/components/map/drawings/drawing-inspector';
import { NoteEditorOverlay } from '@/components/map/drawings/note-editor-overlay';
import { TextOptions } from '@/components/map/drawings/text-options';
import type { MapModule } from '../../engine/map-engine';
import { registerDrawings } from './register';

export const drawingsModule: MapModule = {
  id: 'drawings',
  register: (engine) =>
    registerDrawings(engine, {
      ui: { DrawOptions, TextOptions, NoteEditorOverlay, DrawingInspector, NoteInspector },
    }),
};
