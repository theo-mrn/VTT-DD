// Overlay de localisation — toujours visible pour les joueurs en haut à droite de la carte
// (api.map.setOverlays). Affiche l'état du comlink (barres de signal), le secteur (2 premiers
// caractères alphanumériques du nom de la scène courante, en majuscules) et les coordonnées carte
// du personnage incarné. Sous brouillage (comms.tsx), les coordonnées se scramblent en PERMANENCE :
// partiellement en interférences, illisiblement en brouillage total. Rien n'est rendu sans
// personnage sur la carte.
import React, { useEffect, useState } from 'react';
import { subscribeComms, SignalBars, PermanentScramble, type CommsLevel } from './comms';

const ACCENT = '#ffe81f'; // jaune Star Wars (accent du thème)

// Fraction de caractères bruités par tick selon le niveau de comms.
const SCRAMBLE_INTENSITY: Record<CommsLevel, number> = { connecte: 0, faible: 0.35, brouille: 1 };

interface RadarCharacter {
  id: string;
  x: number;
  y: number;
}

/** Code secteur : 2 premiers caractères lettre/chiffre du nom de la carte, en majuscules.
 *  Exporté : l'overlay MJ (comms-mj.tsx) affiche le même secteur que les joueurs. */
export const sectorCode = (mapName: string): string => {
  const alnum = (mapName || '').replace(/[^\p{L}\p{N}]/gu, '');
  return alnum ? alnum.slice(0, 2).toUpperCase() : '--';
};

/** Fabrique le composant d'overlay — api capturé en closure (le rail ne passe aucune prop). */
export const makeLocationOverlay = (api: any) => function LocationOverlay() {
  const [chars, setChars] = useState<RadarCharacter[]>([]);
  const [comms, setComms] = useState<CommsLevel>('connecte');
  useEffect(() => api.map.subscribeCharacters(setChars), []);
  useEffect(() => subscribeComms(api, setComms), []);

  const { persoId } = api.getGameState();
  const self = persoId ? chars.find((c) => c.id === persoId) : undefined;
  if (!self) return null;

  const intensity = SCRAMBLE_INTENSITY[comms];

  return (
    <div
      style={{
        fontFamily: 'monospace',
        fontSize: 10,
        letterSpacing: '0.15em',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderRadius: 30,
        border: '1px solid rgba(255,232,31,0.0)',
        background: 'rgba(3,3,4,0.75)',
        color: 'rgba(255,255,255,0.8)',
      }}
    >
      <style>{'@keyframes sw-loc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }'}</style>
      <SignalBars level={comms} />
      <span style={{ opacity: 0.4 }}>|</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ACCENT }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, animation: 'sw-loc-pulse 2s ease-in-out infinite' }} />
        <PermanentScramble text={`Secteur : ${sectorCode(api.map.getMapName())}`} intensity={intensity} />
      </span>
      <span style={{ opacity: 0.4 }}>|</span>
      <PermanentScramble text={`X: ${Math.round(self.x)} Y: ${Math.round(self.y)}`} intensity={intensity} />
    </div>
  );
};
