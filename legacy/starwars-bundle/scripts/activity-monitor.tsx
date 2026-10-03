// Moniteur d'Activité (interception de flux) — onglet flottant joueur, 100 % autonome (AUCUNE
// intervention MJ). Le script lit les positions des tokens HOSTILES (PNJ + monstres, hors alliés)
// via api.map.subscribeCharacters, les regroupe en "secteurs d'activité" par proximité (clustering
// dynamique), et calcule pour chaque secteur un score : nombre d'ennemis + distance parcourue au
// dernier relevé. Effet de jeu : "le secteur Gamma vient de passer à 85 %, ça bouge vite". Sous
// brouillage comms (comms.tsx), les scores deviennent erratiques puis illisibles — comme le radar.
import React, { useEffect, useRef, useState } from 'react';
import { subscribeComms, type CommsLevel } from './comms';

const ACCENT = '#ffe81f';
const COLOR_CALM = '#4ade80';   // vert : calme
const COLOR_WARN = '#f59e0b';   // orange : activité
const COLOR_HOT = '#ef4444';    // rouge : pic

// ── Paramètres du modèle ─────────────────────────────────────────────────────
/** Deux ennemis à moins de CLUSTER_RADIUS px carte sont dans le même secteur. */
const CLUSTER_RADIUS = 350;
/** Pondération du score (0..100). Densité : chaque ennemi ; Mouvement : px parcourus depuis le
 *  dernier relevé, normalisés par MOVE_REF. Borné à 100. */
const P_DENSITY = 12;           // % par ennemi
const P_MOVE = 55;              // % pour un mouvement "de référence"
const MOVE_REF = 400;           // px carte = un déplacement franc en un relevé
/** Portée de détection (px carte) : distance joueur↔cluster au-delà de laquelle la barre de
 *  proximité est vide. À la distance 0 (sur le cluster) la barre est pleine. */
const DETECT_RANGE = 2000;
/** Cadence de relevé (ms) : on échantillonne les positions pour mesurer le mouvement entre 2 points. */
const SAMPLE_MS = 1500;
/** Lissage : le score affiché tend vers le score cible (évite les sauts brusques, effet "aiguille"). */
const SMOOTH = 0.25;

interface Enemy { id: string; x: number; y: number; }

interface Sector {
  id: string;              // stable entre relevés (id de l'ennemi "ancre" du cluster)
  label: string;           // "Secteur Alpha", ... (dérivé déterministe de l'ancre)
  count: number;
  cx: number; cy: number;  // centre du cluster
  score: number;           // 0..100 (cible, avant lissage)
}

const GREEK = ['Alpha', 'Bêta', 'Gamma', 'Delta', 'Epsilon', 'Zêta', 'Êta', 'Thêta', 'Iota', 'Kappa'];
/** Nom déterministe stable pour une ancre donnée (même ennemi-ancre → même nom entre relevés). */
const sectorName = (anchorId: string): string => {
  let h = 0;
  for (let i = 0; i < anchorId.length; i++) h = (h * 31 + anchorId.charCodeAt(i)) >>> 0;
  return `Secteur ${GREEK[h % GREEK.length]}`;
};

/** Clustering glouton par proximité : on rattache chaque ennemi au cluster dont le centre est à
 *  moins de CLUSTER_RADIUS, sinon il ouvre son propre cluster. L'ancre = premier ennemi du cluster
 *  (id le plus petit, pour la stabilité du nom). */
const clusterEnemies = (enemies: Enemy[]): Array<{ anchorId: string; members: Enemy[]; cx: number; cy: number }> => {
  const sorted = [...enemies].sort((a, b) => (a.id < b.id ? -1 : 1));
  const clusters: Array<{ anchorId: string; members: Enemy[]; cx: number; cy: number }> = [];
  for (const e of sorted) {
    let best: typeof clusters[number] | null = null;
    let bestD = CLUSTER_RADIUS;
    for (const c of clusters) {
      const d = Math.hypot(e.x - c.cx, e.y - c.cy);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) {
      best.members.push(e);
      best.cx = best.members.reduce((s, m) => s + m.x, 0) / best.members.length;
      best.cy = best.members.reduce((s, m) => s + m.y, 0) / best.members.length;
    } else {
      clusters.push({ anchorId: e.id, members: [e], cx: e.x, cy: e.y });
    }
  }
  return clusters;
};

const colorForScore = (s: number): string => (s >= 66 ? COLOR_HOT : s >= 33 ? COLOR_WARN : COLOR_CALM);

/** Fabrique le composant d'onglet — api capturé en closure (le rail ne passe aucune prop). */
export const makeActivityMonitorPanel = (api: any) => function ActivityMonitorPanel() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [comms, setComms] = useState<CommsLevel>('connecte');
  const [, setFrame] = useState(0);

  // Positions live des tokens (mises à jour temps réel). Gardées en ref : c'est l'échantillonnage
  // périodique (SAMPLE_MS) qui lit ce ref pour mesurer le mouvement, pas chaque changement.
  const liveEnemies = useRef<Enemy[]>([]);
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Position live du personnage incarné (pour la distance joueur↔cluster affichée en barre).
  const selfPos = useRef<{ x: number; y: number } | null>(null);
  // Score LISSÉ par secteur (id ancre → score affiché), pour l'effet d'aiguille amortie.
  const smoothed = useRef<Map<string, number>>(new Map());

  const { persoId } = api.getGameState();

  useEffect(() => api.map.subscribeCharacters((chars: Array<{ id: string; type: string; x: number; y: number; visibility?: string }>) => {
    // "Flux hostile" = tout ce qui n'est ni un joueur ni un allié : les PNJ (type 'pnj', où vivent
    // en pratique la plupart des ennemis) et les monstres (type 'monster'), en excluant les alliés
    // explicites (visibility 'ally'). On ignore les entrées sans coordonnées.
    liveEnemies.current = chars
      .filter((c) =>
        (c.type === 'monster' || c.type === 'pnj') &&
        c.visibility !== 'ally' &&
        typeof c.x === 'number' && typeof c.y === 'number'
      )
      .map((c) => ({ id: c.id, x: c.x, y: c.y }));
    // Position du perso incarné (pour la barre de proximité).
    const self = persoId ? chars.find((c) => c.id === persoId) : undefined;
    selfPos.current = self && typeof self.x === 'number' && typeof self.y === 'number' ? { x: self.x, y: self.y } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [persoId]);
  useEffect(() => subscribeComms(api, setComms), []);

  // Relevé périodique : clusterise + calcule le score de chaque secteur à partir du mouvement
  // depuis le relevé précédent.
  useEffect(() => {
    const sample = () => {
      const enemies = liveEnemies.current;
      const clusters = clusterEnemies(enemies);
      const nextPositions = new Map<string, { x: number; y: number }>();
      for (const e of enemies) nextPositions.set(e.id, { x: e.x, y: e.y });

      const nextSectors: Sector[] = clusters.map((c) => {
        // Mouvement total du cluster = somme des déplacements de ses membres depuis le dernier relevé.
        let move = 0;
        for (const m of c.members) {
          const prev = prevPositions.current.get(m.id);
          if (prev) move += Math.hypot(m.x - prev.x, m.y - prev.y);
        }
        const densityScore = c.members.length * P_DENSITY;
        const moveScore = Math.min(1, move / (MOVE_REF * c.members.length)) * P_MOVE;
        const target = Math.min(100, Math.round(densityScore + moveScore));

        const prevSmooth = smoothed.current.get(c.anchorId) ?? target;
        const next = prevSmooth + (target - prevSmooth) * SMOOTH;
        smoothed.current.set(c.anchorId, next);

        return {
          id: c.anchorId,
          label: sectorName(c.anchorId),
          count: c.members.length,
          cx: c.cx, cy: c.cy,
          score: Math.round(next),
        };
      }).sort((a, b) => b.score - a.score);

      // Oublie le score lissé des secteurs disparus (ennemis partis/tués).
      const alive = new Set(clusters.map((c) => c.anchorId));
      for (const id of [...smoothed.current.keys()]) if (!alive.has(id)) smoothed.current.delete(id);

      prevPositions.current = nextPositions;
      setSectors(nextSectors);
    };
    sample();
    const interval = setInterval(sample, SAMPLE_MS);
    return () => clearInterval(interval);
  }, []);

  // Animation légère (oscillation des barres) — re-render à cadence douce.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 60) { setFrame((f) => f + 1); last = t; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const jammed = comms === 'brouille';
  const noisy = comms === 'faible';
  // Bruit d'affichage appliqué au score selon le brouillage (l'instrument "décroche").
  const displayScore = (s: number): number => {
    if (jammed) return Math.round(Math.random() * 100);
    if (noisy) return Math.max(0, Math.min(100, Math.round(s + (Math.random() - 0.5) * 40)));
    return s;
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.15em', color: ACCENT, textTransform: 'uppercase', textAlign: 'center' }}>
        Moniteur d'activité
      </div>

      {jammed ? (
        <div style={{ padding: '28px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: COLOR_HOT, letterSpacing: '0.2em', opacity: 0.6 + 0.4 * Math.sin(performance.now() / 300) }}>
          — FLUX BROUILLÉ —
        </div>
      ) : sectors.length === 0 ? (
        <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
          Aucune activité détectée
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectors.map((sec) => {
            const shown = displayScore(sec.score);
            const color = colorForScore(shown);
            // La BARRE reflète la PROXIMITÉ du joueur au cluster (plein = sur le cluster, vide au-delà
            // de DETECT_RANGE) ; le POURCENTAGE d'activité, lui, reste affiché en chiffre à droite.
            const self = selfPos.current;
            const dist = self ? Math.hypot(sec.cx - self.x, sec.cy - self.y) : DETECT_RANGE;
            const proximity = Math.max(0, Math.min(100, (1 - dist / DETECT_RANGE) * 100));
            // Micro-oscillation cosmétique (l'instrument "vit"), coupée sous interférences.
            const jitter = noisy ? 0 : Math.sin(performance.now() / 400 + sec.cx) * 2;
            const barPct = Math.max(0, Math.min(100, proximity + jitter));
            return (
              <div key={sec.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.85)' }}>
                    {sec.label}
                    <span style={{ fontSize: 9, opacity: 0.5 }}> · {sec.count} contact{sec.count > 1 ? 's' : ''}</span>
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color }}>{shown}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: color, boxShadow: `0 0 6px ${color}`, transition: 'width 0.3s, background 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.08em', textAlign: 'center', paddingTop: 2 }}>
        Interception passive · flux hostiles
      </div>
    </div>
  );
};
