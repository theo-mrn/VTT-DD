/**
 * Presse-papiers de la carte (⌘C, ⌘V) : des copies d'entités (objets, PNJ, dessins, notes, zones
 * sonores, portails…), avec leur centre. Un seul pour l'onglet, partagé par toutes les scènes :
 * on copie sur une scène et on colle sur une autre de la même campagne. Rien n'est écrit tant
 * qu'on ne colle pas : coller passe par la duplication de chaque sorte (`EntityKind.duplicate`).
 */
import type { Point } from './geometry';
import type { MapDto } from '../store/map-store';

export interface ClipboardItem {
  /** Sorte d'entité (`EntityKind.id`). */
  kindId: string;
  data: MapDto;
  /** Centre de l'entité au moment de la copie (coordonnées de sa carte). */
  center: Point;
}

export interface MapClipboard {
  campaignId: string;
  /** Carte d'origine : coller ailleurs recale le calque, et un PNJ est copié depuis elle. */
  mapId: string;
  items: readonly ClipboardItem[];
}

let contenu: MapClipboard | null = null;

export const mapClipboard = {
  read: (): MapClipboard | null => contenu,
  write(c: MapClipboard) {
    contenu = c;
  },
  /** Quelque chose à coller dans cette campagne. */
  has: (campaignId: string) => !!contenu && contenu.campaignId === campaignId,
};

/** Centre d'un groupe de points (moyenne). */
export function centerOf(points: readonly Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}
