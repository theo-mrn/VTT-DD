/**
 * Types et constantes du module « dessins » (docs/carte.md § 10, Dessins et textes).
 */
import type { MapDrawing, MapNote } from '@vtt/contracts';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import type { MapDto } from '@/lib/map/store/map-store';

/** Un dessin du magasin (couche `drawings`). */
export type DrawingData = MapDrawing & MapDto;
/** Un texte du magasin (couche `notes`). */
export type NoteData = MapNote & MapDto;

export const DRAWINGS_COLLECTION = 'drawings';
export const NOTES_COLLECTION = 'notes';
export const DRAWING_KIND = 'drawing';
export const NOTE_KIND = 'note';
export const DRAW_TOOL_ID = 'draw';
export const TEXT_TOOL_ID = 'text';

/** Toucher d'un tracé : demi-épaisseur + 6 px d'écran. */
export const HIT_SLOP_PX = 6;

/** Dessins et textes : tous les membres, sauf les spectateurs (miroir du backend). */
export const canAnnotate = (viewer: MapViewer) => viewer.role !== 'spectator';
