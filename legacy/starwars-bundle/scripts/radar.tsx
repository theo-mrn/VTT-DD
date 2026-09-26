// Radar de proximité — onglet sidebar contribué par le bundle. Centre = le personnage incarné ;
// les autres personnages de la carte (api.map.subscribeCharacters, positions déjà fusionnées par
// la page) apparaissent en écho coloré selon leur camp : joueurs alliés, PNJ, hostiles. Le radar
// détecte tout le monde par transpondeur/senseurs, y compris ce que le MJ masque visuellement sur
// la carte (visibilités 'hidden'/'gm_only'/'invisible'/'custom') — c'est tout l'intérêt de l'instrument.
import React, { useEffect, useRef, useState } from 'react';
import { subscribeComms, type CommsLevel } from './comms';


const RADAR_RANGE = 1500;

const COLOR_SWEEP = '#ffe81f';   // jaune Star Wars (accent du thème)
const COLOR_ALLY = '#4da6ff';    // joueurs
const COLOR_NPC = '#ffb84d';     // PNJ
const COLOR_ENEMY = '#ff5c5c';   // monstres / hostiles

interface RadarCharacter {
  id: string;
  name: string;
  type: 'joueurs' | 'pnj' | 'monster';
  x: number;
  y: number;
  visibility?: string;
}

/** Contact radar en coordonnées ABSOLUES carte — c'est cette position qui est gelée entre deux
 *  passages du faisceau. Le rendu la retraduit en relatif à CHAQUE frame par rapport à soi : se
 *  déplacer soi-même recentre donc l'écran instantanément (le radar est fixé sur soi), seuls les
 *  déplacements des AUTRES attendent le prochain passage du faisceau pour apparaître. */
interface RadarContact {
  id: string;
  x: number;       // coordonnées carte (px monde)
  y: number;
  label: string;
  color: string;
}

const colorFor = (type: RadarCharacter['type']): string =>
  type === 'monster' ? COLOR_ENEMY : type === 'joueurs' ? COLOR_ALLY : COLOR_NPC;

/** Contacts détectables autour de soi (portée uniquement) — le radar capte tout le monde par
 *  senseurs, y compris ce que le MJ masque visuellement sur la carte : c'est tout l'intérêt de
 *  l'instrument, contrairement à l'affichage carte qui respecte le masquage MJ. */
const toContacts = (chars: RadarCharacter[], self: RadarCharacter): RadarContact[] => {
  const contacts: RadarContact[] = [];
  for (const c of chars) {
    if (c.id === self.id) continue;
    const dist = Math.hypot(c.x - self.x, c.y - self.y);
    if (dist > RADAR_RANGE || dist === 0) continue;
    contacts.push({ id: c.id, x: c.x, y: c.y, label: (c.name || '?').slice(0, 10), color: colorFor(c.type) });
  }
  return contacts;
};

/** Angle radar (0° = nord, sens horaire) d'un décalage carte. */
const angleOf = (dx: number, dy: number): number => {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (a < 0) a += 360;
  return a;
};

/** Fabrique le composant d'onglet — api est capturé en closure (le rail sidebarTabs ne passe aucune
 *  prop au composant). */
export const makeRadarPanel = (api: any) => function RadarPanel() {
  const [chars, setChars] = useState<RadarCharacter[]>([]);
  const [comms, setComms] = useState<CommsLevel>('connecte');
  const [, setFrame] = useState(0);

  // Positions live de la carte (cb appelé immédiatement puis à chaque mouvement).
  useEffect(() => api.map.subscribeCharacters((next: RadarCharacter[]) => {
    // DEBUG TEMPORAIRE — à retirer une fois le bug d'affichage des ennemis cachés diagnostiqué.
    console.log('[RADAR DEBUG] chars reçus:', next.map((c) => ({ id: c.id, name: c.name, type: c.type, visibility: c.visibility, x: c.x, y: c.y })));
    setChars(next);
  }), []);
  // Niveau de brouillage des comms (partagé, posé par le MJ — cf comms.tsx).
  useEffect(() => subscribeComms(api, setComms), []);

  // Balayage : re-render à chaque frame, mais la rotation est DÉRIVÉE de l'horloge absolue
  // (performance.now), pas d'un état accumulé — chaque mise à jour du doc personnage (ex un
  // déplacement) fait ré-enregistrer le module par l'hôte et REMONTE ce panneau, et un état de
  // rotation repartirait alors à zéro (balayage qui saute en arrière / semble figé pendant un drag).
  useEffect(() => {
    let raf = 0;
    const tick = () => { setFrame((f) => f + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const SWEEP_MS = 4500; // 4,5 s / tour
  const rotation = ((performance.now() % SWEEP_MS) / SWEEP_MS) * 360;

  const { persoId } = api.getGameState();
  const self = persoId ? chars.find((c) => c.id === persoId) : undefined;
  // Les vrais échos ne s'affichent qu'avec des comms saines : sous interférences le radar ne
  // montre QUE des fantômes (ci-dessous), en brouillage total plus rien.
  const contacts = self && comms === 'connecte' ? toContacts(chars, self) : [];
  const jammed = comms === 'brouille';

  // Écran à RÉMANENCE, comme un vrai scope : un blip est PEINT sur le cadran là où le faisceau a
  // détecté le contact (position relative à soi À CET INSTANT) et n'en bouge plus jamais — ni
  // quand le contact se déplace, ni quand soi-même se déplace. Seule une NOUVELLE détection (le
  // faisceau repasse sur la position live du contact, jugée depuis la position ACTUELLE de soi)
  // repeint le blip à sa place à jour. Entre deux tours, l'affichage peut donc être périmé :
  // c'est le principe de l'instrument.
  const displayedRef = useRef<Map<string, { id: string; x: number; y: number; label: string; color: string }>>(new Map());
  const prevRotationRef = useRef(rotation);
  {
    const prev = prevRotationRef.current;
    const delta = (rotation - prev + 360) % 360;
    if (comms !== 'connecte' || !self) {
      displayedRef.current.clear();
    } else {
      const liveIds = new Set(contacts.map((c) => c.id));
      for (const id of [...displayedRef.current.keys()]) {
        if (!liveIds.has(id)) displayedRef.current.delete(id); // hors de portée / parti
      }
      for (const c of contacts) {
        const dx = c.x - self.x;
        const dy = c.y - self.y;
        // Le faisceau a-t-il balayé la position RÉELLE (live) du contact depuis la frame passée ?
        const angle = angleOf(dx, dy);
        if (delta > 0 && ((angle - prev + 360) % 360) <= delta) {
          displayedRef.current.set(c.id, {
            id: c.id,
            x: 50 + (dx / RADAR_RANGE) * 48,
            y: 50 + (dy / RADAR_RANGE) * 48,
            label: c.label,
            color: c.color,
          });
        }
      }
    }
    prevRotationRef.current = rotation;
  }
  const displayed = [...displayedRef.current.values()];

  // Échos FANTÔMES sous interférences : ils apparaissent n'importe où sur le disque (position
  // aléatoire uniforme, pas autour de soi), vivent ~1-2 s puis disparaissent, remplacés ailleurs —
  // aucune dérive continue. Alimenté par le re-render à chaque frame (rAF plus haut).
  const phantomsRef = useRef<Array<{ x: number; y: number; color: string; born: number; ttl: number }>>([]);
  const now = performance.now();
  if (comms === 'faible') {
    const alive = phantomsRef.current.filter((p) => now - p.born < p.ttl);
    if (alive.length < 6 && Math.random() < 0.05) {
      const r = Math.sqrt(Math.random()) * 44;
      const a = Math.random() * Math.PI * 2;
      alive.push({
        x: 50 + r * Math.cos(a),
        y: 50 + r * Math.sin(a),
        color: [COLOR_ALLY, COLOR_NPC][Math.floor(Math.random() * 2)],
        born: now,
        ttl: 900 + Math.random() * 1500,
      });
    }
    phantomsRef.current = alive;
  } else if (phantomsRef.current.length > 0) {
    phantomsRef.current = [];
  }
  // Fondu d'apparition (250 ms) puis d'extinction (400 ms) de chaque fantôme.
  const phantomOpacity = (p: { born: number; ttl: number }) => {
    const age = now - p.born;
    return Math.max(0, Math.min(1, Math.min(age / 250, (p.ttl - age) / 400)));
  };

  // Écho lumineux au passage du balayage : plein juste derrière la ligne, puis fondu jusqu'à
  // DISPARITION complète sur 200° (~1,7 s de rémanence par tour) — aucun écho permanent, alliés
  // compris : entre deux passages le radar est vide.
  const FADE_DEGREES = 200;
  const opacityFor = (t: { x: number; y: number }) => {
    let angle = (Math.atan2(t.y - 50, t.x - 50) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    let diff = rotation - angle;
    if (diff < 0) diff += 360;
    return diff < FADE_DEGREES ? 1 - diff / FADE_DEGREES : 0;
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.15em', color: COLOR_SWEEP, textTransform: 'uppercase' }}>
        Senseurs de proximité
      </div>

      {!self ? (
        <div style={{ padding: '32px 12px', fontSize: 13, opacity: 0.6, textAlign: 'center' }}>
          Aucun personnage incarné sur la carte — le radar n'a pas de point d'origine.
        </div>
      ) : (
        <div style={{ position: 'relative', width: 260, height: 260, borderRadius: '50%', overflow: 'hidden', background: 'rgba(3,3,4,0.85)' }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="sw-radar-sweep" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor={COLOR_SWEEP} stopOpacity="0.5" />
                <stop offset="100%" stopColor={COLOR_SWEEP} stopOpacity="0" />
              </linearGradient>
              <filter id="sw-radar-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <clipPath id="sw-radar-clip"><circle cx="50" cy="50" r="48" /></clipPath>
            </defs>

            {/* Anneaux de portée (25/50/75/100 %) + croisée */}
            <circle cx="50" cy="50" r="48" fill={COLOR_SWEEP} opacity="0.04" />
            {[12, 24, 36, 48].map((r) => (
              <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={COLOR_SWEEP} strokeOpacity="0.25" strokeWidth="0.5" />
            ))}
            <line x1="50" y1="2" x2="50" y2="98" stroke={COLOR_SWEEP} strokeOpacity="0.15" strokeWidth="0.5" />
            <line x1="2" y1="50" x2="98" y2="50" stroke={COLOR_SWEEP} strokeOpacity="0.15" strokeWidth="0.5" />

            {/* Balayage — masqué en brouillage total (pas de bande jaune, juste "BROUILLÉ"). */}
            {!jammed && (
              <g clipPath="url(#sw-radar-clip)">
                <path
                  d={`M 50 50 L 50 2 A 48 48 0 0 0 ${50 - 48 * Math.sin(Math.PI / 4)} ${50 - 48 * Math.cos(Math.PI / 4)} Z`}
                  fill="url(#sw-radar-sweep)"
                  style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '50px 50px' }}
                />
                <line
                  x1="50" y1="50" x2="50" y2="2"
                  stroke={COLOR_SWEEP} strokeWidth="1.2" strokeLinecap="round"
                  style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '50px 50px', filter: `drop-shadow(0 0 2px ${COLOR_SWEEP})` }}
                />
              </g>
            )}

            {/* Soi-même au centre */}
            {!jammed && <circle cx="50" cy="50" r="2.2" fill={COLOR_SWEEP} filter="url(#sw-radar-glow)" />}

            {/* Échos réels (comms saines uniquement) — figés à la position du dernier passage du
                faisceau, point seul (pas d'anneau). */}
            {displayed.map((t) => {
              const opacity = opacityFor(t);
              return (
                <g key={t.id} style={{ opacity }}>
                  <circle cx={t.x} cy={t.y} r="1.9" fill={t.color} filter={opacity > 0.5 ? 'url(#sw-radar-glow)' : undefined} />
                  {opacity > 0.3 && (
                    <text x={t.x + 5} y={t.y + 1} fill={t.color} fontSize="4.5" fontFamily="monospace">{t.label}</text>
                  )}
                </g>
              );
            })}

            {/* Échos fantômes (interférences) : apparition/extinction en fondu, partout sur le
                disque, sans étiquette ni anneau. */}
            {phantomsRef.current.map((p) => {
              const opacity = phantomOpacity(p);
              return (
                <g key={p.born} style={{ opacity }}>
                  <circle cx={p.x} cy={p.y} r="1.9" fill={p.color} filter={opacity > 0.5 ? 'url(#sw-radar-glow)' : undefined} />
                </g>
              );
            })}

            {/* Brouillage total */}
            {jammed && (
              <text
                x="50" y="52" textAnchor="middle" fill={COLOR_ENEMY}
                fontSize="7" fontFamily="monospace" letterSpacing="2"
                style={{ opacity: 0.6 + 0.4 * Math.sin(now / 300) }}
              >
                BROUILLÉ
              </text>
            )}

            <circle cx="50" cy="50" r="49" fill="none" stroke={COLOR_SWEEP} strokeOpacity="0.8" strokeWidth="1.2" />
          </svg>
        </div>
      )}

      {/* Légende */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, opacity: 0.85 }}>
        {[[COLOR_ALLY, 'Alliés'], [COLOR_NPC, 'PNJ'], [COLOR_ENEMY, 'Hostiles']].map(([color, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color as string }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};
