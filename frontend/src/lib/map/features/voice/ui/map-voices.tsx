'use client';

/**
 * Voix de proximité (docs/voix.md § 4) : en mode Proximité, la position de l'auditeur et celles
 * des orateurs sont relues à chaque image de la carte, et le mixage (`voiceMixes`) transmis à la
 * session vocale 15 fois par seconde au plus. Mode Table ou voix coupée : rien ne tourne, toutes
 * les voix sont entendues comme dans un appel.
 */
import { DEFAULT_MAP_VOICE, scenePixelsPerUnit, type MapGrid, type MapVoice } from '@vtt/contracts';
import { useEffect, useMemo, useRef } from 'react';
import { useMapEngine, useMapState } from '@/components/map/engine-context';
import { getVoice, useVoice } from '@/lib/voice/hooks';
import { soundWalls } from '../../sounds/engine/hearing';
import { speakersOf, voiceListener } from '../engine/hearing';
import { voiceMixes } from '../engine/mix';

/** Écart minimal entre deux mixages transmis. */
const MIX_GAP_MS = 66;

export function MapVoices() {
  const engine = useMapEngine();
  const voice = useMapState((s) => (s.scene?.voice as MapVoice | undefined) ?? DEFAULT_MAP_VOICE);
  const pixelsPerCell = useMapState((s) =>
    scenePixelsPerUnit(
      s.scene as { grids?: MapGrid[]; width?: number | null } | null,
      s.settings as { pixelsPerUnit?: number } | null,
    ),
  );
  const obstacles = useMapState((s) => s.collections.obstacles);
  const walls = useMemo(() => soundWalls(obstacles?.values() ?? []), [obstacles]);
  const connected = useVoice((s) => s.status === 'connected');
  const participants = useVoice((s) => s.participants);

  const latest = useRef({ voice, pixelsPerCell, walls, participants });
  latest.current = { voice, pixelsPerCell, walls, participants };
  const proximity = connected && voice.mode === 'proximity';

  useEffect(() => {
    if (!proximity) {
      getVoice().setMixes(new Map());
      return;
    }
    const me = engine.viewer.userId;
    let lastAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mix = () => {
      timer = null;
      lastAt = performance.now();
      const { voice, pixelsPerCell, walls, participants } = latest.current;
      const others = participants.filter((p) => p.speaker && p.userId !== me).map((p) => p.userId);
      getVoice().setMixes(
        voiceMixes({
          voice,
          listener: voiceListener(engine),
          pixelsPerCell,
          walls,
          speakers: speakersOf(engine, others),
        }),
      );
    };
    mix();
    const off = engine.onFrame((now) => {
      if (timer) return;
      const wait = lastAt + MIX_GAP_MS - now;
      if (wait <= 0) mix();
      else timer = setTimeout(mix, wait);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
      getVoice().setMixes(new Map());
    };
  }, [engine, proximity]);

  // Réglages, murs ou participants changés sans image de la carte : un mixage tout de suite
  useEffect(() => {
    if (proximity) engine.invalidate();
  }, [engine, proximity, voice, pixelsPerCell, walls, participants]);

  return null;
}
