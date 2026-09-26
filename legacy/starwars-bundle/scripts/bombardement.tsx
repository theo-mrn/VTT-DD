// Bombardement de Zone — panneau flottant joueur (coin bas-droit), fidèle au VectorPad fourni par
// l'utilisateur (physique "hydraulique" par lissage, brackets, radar sweep, ping wave, data readout)
// + un slider de rayon en plus. Pas de framer-motion : le linker de bundle-scripts ne résout que
// React/lucide-react comme dépendances externes (voir modules/bundle-scripts/linker.ts) — le lissage
// spring est reproduit par interpolation exponentielle sur requestAnimationFrame, les animations en
// boucle (radar sweep, ping wave) par CSS @keyframes injectées en <style>, comme radar.tsx/scanner.tsx
// le font déjà pour leurs propres besoins.
//
// La position/rayon choisis posent un VRAI gabarit circulaire sur la carte (même canal RTDB que
// l'outil de mesure natif, api.map.setMeasurement) — visible par tous, pas juste dans l'UI du pad.
// Valider calcule les personnages dans la zone et écrit le résultat dans le canal partagé
// (bombardement-shared.tsx) ; le panneau MJ (makeBombardementMjPanel) affiche les cibles et permet
// d'appliquer des dégâts directement sur la stat vitale (PV) de chacune.
import React, { useState, useRef, useEffect } from 'react';
import { writeStrike, subscribeStrike, clearStrike } from './bombardement-shared';
import { subscribeComms, type CommsLevel } from './comms';

const MEASUREMENT_ID = 'bombardement-zone';
const MIN_RADIUS_PCT = 3;
const MAX_RADIUS_PCT = 40;
/** Déviation max (± % de la carte, par axe) du point d'impact sous interférences — volontairement
 *  sévère : bombarder sous interférences est un vrai pari, la frappe peut tomber très loin du point
 *  visé (jusqu'à un écart diagonal de ~28 % de la carte), y compris sur des alliés. */
const JITTER_PCT = 20;

const KEYFRAMES = `
@keyframes sw-bomb-sweep { 0% { transform: translateY(-100%); } 100% { transform: translateY(0%); } }
@keyframes sw-bomb-ping { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
@keyframes sw-bomb-blink { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.25; } }
@keyframes sw-bomb-static { 0% { background-position: 0 0; opacity: 0.5; } 50% { opacity: 0.95; } 100% { background-position: 0 8px; opacity: 0.5; } }
`;

/** Résout la stat vitale principale (ex 'PV') sans dépendre du moteur de formules — première stat
 *  category 'vital' pourvue d'un maxFormula, même heuristique que useNpcStatFields côté app. On
 *  retourne la DÉFINITION entière (pas juste la clé) : le sens des dégâts en dépend —
 *  recoversToZero: true (Blessures/Stress EotE, 0 = sain) → les dégâts AUGMENTENT la jauge ;
 *  sinon (PV D&D, max = sain) → les dégâts la diminuent. */
function resolveVitalStat(gameSystem: any): { key: string; recoversToZero?: boolean; maxFormula?: any } | null {
  return (gameSystem?.stats ?? []).find((s: any) => s.category === 'vital' && s.maxFormula) ?? null;
}

export const makeBombardementPanel = (api: any) => function VectorPad() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false); // Tracks Hover
  const [isLocked, setIsLocked] = useState(false); // Tracks Click
  const [radiusPct, setRadiusPct] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  // Miroir de `confirmed` lisible depuis un cleanup/callback non ré-abonné (qui capturerait sinon la
  // valeur initiale `false` et effacerait le gabarit d'une frappe pourtant envoyée).
  const confirmedRef = useRef(false);
  confirmedRef.current = confirmed;
  const [authorName, setAuthorName] = useState('Inconnu');
  // Niveau de brouillage des comms (partagé, posé par le MJ — cf comms.tsx), comme le radar :
  // 'faible' = ciblage imprécis (déviation aléatoire de la frappe), 'brouille' = pad inutilisable.
  const [comms, setComms] = useState<CommsLevel>('connecte');
  const jammed = comms === 'brouille';
  const degraded = comms === 'faible';
  const jammedRef = useRef(jammed);
  jammedRef.current = jammed;

  // Cible brute (instantanée, suit le pointeur) vs. position lissée affichée (effet "hydraulique").
  const targetRef = useRef({ x: 50, y: 50 });
  const [smooth, setSmooth] = useState({ x: 50, y: 50 });
  const smoothRef = useRef({ x: 50, y: 50 });

  useEffect(() => api.character.subscribe((c: Record<string, unknown> | null) => {
    setAuthorName((c?.Nomperso as string) || 'Inconnu');
  }), []);
  useEffect(() => subscribeComms(api, setComms), []);

  // Le MJ a traité (ou fermé) la frappe → le canal partagé est vidé : la fenêtre d'annulation se
  // referme côté joueur, sinon "Annuler" laisserait croire qu'on peut encore rattraper des dégâts
  // déjà appliqués.
  useEffect(() => subscribeStrike(api, (s) => {
    if (!s) setConfirmed(false);
  }), []);

  // Le panneau se ferme (changement d'onglet, déconnexion) alors qu'une visée était en cours : sans
  // ça le gabarit de VISÉE restait affiché sur la carte de tout le monde, indéfiniment. Une frappe
  // déjà envoyée est en revanche laissée intacte (gabarit ET canal partagé) : c'est au MJ de la
  // traiter, il doit pouvoir comparer la zone aux tokens même si le joueur a fermé son panneau.
  useEffect(() => () => {
    if (!confirmedRef.current) api.map.clearMeasurement(MEASUREMENT_ID);
  }, []);

  // Brouillage total : le gabarit de visée éventuellement posé sur la carte disparaît (les senseurs
  // ne renvoient plus rien).
  useEffect(() => {
    if (jammed) api.map.clearMeasurement(MEASUREMENT_ID);
  }, [jammed]);

  // Boucle de lissage : interpolation exponentielle vers la cible à chaque frame (remplace
  // useSpring de framer-motion, indisponible dans le runtime des bundle-scripts).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = targetRef.current;
      const s = smoothRef.current;
      const nx = s.x + (t.x - s.x) * 0.18;
      const ny = s.y + (t.y - s.y) * 0.18;
      if (Math.abs(nx - s.x) > 0.01 || Math.abs(ny - s.y) > 0.01) {
        smoothRef.current = { x: nx, y: ny };
        setSmooth({ x: nx, y: ny });
        publishPreview(nx, ny, radiusPct);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusPct]);

  const publishPreview = (xPct: number, yPct: number, radPct: number) => {
    if (jammedRef.current) return; // brouillé : aucune donnée de visée n'atteint la carte
    // Frappe envoyée et pas encore traitée : le gabarit montre l'impact RÉEL soumis au MJ, il ne doit
    // plus suivre la visée du joueur (sinon la zone affichée ne correspondrait plus aux cibles listées).
    if (confirmedRef.current) return;
    const bg = api.map.getBackgroundSize();
    if (!bg) return;
    api.map.setMeasurement({
      id: MEASUREMENT_ID,
      x: (xPct / 100) * bg.width,
      y: (yPct / 100) * bg.height,
      radius: (radPct / 100) * bg.width,
      color: '#f59e0b',
    });
  };

  const pointToPct = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const newX = ((e.clientX - rect.left) / rect.width) * 100;
    const newY = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(Math.max(newX, 0), 100), y: Math.min(Math.max(newY, 0), 100) };
  };

  // Le réticule ne suit la souris QUE tant qu'il n'est pas verrouillé — sinon impossible de viser
  // (bouger la souris vers le bouton "Larguer" décalerait la cible avant validation).
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isLocked || jammed || confirmed) return; // frappe en attente : la visée est figée
    const pt = pointToPct(e);
    if (pt) targetRef.current = pt;
  };

  // Un clic bascule simplement le verrou : locked → déverrouille (le réticule se remet à suivre
  // la souris) ; déverrouillé → fige la position ATTEINTE au moment du clic (pas de saut au point
  // cliqué — le curseur suivait déjà la souris jusque-là, donc la position est déjà la bonne).
  const handlePointerDown = () => {
    if (jammed || confirmed) return; // frappe en attente : re-viser n'a pas de sens avant annulation
    setIsLocked((prev) => !prev);
  };

  const handlePointerEnter = () => setIsActive(true);
  const handlePointerLeave = () => setIsActive(false);

  const handleRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setRadiusPct(next);
    publishPreview(smoothRef.current.x, smoothRef.current.y, next);
  };

  const strike = () => {
    if (jammed || confirmed) return; // une frappe est déjà en attente de traitement par le MJ
    const bg = api.map.getBackgroundSize();
    const chars = api.map.getCharacters();
    // Sous interférences, le point d'impact DÉVIE aléatoirement du point visé (±JITTER_PCT par
    // axe) — le gabarit est republié à l'endroit RÉEL de la frappe pour que tout le monde (joueur
    // compris) voie où elle est vraiment tombée.
    const clampPct = (v: number) => Math.min(100, Math.max(0, v));
    const xPct = degraded ? clampPct(smoothRef.current.x + (Math.random() - 0.5) * 2 * JITTER_PCT) : smoothRef.current.x;
    const yPct = degraded ? clampPct(smoothRef.current.y + (Math.random() - 0.5) * 2 * JITTER_PCT) : smoothRef.current.y;
    let targetNames: string[] = [];

    if (bg) {
      const cx = (xPct / 100) * bg.width;
      const cy = (yPct / 100) * bg.height;
      const radiusPx = (radiusPct / 100) * bg.width;
      targetNames = chars
        .filter((c: { x: number; y: number }) => Math.hypot(c.x - cx, c.y - cy) <= radiusPx)
        .map((c: { name: string }) => c.name || '(sans nom)');
    }

    if (degraded) publishPreview(xPct, yPct, radiusPct);

    writeStrike(api, {
      authorId: api.getGameState().persoId ?? '',
      authorName,
      xPct, yPct, radiusPct, targetNames,
      timestamp: Date.now(),
    });

    // Reste "envoyé" tant que le MJ n'a pas traité la frappe : c'est cet état qui offre la fenêtre
    // d'annulation au joueur (avant, un setTimeout de 1,5 s repassait le bouton à "Larguer" et la
    // frappe devenait irrattrapable côté joueur).
    setConfirmed(true);
  };

  /** Annule la frappe qu'on vient d'envoyer : efface le canal partagé (le panneau MJ disparaît) et
   *  retire le gabarit de la carte. Ne fait rien si le MJ a déjà traité/fermé la frappe — dans ce
   *  cas les dégâts sont peut-être déjà appliqués, ce n'est plus au joueur de revenir dessus. */
  const cancelStrike = () => {
    clearStrike(api);
    api.map.clearMeasurement(MEASUREMENT_ID);
    setConfirmed(false);
    setIsLocked(false);
  };

  const ACCENT = '#ffe81f'; // jaune du bundle Star Wars (même accent que scanner.tsx/comms-mj.tsx)
  const red = '#ef4444';
  const accent = isLocked ? red : ACCENT;

  return (
    <div style={{ fontFamily: 'monospace', userSelect: 'none' }}>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: 280, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s',
              background: isActive ? accent : '#164e63',
              boxShadow: isActive ? `0 0 10px ${accent}` : 'none',
            }} />
            <span style={{ color: 'rgba(255,232,31,0.8)' }}>BOMBARDEMENT</span>
          </div>
          <span style={{
            color: jammed ? '#ff5c5c' : degraded ? '#f59e0b' : isActive ? accent : '#525252',
            animation: jammed ? 'sw-bomb-blink 1s ease-in-out infinite' : 'none',
          }}>
            {jammed ? 'BROUILLÉ' : degraded ? 'INTERFÉRENCES' : isActive ? (isLocked ? 'LOCKED' : 'TRACKING') : 'IDLE'}
          </span>
        </div>

        {/* --- MAIN PAD AREA --- */}
        <div style={{ position: 'relative' }}>

          {/* Corner Brackets */}
          {[
            { top: -8, left: -8, borderWidth: '1px 0 0 1px' },
            { top: -8, right: -8, borderWidth: '1px 1px 0 0' },
            { bottom: -8, left: -8, borderWidth: '0 0 1px 1px' },
            { bottom: -8, right: -8, borderWidth: '0 1px 1px 0' },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', width: 16, height: 16, borderStyle: 'solid',
              borderColor: isLocked ? 'rgba(239,68,68,0.5)' : 'rgba(255,232,31,0.5)',
              transition: 'border-color 0.3s', ...pos,
            }} />
          ))}

          <div
            ref={containerRef}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            style={{
              position: 'relative', width: 280, height: 280, overflow: 'hidden',
              background: 'rgba(23,23,23,0.8)', borderRadius: 4, cursor: 'crosshair', touchAction: 'none',
              border: `1px solid ${isLocked ? '#7f1d1d' : '#262626'}`,
              boxShadow: '0 0 50px rgba(0,0,0,0.5)', transition: 'border-color 0.3s',
            }}
          >
            {/* Grid Pattern */}
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.2, pointerEvents: 'none',
              backgroundImage: `linear-gradient(${isLocked ? 'rgba(239,68,68,0.3)' : 'rgba(255,232,31,0.3)'} 1px, transparent 1px), linear-gradient(90deg, ${isLocked ? 'rgba(239,68,68,0.3)' : 'rgba(255,232,31,0.3)'} 1px, transparent 1px)`,
              backgroundSize: '40px 40px', backgroundPosition: '-1px -1px',
            }} />

            {/* Dynamic "Radar" Sweep */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: '200%', width: '100%', pointerEvents: 'none',
              background: `linear-gradient(to bottom, transparent, ${isLocked ? 'rgba(239,68,68,0.1)' : 'rgba(255,232,31,0.05)'}, transparent)`,
              animation: 'sw-bomb-sweep 4s linear infinite',
            }} />

            {/* CROSSHAIRS */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: 1, left: `${smooth.x}%`, pointerEvents: 'none',
              background: `linear-gradient(to bottom, transparent, ${isLocked ? 'rgba(248,113,113,0.8)' : 'rgba(255,232,31,0.5)'}, transparent)`,
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 1, top: `${smooth.y}%`, pointerEvents: 'none',
              background: `linear-gradient(to right, transparent, ${isLocked ? 'rgba(248,113,113,0.8)' : 'rgba(255,232,31,0.5)'}, transparent)`,
            }} />

            {/* --- THE RETICLE / PUCK --- */}
            <div style={{ position: 'absolute', left: `${smooth.x}%`, top: `${smooth.y}%`, zIndex: 20 }}>
              <div style={{
                position: 'relative', transform: `translate(-50%, -50%) scale(${isActive ? (isLocked ? 0.9 : 1) : 0})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s ease-out',
              }}>
                <div style={{
                  width: 4, height: 4, borderRadius: '50%', boxShadow: '0 0 10px currentColor',
                  background: isLocked ? '#fef2f2' : '#ecfeff', color: isLocked ? '#fef2f2' : '#ecfeff',
                }} />
                <div style={{
                  position: 'absolute', border: `1px solid ${isLocked ? red : 'rgba(255,232,31,0.8)'}`,
                  boxShadow: isLocked ? '0 0 15px rgba(239,68,68,0.2)' : '0 0 15px rgba(255,232,31,0.3)',
                  width: isActive ? (isLocked ? 30 : 50) : 0,
                  height: isActive ? (isLocked ? 30 : 50) : 0,
                  opacity: isActive ? 1 : 0,
                  transition: 'width 0.2s, height 0.2s, opacity 0.2s',
                }} />
                {isActive && !isLocked && (
                  <div style={{
                    position: 'absolute', border: `1px solid ${ACCENT}`, borderRadius: '50%',
                    width: 40, height: 40, animation: 'sw-bomb-ping 1s ease-out infinite',
                  }} />
                )}
              </div>
            </div>

            {/* Coordinates Overlay inside box */}
            <div style={{
              position: 'absolute', bottom: 12, right: 12, fontSize: 9, pointerEvents: 'none',
              color: isLocked ? red : 'rgba(255,232,31,0.5)', opacity: isActive ? 1 : 0.3, transition: 'opacity 0.2s, color 0.3s',
            }}>
              {isLocked ? 'TARGET_ACQUIRED' : 'SEEKING...'}
            </div>

            {/* Parasites (interférences) : trame animée par-dessus le pad */}
            {degraded && !jammed && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg, rgba(245,158,11,0.08) 0 2px, transparent 2px 4px)',
                animation: 'sw-bomb-static 0.3s linear infinite',
              }} />
            )}

            {/* Brouillage total : pad mort */}
            {jammed && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(3,3,4,0.75)',
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 900, letterSpacing: '0.3em', color: '#ff5c5c',
                  animation: 'sw-bomb-blink 1s ease-in-out infinite',
                }}>
                  BROUILLÉ
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RAYON */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span>Rayon de la zone</span>
            <span style={{ color: ACCENT, fontFamily: 'monospace' }}>{radiusPct.toFixed(0)}%</span>
          </div>
          <input
            type="range" min={MIN_RADIUS_PCT} max={MAX_RADIUS_PCT} step={1}
            value={radiusPct} onChange={handleRadiusChange}
            style={{ width: '100%', accentColor: ACCENT }}
          />
        </div>

        {/* DATA READOUT PANELS */}
        <div style={{ display: 'flex', gap: 12, width: 280 }}>
          <DataPanel label="COORD_X" value={Math.round(smooth.x)} isActive={isActive} isLocked={isLocked} />
          <DataPanel label="COORD_Y" value={Math.round(smooth.y)} isActive={isActive} isLocked={isLocked} />
        </div>

        <button
          onClick={strike}
          disabled={jammed || confirmed}
          style={{
            width: 280, padding: '9px 0', borderRadius: 6,
            cursor: jammed || confirmed ? 'not-allowed' : 'pointer',
            border: `1px solid ${jammed ? '#404040' : confirmed ? '#4ade80' : '#f59e0b'}`,
            background: jammed ? 'rgba(64,64,64,0.15)' : confirmed ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)',
            color: jammed ? '#525252' : confirmed ? '#4ade80' : '#f59e0b',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          {jammed ? 'Signal brouillé' : confirmed ? 'Frappe envoyée — en attente du MJ' : 'Larguer sur la zone'}
        </button>

        {/* Fenêtre d'annulation : ouverte tant que le MJ n'a pas traité la frappe (le canal partagé
            est alors vidé, ce qui referme automatiquement cet état côté joueur). */}
        {confirmed && (
          <button
            onClick={cancelStrike}
            style={{
              width: 280, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
              border: '1px solid #ef4444', background: 'rgba(239,68,68,0.12)', color: '#f87171',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            ✕ Annuler la frappe
          </button>
        )}

        {degraded && !jammed && !confirmed && (
          <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.08em', textAlign: 'center' }}>
            ⚠ Interférences — ciblage imprécis (dérive jusqu'à ±{JITTER_PCT}% du point visé)
          </span>
        )}
      </div>
    </div>
  );
};

function DataPanel({ label, value, isActive, isLocked }: { label: string; value: number; isActive: boolean; isLocked: boolean }) {
  return (
    <div style={{ position: 'relative', flex: 1, background: '#171717', border: '1px solid #262626', padding: 8, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, transition: 'opacity 0.3s',
        opacity: isActive ? 1 : 0,
        background: isLocked ? 'rgba(127,29,29,0.2)' : 'rgba(120,103,0,0.2)',
      }} />
      <div style={{
        position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 8,
        borderLeft: `2px solid ${isLocked ? '#ef4444' : (isActive ? '#ffe81f' : '#262626')}`,
      }}>
        <span style={{ fontSize: 9, color: '#737373', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em',
            color: isLocked ? '#f87171' : (isActive ? '#ffe81f' : '#a3a3a3'),
          }}>
            {value.toString().padStart(3, '0')}
          </span>
          <span style={{ fontSize: 9, color: '#525252' }}>%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau MJ ──────────────────────────────────────────────────────────────

/** Overlay MJ : liste les cibles de la dernière frappe reçue + un champ de dégâts appliqué
 *  directement sur la stat vitale (PV) de chaque cible via roomCharacters.update. Efface aussi le
 *  gabarit de zone une fois traité (bouton dédié, la zone reste visible tant que le MJ ne l'a pas
 *  fermée pour qu'il puisse la comparer aux tokens sur la carte). */
export const makeBombardementMjPanel = (api: any) => function BombardementMjPanel() {
  const [strike, setStrike] = useState<any>(null);
  const [damage, setDamage] = useState(10);
  const [chars, setChars] = useState<Array<Record<string, unknown>>>([]);
  const [sceneInfo, setSceneInfo] = useState<{ scenes: Array<{ id: string; name: string }>; globalSceneId: string | null }>({ scenes: [], globalSceneId: null });
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [hiddenByPanel, setHiddenByPanel] = useState(false);

  useEffect(() => {
    console.log('[Bombardement] BombardementMjPanel monté');
    return () => console.log('[Bombardement] BombardementMjPanel démonté');
  }, []);

  // Masqué tant qu'un onglet/panneau du layout est ouvert — même mécanisme que le comlink
  // (comms-mj.tsx) : le layout émet 'vtt-panel-open' à l'ouverture/fermeture de ses panneaux.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setHiddenByPanel(Boolean(detail?.open));
    };
    window.addEventListener('vtt-panel-open', handler as EventListener);
    return () => window.removeEventListener('vtt-panel-open', handler as EventListener);
  }, []);
  useEffect(() => subscribeStrike(api, (s: any) => {
    console.log('[Bombardement] subscribeStrike reçu', s);
    setStrike(s);
    setApplied(new Set());
  }), []);
  useEffect(() => api.roomCharacters.subscribe(setChars), []);
  useEffect(() => api.scenes.subscribe(setSceneInfo), []);

  if (!strike || strike.targetNames.length === 0) return null;
  if (hiddenByPanel) return null;

  const vitalStat = resolveVitalStat(api.gameSystem);
  const vitalKey = vitalStat?.key ?? null;
  const targets = chars.filter((c) => strike.targetNames.includes((c as any).Nomperso));

  // Scène RÉELLE de l'auteur (character.currentSceneId, déjà stocké sur son doc) — pas recalculée
  // côté joueur, pour éviter toute divergence avec la vraie position du personnage.
  const author = chars.find((c) => c.id === strike.authorId);
  const authorSceneId = (author as any)?.currentSceneId ?? sceneInfo.globalSceneId;
  const authorSceneName = sceneInfo.scenes.find((s) => s.id === authorSceneId)?.name || 'Carte principale';

  // Fermeture DÉFINITIVE : efface aussi la frappe du canal partagé — sinon elle persiste en RTDB
  // et re-déclenche le panneau (état "appliqué" remis à zéro) à chaque refresh, permettant de
  // réappliquer les mêmes dégâts en boucle.
  const dismiss = () => {
    api.map.clearMeasurement(MEASUREMENT_ID);
    clearStrike(api);
    setStrike(null);
  };

  const applyDamage = (char: Record<string, unknown>) => {
    if (!vitalStat || !vitalKey) return;
    const current = Number(char[vitalKey] ?? 0);
    let next: number;
    if (vitalStat.recoversToZero) {
      // Jauge de blessures EotE (0 = sain) : les dégâts s'AJOUTENT, clampés au seuil max quand la
      // borne est résoluble simplement (maxFormula {type:'stat', key:'PV_Max'} → char.PV_Max).
      next = current + damage;
      const maxKey = vitalStat.maxFormula?.type === 'stat' ? vitalStat.maxFormula.key : null;
      const maxVal = maxKey ? Number(char[maxKey]) : NaN;
      if (!isNaN(maxVal) && maxVal > 0) next = Math.min(next, maxVal);
    } else {
      // Jauge PV classique (max = sain) : les dégâts se soustraient, plancher à 0.
      next = Math.max(0, current - damage);
    }
    const charName = (char as any).Nomperso || '(sans nom)';
    api.roomCharacters.update(char.id, { [vitalKey]: next })
      .then(() => api.showToast(`${damage} blessure(s) infligée(s) à ${charName}`, { type: 'success' }))
      .catch((err: unknown) => {
        console.error('[Bombardement] update FAILED', char.id, err);
        api.showToast(`Échec des dégâts sur ${charName}`, { type: 'error' });
      });
    const nextApplied = new Set(applied).add(char.id as string);
    setApplied(nextApplied);
    // Toutes les cibles RÉSOLUBLES traitées (les "Introuvable" ne pourront jamais l'être) →
    // la frappe est terminée, fermeture définitive automatique.
    const resolvableIds = targets.map((c) => c.id as string);
    if (resolvableIds.length > 0 && resolvableIds.every((id) => nextApplied.has(id))) {
      dismiss();
    }
  };

  return (
    <div style={{
      fontFamily: 'monospace', pointerEvents: 'auto', width: 280,
      background: 'rgba(23,23,23,0.95)', border: '1px solid rgba(245,158,11,0.4)',
      borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Bombardement — {strike.authorName}
        </span>
        <button onClick={dismiss} style={{ background: 'transparent', border: 'none', color: '#737373', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      <span style={{ fontSize: 9, color: '#a3a3a3' }}>Scène : <strong style={{ color: '#e5e5e5' }}>{authorSceneName}</strong></span>

      {!vitalKey && (
        <span style={{ fontSize: 10, color: '#f87171' }}>Aucune stat vitale trouvée pour ce système.</span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dégâts</span>
        <input
          type="number" min={0} value={damage}
          onChange={(e) => setDamage(Math.max(0, Number(e.target.value)))}
          style={{ width: 60, background: '#0a0a0a', border: '1px solid #404040', borderRadius: 4, color: '#e5e5e5', padding: '2px 6px', fontSize: 12 }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {strike.targetNames.map((name: string) => {
          const char = targets.find((c) => (c as any).Nomperso === name);
          const isApplied = char ? applied.has(char.id as string) : false;
          const currentPv = char && vitalKey ? Number(char[vitalKey] ?? 0) : null;
          return (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 11, color: '#e5e5e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}{currentPv != null ? ` (${currentPv})` : ''}
              </span>
              {char && vitalKey ? (
                <button
                  onClick={() => applyDamage(char)}
                  disabled={isApplied}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 4, cursor: isApplied ? 'default' : 'pointer',
                    border: `1px solid ${isApplied ? '#4ade80' : '#f59e0b'}`,
                    background: isApplied ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)',
                    color: isApplied ? '#4ade80' : '#f59e0b',
                  }}
                >
                  {isApplied ? 'Appliqué' : 'Appliquer'}
                </button>
              ) : (
                <span style={{ fontSize: 9, color: '#737373' }}>Introuvable</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
