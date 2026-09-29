/**
 * Sorte d'entité `note` (couche `notes`, docs/carte.md § 10) : un texte posé sur la carte.
 * Déplacer, taille (la taille de la police suit les poignées, proportions gardées), dupliquer,
 * ordre et calque, supprimer ; double clic : édition en place. Auteur ou MJ.
 *
 * Rendu : un `Text` Pixi par texte, liseré sombre pour rester lisible sur n'importe quel fond,
 * dans une boîte mesurée comme le moteur la mesure (`text-layout.ts`). Sa résolution suit le
 * zoom par paliers (net de près, léger de loin), sans re-rendu à chaque image.
 */
import type * as Pixi from 'pixi.js';
import type { Text } from 'pixi.js';
import { authorOrGm, field, type EntityKind } from '../../engine/entities/entity-kind';
import type { MapEntity } from '../../engine/entities/entity';
import type { EntityGeometry } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import { annotationMenuItem } from './drawing-kind';
import { FONT_SIZE_RANGE } from './palette';
import { pixiColor } from './render';
import type { DrawingsRuntime } from './runtime';
import { layoutNote, LINE_HEIGHT, resolveFontFamily } from './text-layout';
import { NOTE_KIND, NOTES_COLLECTION, type NoteData } from './types';

/** Boîte d'un texte : `pos` est sur la ligne de base de la première ligne. */
export function noteGeometry(n: NoteData): EntityGeometry {
  const l = layoutNote(n.text, n.fontSize, n.fontFamily);
  const width = Math.max(l.width, n.fontSize * 0.5);
  const top = n.pos.y - l.baseline;
  return {
    x: n.pos.x + width / 2,
    y: top + l.height / 2,
    width,
    height: l.height,
    rotation: 0,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Texte après un glisser (translation) ou les poignées (nouvelle taille de police). */
export function applyNoteGeometry(n: NoteData, next: EntityGeometry): NoteData {
  const g = noteGeometry(n);
  if (Math.abs(next.width - g.width) < 1e-6 && Math.abs(next.height - g.height) < 1e-6) {
    const dx = next.x - g.x;
    const dy = next.y - g.y;
    if (!dx && !dy) return n;
    return { ...n, pos: { x: round2(n.pos.x + dx), y: round2(n.pos.y + dy) } };
  }
  const k = g.height > 1e-6 ? next.height / g.height : 1;
  const fontSize = Math.min(
    1000,
    Math.max(FONT_SIZE_RANGE.min / 2, Math.round(n.fontSize * k * 10) / 10),
  );
  const l = layoutNote(n.text, fontSize, n.fontFamily);
  return {
    ...n,
    fontSize,
    pos: {
      x: round2(next.x - next.width / 2),
      y: round2(next.y - next.height / 2 + l.baseline),
    },
  };
}

/** Épaisseur du liseré qui détache le texte du fond. */
export const noteOutline = (fontSize: number) => Math.max(1.5, fontSize * 0.08);

/** Résolution du texte pour ce zoom : par paliers (puissances de 2), texture bornée. */
export function noteResolution(zoom: number, box: { width: number; height: number }): number {
  const dpr =
    typeof window !== 'undefined' ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 1;
  const wanted = Math.max(0.25, Math.min(8, 2 ** Math.ceil(Math.log2(Math.max(1e-3, zoom * dpr)))));
  const largest = Math.max(1, box.width, box.height);
  return Math.max(0.25, Math.min(wanted, 4096 / largest));
}

interface NoteRender {
  text: Text;
  /** Donnée dessinée (pour ne refaire le texte que si ce qui se voit a changé). */
  drawn: NoteData;
}

function paint(
  entity: MapEntity<NoteData>,
  text: Text,
  zoom: number,
  background: number,
  pixi: typeof Pixi,
) {
  const n = entity.data;
  const g = noteGeometry(n);
  const outline = noteOutline(n.fontSize);
  const color = pixiColor(pixi, n.color);
  const content = n.text.replace(/<br\s*\/?>/gi, '\n');
  if (text.text !== content) text.text = content;
  text.style = {
    fontFamily: resolveFontFamily(n.fontFamily),
    fontSize: n.fontSize,
    lineHeight: LINE_HEIGHT * n.fontSize,
    fill: { color: color.color, alpha: color.alpha },
    stroke: { color: background, width: outline, join: 'round', alpha: 0.85 * color.alpha },
  };
  text.resolution = noteResolution(zoom, g);
  // Même boîte que le moteur : le liseré déborde de sa moitié
  text.position.set(-g.width / 2 - outline / 2, -g.height / 2 - outline / 2);
}

const looksDifferent = (a: NoteData, b: NoteData) =>
  a.text !== b.text ||
  a.color !== b.color ||
  a.fontSize !== b.fontSize ||
  a.fontFamily !== b.fontFamily;

export function noteKind(rt: DrawingsRuntime): EntityKind<NoteData> {
  return {
    id: NOTE_KIND,
    label: 'Texte',
    collection: NOTES_COLLECTION,
    capabilities: ['select', 'move', 'resize', 'duplicate', 'delete', 'inspect', 'order'],
    plane: 'annotations',
    stacking: {
      arrangeKind: 'note',
      layerId: field<NoteData, string | null>('layerId'),
      z: field<NoteData, number>('z'),
      optional: true,
      defaultRole: 'ground',
    },
    display: 'notes',
    keepAspectRatio: true,
    minSize: 6,
    geometry: noteGeometry,
    applyGeometry: applyNoteGeometry,
    name: () => null,
    can: authorOrGm(),
    render(entity, ctx) {
      const text = new ctx.pixi.Text({ text: '', label: 'note' });
      entity.display!.addChild(text);
      paint(entity, text, ctx.zoom, ctx.theme.background, ctx.pixi);
      entity.renderState.note = { text, drawn: entity.data } satisfies NoteRender;
    },
    update(entity, ctx, change) {
      const r = entity.renderState.note as NoteRender | undefined;
      if (!r || r.text.destroyed) return;
      if (change.previous && looksDifferent(r.drawn, entity.data)) {
        paint(entity, r.text, ctx.zoom, ctx.theme.background, ctx.pixi);
        r.drawn = entity.data;
      } else if (change.previous) {
        // Déplacé seulement : le conteneur suit, le texte ne se refait pas
        r.drawn = entity.data;
      }
    },
    dispose(entity) {
      entity.renderState = {};
    },
    duplicate: (n, offset, ctx) => ({
      ...n,
      pos: { x: round2(n.pos.x + offset.x), y: round2(n.pos.y + offset.y) },
      createdBy: ctx.viewer.userId,
    }),
    doubleClick(entity, ctx) {
      if (!entity.kind.can('move', entity, ctx.viewer)) return false;
      rt.editor.openExisting(entity as unknown as MapEntity);
      return true;
    },
    actions: (entities) =>
      annotationMenuItem(rt.engine, entities as unknown as readonly MapEntity[]),
    persistence: rt.notes,
  };
}

/** Résolution des textes rendus, au palier du zoom (appelé quand la caméra change). */
export function refreshNoteResolutions(engine: MapEngine) {
  for (const e of engine.entitiesOfKind(NOTE_KIND)) {
    const r = e.renderState.note as NoteRender | undefined;
    if (!r || r.text.destroyed) continue;
    const res = noteResolution(engine.camera.zoom, e.geometry);
    if (r.text.resolution !== res) r.text.resolution = res;
  }
}
