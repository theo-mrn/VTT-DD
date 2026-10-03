// Panneau MJ du Scanner de Fréquences — v2 compact (panneau FLOTTANT, plus de colonne pleine
// hauteur). L'émission est pilotée par un interrupteur industriel à levier (adapté de
// l'IndustrialSwitch fourni par l'utilisateur, sans framer-motion : drag pointeur + transitions
// CSS) : STANDBY = signal coupé (target null côté joueurs), ONLINE = émission du canal programmé.
// Fréquence (MHz entier) + décalage + gain + message ; modifier un champ pendant l'émission met le
// canal à jour au blur. Écrit dans api.sharedState (scanner-shared.tsx) — les scanners joueurs se
// mettent à jour en direct.
import React, { useEffect, useRef, useState } from 'react';
import {
  subscribeScanner, writeScanner, FREQ_MIN, FREQ_MAX, AMP_MIN, AMP_MAX, clampAmp,
  type ScannerConfig,
} from './scanner-shared';

const ACCENT = '#ffe81f';
const GREEN = '#4ade80';

const fieldStyle: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 14, fontWeight: 700, padding: '6px 8px', borderRadius: 7,
  background: 'rgba(3,3,4,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: ACCENT, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
};

/** Fabrique le composant d'onglet MJ — api capturé en closure. */
export const makeScannerControl = (api: any) => function ScannerControl() {
  const [isOn, setIsOn] = useState(false);
  const [freqInput, setFreqInput] = useState('');
  const [phaseInput, setPhaseInput] = useState('0');
  const [ampInput, setAmpInput] = useState('1');
  const [messageInput, setMessageInput] = useState('');
  // Écho de nos propres écritures : le subscribe renvoie ce qu'on vient d'écrire — resynchroniser
  // les champs à ce moment-là écraserait la saisie en cours (curseur qui saute).
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => subscribeScanner(api, (c: ScannerConfig) => {
    const incoming = JSON.stringify(c);
    setIsOn(c.target != null && c.message !== '');
    if (incoming === lastWrittenRef.current) return;
    setFreqInput(c.target != null ? c.target.toFixed(0) : '');
    setPhaseInput(c.phase.toFixed(2));
    setAmpInput(c.amplitude.toFixed(2));
    setMessageInput(c.message);
  }), []);

  const parseNum = (s: string): number => parseFloat(s.replace(',', '.'));

  const parseFields = (): ScannerConfig => {
    const f = parseNum(freqInput);
    const target = !isNaN(f) ? Math.round(Math.max(FREQ_MIN, Math.min(FREQ_MAX, f))) : null;
    const p = parseNum(phaseInput);
    const phase = !isNaN(p) ? Math.max(0, Math.min(1, p)) : 0;
    const a = parseNum(ampInput);
    const amplitude = !isNaN(a) ? clampAmp(a) : 1;
    return { target, phase, amplitude, message: messageInput };
  };

  const write = (config: ScannerConfig) => {
    lastWrittenRef.current = JSON.stringify(config);
    writeScanner(api, config);
  };

  const handleToggle = (next: boolean): boolean => {
    if (next) {
      const cfg = parseFields();
      if (cfg.target == null || cfg.message === '') {
        api.showToast('Fréquence et message requis pour émettre.', { type: 'error' });
        return false; // le levier retombe
      }
      write(cfg);
      setIsOn(true);
      return true;
    }
    const cfg = parseFields();
    write({ ...cfg, target: null });
    setIsOn(false);
    return true;
  };

  // Champ modifié pendant l'émission : le canal se met à jour au blur.
  const commitIfOn = () => { if (isOn) { const cfg = parseFields(); if (cfg.target != null) write(cfg); } };

  const randomize = () => {
    const f = Math.round(FREQ_MIN + Math.random() * (FREQ_MAX - FREQ_MIN));
    const p = Math.random();
    const a = AMP_MIN + Math.random() * (AMP_MAX - AMP_MIN);
    setFreqInput(f.toFixed(0));
    setPhaseInput(p.toFixed(2));
    setAmpInput(a.toFixed(2));
    if (isOn) write({ target: f, phase: p, amplitude: clampAmp(a), message: messageInput });
  };

  return (
    <div style={{ padding: 14, width: 320, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 12, userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.15em', color: ACCENT, textTransform: 'uppercase', fontWeight: 700 }}>
          Canal secret
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: isOn ? GREEN : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
          {isOn ? '● ÉMISSION' : '○ COUPÉ'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        {/* Interrupteur d'émission */}
        <IndustrialSwitch isOn={isOn} onToggle={handleToggle} />

        {/* Paramètres */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={labelStyle}>Fréquence ({FREQ_MIN}–{FREQ_MAX} MHz)</span>
            <input
              type="number" step="1" min={FREQ_MIN} max={FREQ_MAX}
              value={freqInput}
              onChange={(e) => setFreqInput(e.target.value)}
              onBlur={commitIfOn}
              placeholder="ex : 142"
              style={fieldStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={labelStyle}>Décalage</span>
              <input
                type="number" step="0.01" min={0} max={1}
                value={phaseInput}
                onChange={(e) => setPhaseInput(e.target.value)}
                onBlur={commitIfOn}
                style={fieldStyle}
              />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={labelStyle}>Gain</span>
              <input
                type="number" step="0.01" min={AMP_MIN} max={AMP_MAX}
                value={ampInput}
                onChange={(e) => setAmpInput(e.target.value)}
                onBlur={commitIfOn}
                style={fieldStyle}
              />
            </label>
          </div>
          <button
            onClick={randomize}
            style={{
              fontSize: 9, fontWeight: 700, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid rgba(255,232,31,0.3)', background: 'transparent', color: ACCENT,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            Canal aléatoire
          </button>
        </div>
      </div>

      {/* Message secret */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={labelStyle}>Message intercepté</span>
        <textarea
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onBlur={commitIfOn}
          placeholder="Révélé une fois la sinusoïde calée…"
          rows={3}
          style={{
            fontFamily: 'monospace', fontSize: 11, padding: '6px 8px', borderRadius: 7, resize: 'vertical',
            background: 'rgba(3,3,4,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', outline: 'none',
          }}
        />
      </label>
    </div>
  );
};

// ── Interrupteur industriel à levier (adapté de l'IndustrialSwitch fourni — sans framer-motion :
// drag pointeur incrémental + transition CSS au relâcher). Levier en HAUT = STANDBY, tiré en BAS =
// ONLINE. onToggle retourne false pour refuser la bascule (le levier retombe). ────────────────────
const SW_TRAVEL = 46;

function IndustrialSwitch({ isOn, onToggle }: { isOn: boolean; onToggle: (next: boolean) => boolean }) {
  const [dragY, setDragY] = useState<number | null>(null); // null = position posée (suit isOn)
  const dragRef = useRef<{ startY: number; startPos: number; moved: boolean } | null>(null);

  const restY = isOn ? SW_TRAVEL : 0;
  const y = dragY ?? restY;
  const progress = y / SW_TRAVEL;

  const ledColor = progress > 0.5 ? GREEN : '#451a1a';
  const ledGlow = progress > 0.5 ? `0 0 14px rgba(74,222,128,0.5)` : 'none';

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      const next = Math.max(0, Math.min(SW_TRAVEL, st.startPos + (e.clientY - st.startY)));
      if (Math.abs(e.clientY - st.startY) > 3) st.moved = true;
      setDragY(next);
    };
    const up = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      dragRef.current = null;
      const pos = Math.max(0, Math.min(SW_TRAVEL, st.startPos + (e.clientY - st.startY)));
      // Clic sans mouvement = toggle direct ; sinon on décide au demi-parcours.
      const next = st.moved ? pos > SW_TRAVEL / 2 : !isOn;
      setDragY(null);
      if (next !== isOn) onToggle(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [isOn, onToggle]);

  return (
    <div style={{
      position: 'relative', width: 74, borderRadius: 16, flexShrink: 0,
      background: '#141414', border: '2px solid #262626',
      boxShadow: '0 12px 30px rgba(0,0,0,0.8), inset 0 2px 5px rgba(0,0,0,1)',
      display: 'flex', justifyContent: 'center', padding: 6,
    }}>
      {/* Bandes de danger (bas) */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 34, borderRadius: '0 0 14px 14px',
        opacity: 0.1, pointerEvents: 'none', overflow: 'hidden',
        background: 'repeating-linear-gradient(45deg, transparent, transparent 8px, #000 8px, #000 16px)',
      }} />

      {/* Rail */}
      <div style={{
        position: 'absolute', top: 14, bottom: 14, width: 16, borderRadius: 8,
        background: '#000', boxShadow: 'inset 0 2px 5px rgba(0,0,0,1)',
      }} />

      {/* LED d'état */}
      <div style={{
        position: 'absolute', top: -6, width: 40, height: 5, borderRadius: 3, zIndex: 3,
        background: ledColor, boxShadow: ledGlow, border: '1px solid #171717',
        transition: 'background 0.25s, box-shadow 0.25s',
      }} />

      {/* Levier */}
      <div
        onPointerDown={(e) => {
          dragRef.current = { startY: e.clientY, startPos: y, moved: false };
          document.body.style.cursor = 'grabbing';
        }}
        onPointerUp={() => { document.body.style.cursor = ''; }}
        style={{
          position: 'relative', zIndex: 2, width: 60, height: 62, touchAction: 'none',
          transform: `translateY(${y}px)`,
          transition: dragY == null ? 'transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)' : 'none',
          cursor: dragY != null ? 'grabbing' : 'grab',
        }}
      >
        <div style={{
          width: '100%', height: '100%', borderRadius: 10,
          background: progress > 0.5
            ? 'linear-gradient(180deg, #2d4f40 0%, #153025 100%)'
            : 'linear-gradient(180deg, #404040 0%, #262626 100%)',
          border: '1px solid #404040',
          boxShadow: '0 8px 16px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.25s', overflow: 'hidden',
        }}>
          {/* Stries de grip */}
          <div style={{ position: 'absolute', top: 8, width: 38, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.3 }}>
            <div style={{ height: 2, width: '100%', background: '#000', borderRadius: 1 }} />
            <div style={{ height: 2, width: '100%', background: '#000', borderRadius: 1 }} />
          </div>
          {/* État */}
          <span style={{
            marginTop: 10, fontSize: 8, fontWeight: 900, letterSpacing: '0.2em',
            color: progress > 0.5 ? GREEN : '#737373',
            textShadow: progress > 0.5 ? '0 0 8px rgba(74,222,128,0.8)' : 'none',
            transition: 'color 0.25s',
          }}>
            {progress > 0.5 ? 'ONLINE' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Labels OFF / ON */}
      <span style={{ position: 'absolute', top: 16, right: 2, fontSize: 7, color: '#525252', letterSpacing: '0.15em', writingMode: 'vertical-rl' }}>OFF</span>
      <span style={{ position: 'absolute', bottom: 16, right: 2, fontSize: 7, color: '#525252', letterSpacing: '0.15em', writingMode: 'vertical-rl' }}>ON</span>
    </div>
  );
}
