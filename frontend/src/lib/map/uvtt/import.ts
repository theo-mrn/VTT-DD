/**
 * Import d'un fichier UVTT en nouvelle scène (docs/import-uvtt.md § 3) : tout passe par les
 * routes existantes. Fond envoyé comme un fond importé (réduit à 4096 px), scène avec sa grille
 * de jeu, puis murs, portes et lumières par lots (`/batch`, une transaction par lot). Un échec
 * après la création de la scène la supprime : jamais de scène à moitié importée.
 */
import {
  MAP_BATCH_MAX,
  type CreateMapLight,
  type CreateMapObstacle,
  type MapLayerBatchResult,
  type MapScene,
} from '@vtt/contracts';
import { api } from '@/lib/api';
import { newGrid } from '@/lib/map/features/grid/engine/model';
import { mapsApi } from '@/lib/map/api';
import { prepareUpload } from '@/lib/uploads/prepare';
import { uploadFile } from '@/lib/uploads/uploader';
import { convertUvtt, uvttImage, uvttSize, type UvttDocument } from './convert';

export interface UvttImportOptions {
  name: string;
  /** Dossier de scènes de destination. */
  groupId?: string | null;
  /** Murs des objets (rochers, colonnes). */
  objectWalls: boolean;
  /** Lumières du fichier (déjà écartées si les ombres sont peintes). */
  lights: boolean;
  /** Avancement global, de 0 à 1. */
  onProgress?: (progress: number) => void;
}

export async function importUvtt(
  campaignId: string,
  doc: UvttDocument,
  fileName: string,
  o: UvttImportOptions,
): Promise<MapScene> {
  const progress = o.onProgress ?? (() => {});
  progress(0);

  // Fond : préparé ici pour connaître sa taille réelle, qui fixe l'échelle de tout le reste
  const ready = await prepareUpload(uvttImage(doc, fileName), 'map-background');
  const bitmap = await createImageBitmap(ready);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
  const scene = convertUvtt(doc, width / uvttSize(doc).width);
  const url = await uploadFile({ kind: 'campaign', id: campaignId }, 'map-background', ready, {
    onProgress: (p) => progress(0.6 * p.progress),
  });

  // La grille est souvent dessinée dans l'image : grille de jeu cachée aux joueurs
  const grid = newGrid([], scene.cellPx)!;
  const created = await mapsApi.create(campaignId, {
    name: o.name,
    backgroundUrl: url,
    width,
    height,
    grids: [{ ...grid, visibleToPlayers: false }],
    ...(o.groupId ? { groupId: o.groupId } : {}),
  });

  const obstacles = [...scene.walls, ...(o.objectWalls ? scene.objectWalls : []), ...scene.doors];
  const lights = o.lights ? scene.lights : [];
  const total =
    Math.ceil(obstacles.length / MAP_BATCH_MAX) + Math.ceil(lights.length / MAP_BATCH_MAX);
  let sent = 0;
  const base = `/v1/campaigns/${encodeURIComponent(campaignId)}/maps/${encodeURIComponent(created.id)}`;
  const send = async (
    path: 'obstacles' | 'lights',
    items: (CreateMapObstacle | CreateMapLight)[],
  ) => {
    for (let i = 0; i < items.length; i += MAP_BATCH_MAX) {
      await api<MapLayerBatchResult<unknown>>(`${base}/${path}/batch`, {
        method: 'POST',
        body: JSON.stringify({ create: items.slice(i, i + MAP_BATCH_MAX) }),
      });
      progress(0.6 + 0.4 * (++sent / Math.max(total, 1)));
    }
  };
  try {
    await send('obstacles', obstacles);
    await send('lights', lights);
  } catch (error) {
    await mapsApi.remove(campaignId, created.id).catch(() => {});
    throw error;
  }
  progress(1);
  return created;
}
