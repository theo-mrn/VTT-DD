'use client';

/**
 * Son de la carte (docs/carte.md § 10, Zones sonores) :
 *
 * - **Écoute** : l'auditeur (le token du joueur, `listenerOf`) et les zones lancées de la scène
 *   passent au moteur audio (`useSpatialAudio`), avec le nombre de murs entre l'auditeur et
 *   chaque zone. La position est relue à chaque image du moteur, transmise à 15 Hz au plus.
 * - **Dépôt** (MJ) : un son glissé depuis la bibliothèque, ou un fichier audio de l'ordinateur
 *   (envoyé dans la bibliothèque), pose une zone au point de dépôt.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { useAudioLibrary, useSpatialAudio, type SpatialSource } from '@/lib/audio';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { displayOf, isDisplayed } from '@/lib/map/engine/planes';
import { listenerOf, soundWalls, wallsBetween } from '@/lib/map/modules/sounds/hearing';
import { hasSound, placeZone } from '@/lib/map/modules/sounds/kind';
import {
  audioFileOf,
  DEFAULT_SOUND,
  readSoundDrag,
  SOUND_DRAG_TYPE,
  SOUND_ZONES,
  type SoundZoneData,
} from '@/lib/map/modules/sounds/model';
import { soundContextOf } from '@/lib/map/modules/sounds/register';
import { useMapEngine, useMapHost, useMapState } from '../engine-context';

/** Écart minimal entre deux positions transmises au moteur audio. */
const LISTENER_GAP_MS = 66;

export function MapSounds() {
  const engine = useMapEngine();
  const hostRef = useMapHost();
  const campaignId = useMapState((s) => s.campaignId);
  const listener = useListener(engine);
  const zones = useMapState((s) => s.collections[SOUND_ZONES]);
  const obstacles = useMapState((s) => s.collections.obstacles);
  const enabled = useMapState((s) => isDisplayed(displayOf(s.scene), 'music'));

  const walls = useMemo(() => soundWalls(obstacles?.values() ?? []), [obstacles]);
  const sources = useMemo<SpatialSource[]>(() => {
    const out: SpatialSource[] = [];
    for (const dto of zones?.values() ?? []) {
      const z = dto as SoundZoneData;
      if (!z.active || !hasSound(z)) continue;
      // Murs comptés seulement à portée : au-delà, la zone est muette de toute façon
      const near = listener && Math.hypot(z.pos.x - listener.x, z.pos.y - listener.y) < z.radius;
      out.push({
        id: `zone:${z.id}`,
        assetId: z.assetId ?? undefined,
        url: z.assetId ? undefined : (z.url ?? undefined),
        x: z.pos.x,
        y: z.pos.y,
        radius: z.radius,
        volume: z.volume,
        walls: near ? wallsBetween(listener, z.pos, walls) : 0,
      });
    }
    return out;
  }, [zones, walls, listener]);

  useSpatialAudio(campaignId, { listener, sources, enabled });
  useSoundDrop(engine, campaignId, hostRef);
  return null;
}

/** Position de l'auditeur, relue à chaque image du moteur, transmise à 15 Hz au plus. */
function useListener(engine: MapEngine): Point | null {
  const [listener, setListener] = useState<Point | null>(() => listenerOf(engine));
  useEffect(() => {
    let shown = listenerOf(engine);
    let pending = shown;
    let lastAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const commit = () => {
      timer = null;
      lastAt = performance.now();
      shown = pending;
      setListener(shown);
    };
    commit();
    const off = engine.onFrame((now) => {
      const next = listenerOf(engine);
      const moved =
        Boolean(next) !== Boolean(shown) ||
        (next && shown && Math.abs(next.x - shown.x) + Math.abs(next.y - shown.y) >= 1);
      pending = next;
      if (!moved || timer) return;
      const wait = lastAt + LISTENER_GAP_MS - now;
      if (wait <= 0) commit();
      else timer = setTimeout(commit, wait);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [engine]);
  return listener;
}

/** MJ : un son de la bibliothèque ou un fichier audio lâché sur la carte y pose une zone. */
function useSoundDrop(
  engine: MapEngine,
  campaignId: string,
  hostRef: RefObject<HTMLElement | null>,
) {
  const gm = isGm(engine.viewer);
  const library = useAudioLibrary(campaignId, { enabled: gm });
  const latest = useRef(library);
  latest.current = library;

  useEffect(() => {
    const host = hostRef.current;
    if (!gm || !host) return;
    const accepts = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes(SOUND_DRAG_TYPE) || types.includes('Files');
    };
    const onOver = (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!accepts(e) || !e.dataTransfer) return;
      e.preventDefault();
      const ctx = soundContextOf(engine);
      if (!ctx) return;
      const box = host.getBoundingClientRect();
      const at = engine.camera.screenToWorld({ x: e.clientX - box.left, y: e.clientY - box.top });
      const place = (assetId: string, name: string) => {
        placeZone(ctx, at, { ...DEFAULT_SOUND, assetId, name, free: e.altKey });
        engine.invalidate();
      };
      const dragged = readSoundDrag(e.dataTransfer.getData(SOUND_DRAG_TYPE));
      if (dragged) {
        const asset = latest.current.assets.find((a) => a.id === dragged.assetId);
        if (asset?.source === 'youtube') {
          toast.error('Un son YouTube ne peut pas devenir une zone sonore.');
          return;
        }
        place(dragged.assetId, asset?.name ?? dragged.name);
        return;
      }
      const file = audioFileOf(e.dataTransfer.files);
      if (!file) return;
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Son';
      const pending = toast.loading(`Envoi de « ${name} »…`);
      latest.current
        .upload(file, { name, kind: 'ambience' })
        .then((asset) => {
          toast.dismiss(pending);
          place(asset.id, asset.name);
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Envoi impossible', { id: pending });
        });
    };
    host.addEventListener('dragover', onOver);
    host.addEventListener('drop', onDrop);
    return () => {
      host.removeEventListener('dragover', onOver);
      host.removeEventListener('drop', onDrop);
    };
  }, [engine, gm, hostRef]);
}
