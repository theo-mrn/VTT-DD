/**
 * Mixage des voix en mode Proximité (docs/voix.md § 4), sans React ni Web Audio : pour chaque
 * participant qui parle, son volume, sa position gauche-droite et son étouffement, vus depuis
 * l'auditeur. Mode Table, auditeur ou orateur sans token : pas d'entrée, la voix est entendue
 * comme dans un appel (le MJ hors token parle « partout », le narrateur).
 */
import type { MapVoice } from '@vtt/contracts';
import { muffle } from '@/lib/audio/engine/spatial-player';
import type { Point } from '@/lib/map/engine/geometry';
import type { VoiceMix } from '@/lib/voice/session';
import { wallsBetween } from '../../sounds/engine/hearing';

/** Volume à `cells` cases : plein jusqu'à la portée claire, puis courbe jusqu'au silence. */
export function proximityGain(cells: number, clearRange: number, maxRange: number): number {
  if (!(cells > clearRange)) return 1;
  if (cells >= maxRange) return 0;
  const t = (cells - clearRange) / (maxRange - clearRange);
  return 1 - t * t;
}

export interface Speaker {
  userId: string;
  /** Position de son token sur la scène ; null : pas de token (entendu partout). */
  at: Point | null;
}

export function voiceMixes(input: {
  voice: MapVoice;
  listener: Point | null;
  /** Pixels du monde par case (`scenePixelsPerUnit`). */
  pixelsPerCell: number;
  /** Segments qui arrêtent le son (`soundWalls`). */
  walls: Float64Array;
  speakers: readonly Speaker[];
}): Map<string, VoiceMix> {
  const mixes = new Map<string, VoiceMix>();
  const { voice, listener, pixelsPerCell, walls } = input;
  if (voice.mode !== 'proximity' || !listener || !(pixelsPerCell > 0)) return mixes;
  const reach = voice.maxRange * pixelsPerCell;
  for (const { userId, at } of input.speakers) {
    if (!at) continue;
    const dx = at.x - listener.x;
    const distance = Math.hypot(dx, at.y - listener.y);
    let gain = proximityGain(distance / pixelsPerCell, voice.clearRange, voice.maxRange);
    // Murs comptés seulement à portée : au-delà, la voix est muette de toute façon
    const { gain: kept, cutoffHz } =
      gain > 0 ? muffle(wallsBetween(listener, at, walls)) : muffle(0);
    gain *= kept;
    const pan = Math.max(-1, Math.min(1, dx / (0.6 * reach)));
    mixes.set(userId, { gain, pan, cutoffHz });
  }
  return mixes;
}
