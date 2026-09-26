// Communications (comlink) — état de brouillage PARTAGÉ de la salle, PAR PERSONNAGE, posé par le
// MJ via son overlay de contrôle (comms-mj.tsx) et lu en temps réel par tous (api.sharedState).
// L'état est une carte JSON { '*': niveau, [persoId]: niveau } : '*' = niveau posé "en lot" pour
// tout le monde, une entrée par personnage = override individuel (prioritaire). Trois niveaux,
// effets limités aux "senseurs" du bundle (radar + overlay de localisation) — jamais le chat ni
// la voix :
//   connecte → tout est normal
//   faible   → radar peuplé d'échos fantômes, coordonnées partiellement scramblées
//   brouille → radar mort ("BROUILLÉ"), coordonnées illisibles
import React, { useEffect, useState } from 'react';

export type CommsLevel = 'connecte' | 'faible' | 'brouille';
/** Clé = persoId, '*' = tout le monde (lot). */
export type CommsMap = Record<string, CommsLevel>;

const COMMS_KEY = 'commsJam';

export const commsLevelOf = (v: unknown): CommsLevel =>
  v === 'faible' || v === 'brouille' ? v : 'connecte';

/** Désérialise la carte des niveaux (le canal partagé ne transporte que des scalaires → JSON). */
export const parseCommsMap = (v: unknown): CommsMap => {
  if (typeof v !== 'string' || !v) return {};
  try {
    const raw = JSON.parse(v) as Record<string, unknown>;
    const map: CommsMap = {};
    for (const [k, lvl] of Object.entries(raw)) map[k] = commsLevelOf(lvl);
    return map;
  } catch {
    return {};
  }
};

/** Niveau effectif d'un personnage : override individuel, sinon le lot ('*'), sinon connecte. */
export const effectiveLevel = (map: CommsMap, persoId?: string | null): CommsLevel =>
  commsLevelOf((persoId ? map[persoId] : undefined) ?? map['*']);

export const subscribeCommsMap = (api: any, cb: (map: CommsMap) => void): (() => void) =>
  api.sharedState.subscribe(COMMS_KEY, (v: unknown) => cb(parseCommsMap(v)));

export const writeCommsMap = (api: any, map: CommsMap): Promise<void> =>
  api.sharedState.set(COMMS_KEY, JSON.stringify(map));

/** Abonnement au niveau de brouillage EFFECTIF de son propre personnage (radar, overlay joueur). */
export const subscribeComms = (api: any, cb: (level: CommsLevel) => void): (() => void) => {
  const { persoId } = api.getGameState();
  return subscribeCommsMap(api, (map) => cb(effectiveLevel(map, persoId)));
};

// ── Barres de signal (adapté de thegridcn/signal-indicator, styles inline) ──────────────────────

const LEVEL_DISPLAY: Record<CommsLevel, { color: string; strength: number; label: string }> = {
  connecte: { color: '#4ade80', strength: 100, label: 'COMLINK' },
  faible: { color: '#f59e0b', strength: 35, label: 'INTERF.' },
  brouille: { color: '#ef4444', strength: 0, label: 'BROUILLÉ' },
};

export const SignalBars = ({ level }: { level: CommsLevel }) => {
  const { color, strength, label } = LEVEL_DISPLAY[level];
  const bars = 5;
  const filled = Math.round((strength / 100) * bars);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* keyframes embarquées : le composant est utilisé dans plusieurs overlays (joueur + MJ). */}
      <style>{'@keyframes sw-loc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }'}</style>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color,
        boxShadow: `0 0 5px ${color}`,
        animation: level === 'brouille' ? 'sw-loc-pulse 1.2s ease-in-out infinite' : undefined,
      }} />
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} style={{
            width: 3, borderRadius: '1px 1px 0 0',
            height: 4 + ((i + 1) / bars) * 8,
            background: i < filled ? color : 'rgba(255,255,255,0.15)',
            boxShadow: i < filled ? `0 0 3px ${color}` : undefined,
          }} />
        ))}
      </span>
      <span style={{ fontSize: 8, letterSpacing: '0.12em', color }}>{label}</span>
    </span>
  );
};

// ── Scramble permanent (adapté de motion-primitives/text-scramble, sans dépendance motion) ──────
// Contrairement à l'original (animation one-shot qui converge vers le texte), celui-ci brouille EN
// PERMANENCE : à chaque tick, une fraction `intensity` des caractères est remplacée par du bruit —
// réalisme d'un affichage d'instrument perturbé, jamais stable.

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&';

export const PermanentScramble = ({ text, intensity, style }: {
  text: string;
  /** Fraction 0..1 des caractères remplacés par du bruit à chaque tick (1 = illisible). */
  intensity: number;
  style?: React.CSSProperties;
}) => {
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    if (intensity <= 0) { setDisplay(text); return; }
    const tick = () => {
      let out = '';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') { out += ' '; continue; }
        out += Math.random() < intensity
          ? SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
          : text[i];
      }
      setDisplay(out);
    };
    tick();
    const interval = setInterval(tick, 80);
    return () => clearInterval(interval);
  }, [text, intensity]);
  return <span style={style}>{display}</span>;
};
