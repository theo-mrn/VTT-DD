// Scanner de Fréquences (interception comms) — onglet flottant joueur. v2 : calage de sinusoïde.
// L'oscilloscope superpose DEUX ondes : la porteuse interceptée (bruitée tant qu'on est loin de la
// solution) et la sinusoïde réglée par le joueur. Trois réglages à aligner :
//  - FRÉQUENCE : fausse → l'onde du joueur DÉRIVE contre la porteuse (battements, d'autant plus
//    rapides que l'écart est grand — comme une vraie radio) ; bonne → les deux ondes s'immobilisent
//    l'une par rapport à l'autre.
//  - DÉCALAGE (phase) : superpose horizontalement l'onde du joueur sur la porteuse.
//  - GAIN (amplitude) : égalise la hauteur des crêtes.
// Le message (PermanentScramble) ne devient lisible que lorsque les TROIS sont calés — un simple
// balayage de fréquence plafonne le décodage à ~55 % de brouillage (illisible). Le MJ programme
// fréquence/décalage/gain + message dans scanner-mj.tsx, via api.sharedState (scanner-shared.tsx).
import React, { useEffect, useRef, useState } from 'react';
import { PermanentScramble } from './comms';
import {
  subscribeScanner, scrambleFor, FREQ_MIN, FREQ_MAX, AMP_MIN, AMP_MAX,
  type ScannerConfig,
} from './scanner-shared';

const ACCENT = '#ffe81f';

/** Cycles visibles de la sinusoïde sur la largeur de l'oscilloscope. */
const CYCLES = 4;
/** Vitesse de dérive relative (cycles/s par MHz d'écart) — l'indice visuel des battements. */
const BEAT_RATE = 0.12;

/** Fabrique le composant d'onglet — api capturé en closure (le rail ne passe aucune prop). */
export const makeScannerPanel = (api: any) => function ScannerPanel() {
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [freq, setFreq] = useState((FREQ_MIN + FREQ_MAX) / 2);
  // Départs volontairement HORS des valeurs par défaut du MJ (phase 0 / gain 1) : même un canal v1
  // sans phase/gain programmés demande de bouger ces réglages jusqu'aux bonnes valeurs.
  const [phase, setPhase] = useState(0.25);
  const [amp, setAmp] = useState(0.6);
  const [, setFrame] = useState(0);

  useEffect(() => subscribeScanner(api, setConfig), []);

  // Re-render à chaque frame pour animer l'oscilloscope (phase dérivée de l'horloge, pas d'un état
  // accumulé — robuste au remontage du panneau par l'hôte).
  useEffect(() => {
    let raf = 0;
    const tick = () => { setFrame((f) => f + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cfg = config ?? { target: null, phase: 0, amplitude: 1, message: '' };
  const hasSignal = cfg.target != null;
  const message = cfg.message ?? '';
  const intensity = hasSignal ? scrambleFor(cfg, freq, phase, amp) : 1;
  const locked = hasSignal && intensity < 0.04;
  const sync = Math.round((1 - intensity) * 100);

  const t = performance.now() / 1000;
  const N = 90;

  // ── Porteuse interceptée : statique (phase/gain de la cible), noyée dans le bruit tant que le
  // calage est mauvais — impossible de lire directement le décalage/gain cibles de loin. ──
  const carrierPoints: string[] = [];
  // ── Onde du joueur : dérive contre la porteuse à vitesse ∝ écart de fréquence (battements). ──
  const playerPoints: string[] = [];
  const drift = hasSignal ? (freq - (cfg.target as number)) * BEAT_RATE * t : t * 2;

  for (let i = 0; i <= N; i++) {
    const x = (i / N) * 100;
    const u = (i / N) * CYCLES;

    if (hasSignal) {
      const clean = Math.sin(2 * Math.PI * (u + cfg.phase)) * 16 * cfg.amplitude;
      const noise = (Math.random() - 0.5) * 26 * intensity;
      carrierPoints.push(`${x.toFixed(1)},${(30 + clean + noise).toFixed(1)}`);
    } else {
      carrierPoints.push(`${x.toFixed(1)},${(30 + (Math.random() - 0.5) * 24).toFixed(1)}`);
    }

    const yp = Math.sin(2 * Math.PI * (u + phase + drift)) * 16 * amp;
    playerPoints.push(`${x.toFixed(1)},${(30 + yp).toFixed(1)}`);
  }

  const waveColor = locked ? '#4ade80' : sync > 55 ? ACCENT : '#f59e0b';

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, letterSpacing: '0.15em', color: ACCENT, textTransform: 'uppercase' }}>
          Scanner de fréquences
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: waveColor, whiteSpace: 'nowrap' }}>
          SYNC {hasSignal ? sync.toString().padStart(3, '0') : '---'}%
        </span>
      </div>

      {/* Oscilloscope : porteuse interceptée + onde du joueur superposées */}
      <div style={{ position: 'relative', width: '100%', height: 130, borderRadius: 10, overflow: 'hidden', background: 'rgba(3,3,4,0.9)', border: `1px solid ${locked ? '#4ade80' : 'rgba(255,232,31,0.3)'}` }}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[15, 30, 45].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={ACCENT} strokeOpacity="0.08" strokeWidth="0.3" />
          ))}
          {[25, 50, 75].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="60" stroke={ACCENT} strokeOpacity="0.08" strokeWidth="0.3" />
          ))}
          {/* Porteuse interceptée (référence, terne) */}
          <polyline
            points={carrierPoints.join(' ')}
            fill="none"
            stroke="rgba(255,232,31,0.45)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Onde du joueur (vive) */}
          <polyline
            points={playerPoints.join(' ')}
            fill="none"
            stroke={waveColor}
            strokeWidth="1.2"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 2px ${waveColor})` }}
          />
        </svg>
        <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,232,31,0.4)', letterSpacing: '0.1em' }}>
          SIGNAL INTERCEPTÉ
        </span>
        <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 7, fontFamily: 'monospace', color: waveColor, letterSpacing: '0.1em' }}>
          VOTRE PORTEUSE
        </span>
      </div>

      {/* Message intercepté */}
      <div style={{ width: '100%', minHeight: 44, padding: '8px 10px', borderRadius: 8, background: 'rgba(3,3,4,0.6)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!hasSignal ? (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            — AUCUN SIGNAL —
          </span>
        ) : message ? (
          <PermanentScramble
            text={message}
            intensity={intensity}
            style={{
              fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.08em', textAlign: 'center',
              color: locked ? '#4ade80' : ACCENT, wordBreak: 'break-word',
              textShadow: locked ? '0 0 6px rgba(74,222,128,0.5)' : undefined,
            }}
          />
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>· · ·</span>
        )}
      </div>

      {/* Réglages : trois potentiomètres rotatifs (drag circulaire = balayage, molette = accord fin) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingTop: 4 }}>
        <Knob
          label="Fréquence" unit="MHz" value={freq} display={freq.toFixed(0)}
          min={FREQ_MIN} max={FREQ_MAX} step={1} color={waveColor}
          onChange={setFreq}
        />
        <Knob
          label="Décalage" unit="τ" value={phase} display={phase.toFixed(2)}
          min={0} max={1} step={0.01} color={waveColor}
          onChange={setPhase}
        />
        <Knob
          label="Gain" unit="×" value={amp} display={amp.toFixed(2)}
          min={AMP_MIN} max={AMP_MAX} step={0.01} color={waveColor}
          onChange={setAmp}
        />
      </div>
    </div>
  );
};

// ── Potentiomètre rotatif (adapté du ReactorKnob fourni par l'utilisateur, sans framer-motion —
// lissage rAF façon spring). Course -135°..+135°. La ROTATION est continue (snap au pas `step` du
// paramètre, pas aux crans visuels : 40 crans sur 100 MHz donneraient des pas de 2,5 MHz, trop
// grossiers pour verrouiller le canal) ; la molette souris ajuste au pas près pour l'accord fin.
// L'anneau de ticks s'illumine jusqu'à l'angle courant, la lueur monte avec le niveau. ────────────
const KNOB_MIN_DEG = -135;
const KNOB_MAX_DEG = 135;
const KNOB_TICKS = 24;

function Knob({ label, unit, value, display, min, max, step, color, onChange }: {
  label: string; unit: string; value: number; display: string;
  min: number; max: number; step: number; color: string; onChange: (v: number) => void;
}) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Mapping angulaire ABSOLU (comme le ReactorKnob d'origine) : l'angle du pointeur autour du knob
  // donne directement la valeur, une seule course -135°..+135°. Praticable pour les trois réglages
  // depuis que la fréquence est passée à 50 positions (1 MHz ≈ 5,4°) — plus besoin de mode fin ni
  // de multi-tours. Le centre est FIGÉ au pointerdown : un décalage de layout en plein drag ne fait
  // pas dériver la valeur.
  const dragStateRef = useRef<{ cx: number; cy: number } | null>(null);

  const angleFor = (v: number) => KNOB_MIN_DEG + ((v - min) / (max - min)) * (KNOB_MAX_DEG - KNOB_MIN_DEG);
  const targetAngleRef = useRef(angleFor(value));
  const smoothAngleRef = useRef(angleFor(value));
  const [smoothAngle, setSmoothAngle] = useState(angleFor(value));

  const snap = (v: number): number => {
    const clamped = Math.max(min, Math.min(max, v));
    return Math.round(clamped / step) * step;
  };

  // Valeur externe → cible d'angle (aussi pendant le drag : la cible EST la valeur propagée).
  useEffect(() => { targetAngleRef.current = angleFor(value); }, [value, min, max]);

  // Lissage rAF (inertie du corps mécanique) — remplace le useSpring de l'original.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = targetAngleRef.current;
      const s = smoothAngleRef.current;
      const n = s + (t - s) * 0.3;
      if (Math.abs(n - s) > 0.05) {
        smoothAngleRef.current = n;
        setSmoothAngle(n);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      let degs = Math.atan2(e.clientY - st.cy, e.clientX - st.cx) * (180 / Math.PI) + 90;
      if (degs > 180) degs -= 360;
      if (degs < KNOB_MIN_DEG && degs > -180) degs = KNOB_MIN_DEG;
      if (degs > KNOB_MAX_DEG) degs = KNOB_MAX_DEG;
      const ratio = (degs - KNOB_MIN_DEG) / (KNOB_MAX_DEG - KNOB_MIN_DEG);
      onChangeRef.current(snap(min + ratio * (max - min)));
    };
    const up = () => { dragStateRef.current = null; setIsDragging(false); document.body.style.cursor = ''; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const level = (value - min) / (max - min);
  const ticks = Array.from({ length: KNOB_TICKS + 1 });

  return (
    // Largeur FIXE : le readout change de nombre de caractères (ex "99.9" → "100.0") — sans largeur
    // figée, toute la rangée de knobs se redistribuait à ce moment-là, déplaçant les knobs sous le
    // pointeur en plein réglage.
    <div style={{ width: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none' }}>
      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>

      <div style={{ position: 'relative', width: 84, height: 84 }}>
        {/* Lueur de fond ∝ niveau */}
        <div style={{
          position: 'absolute', inset: 6, borderRadius: '50%', background: color,
          filter: 'blur(14px)', opacity: 0.05 + level * 0.3, pointerEvents: 'none',
        }} />

        {/* Anneau de ticks : illuminés jusqu'à l'angle courant */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {ticks.map((_, i) => {
            const angle = (i / KNOB_TICKS) * (KNOB_MAX_DEG - KNOB_MIN_DEG) + KNOB_MIN_DEG;
            const lit = smoothAngle >= angle;
            return (
              <div key={i} style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: '100%', transform: `translateX(-50%) rotate(${angle}deg)` }}>
                <div style={{
                  width: 2, height: 6, borderRadius: 1,
                  background: lit ? color : '#404040', opacity: lit ? 1 : 0.25,
                  boxShadow: lit ? `0 0 6px ${color}99` : 'none',
                }} />
              </div>
            );
          })}
        </div>

        {/* Corps du knob */}
        <div
          ref={knobRef}
          onPointerDown={() => {
            const rect = knobRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragStateRef.current = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
            setIsDragging(true);
            document.body.style.cursor = 'grabbing';
          }}
          onWheel={(e) => onChangeRef.current(snap(value - Math.sign(e.deltaY) * step))}
          style={{
            position: 'absolute', top: '50%', left: '50%', width: 58, height: 58,
            transform: `translate(-50%, -50%) rotate(${smoothAngle}deg)`,
            borderRadius: '50%', touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab',
            background: '#171717', border: '1px solid #262626',
            boxShadow: '0 8px 20px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Chapeau */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: '#0a0a0a',
            boxShadow: 'inset 0 2px 5px rgba(0,0,0,1)', border: '1px solid rgba(38,38,38,0.5)',
            position: 'relative',
          }}>
            {/* Index lumineux */}
            <div style={{
              position: 'absolute', top: 3, left: '50%', transform: 'translateX(-50%)',
              width: 3, height: 9, borderRadius: 2, background: color,
              boxShadow: `0 0 ${Math.max(4, level * 12)}px ${color}`,
            }} />
          </div>
        </div>
      </div>

      {/* Readout digital */}
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color, textShadow: `0 0 8px ${color}66`, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        {display}<span style={{ fontSize: 8, opacity: 0.6 }}> {unit}</span>
      </span>
    </div>
  );
}
