// Mixeur audio — version Star Wars du AudioMixerPanel natif : 4 bandes de fader VERTICALES
// (Effets, Zones, Musique, Dés 3D), fidèles au composant iso-fader fourni par l'utilisateur
// (LED meter, poignée à inertie, glow d'intensité gris→orange→rouge, readout digital).
//
// Pas de framer-motion : le linker de bundle-scripts ne résout que react/lucide-react — le lissage
// spring est reproduit par interpolation exponentielle sur requestAnimationFrame (même approche que
// bombardement.tsx).
//
// Données : EXACTEMENT le même canal que le hook natif useAudioMixer (AudioMixerPanel.tsx) — clé
// localStorage 'audioMixerVolumes' + CustomEvent 'audioMixerVolumeChange' — donc les volumes réglés
// ici s'appliquent réellement à tous les consommateurs audio de l'app, et les deux mixeurs restent
// synchronisés si jamais les deux sont ouverts.
import React, { useState, useRef, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'audioMixerVolumes';
const VOLUME_EVENT = 'audioMixerVolumeChange';

const FADER_HEIGHT = 220;
const HANDLE_HEIGHT = 28;
const MAX_Y = FADER_HEIGHT - HANDLE_HEIGHT;
const TOTAL_TICKS = 16;

type Volumes = { quickSounds: number; musicZones: number; backgroundMusic: number; dice3d: number };

const CHANNELS: Array<{ id: keyof Volumes; label: string }> = [
  { id: 'quickSounds', label: 'Effets' },
  { id: 'musicZones', label: 'Zones' },
  { id: 'backgroundMusic', label: 'Musique' },
  { id: 'dice3d', label: 'Dés 3D' },
];

function loadVolumes(): Volumes {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.dice3d !== 'number') parsed.dice3d = 1;
      return parsed as Volumes;
    }
  } catch { /* prefs corrompues : repli sur les défauts */ }
  return { quickSounds: 1, musicZones: 1, backgroundMusic: 1, dice3d: 1 };
}

// Remplace le AudioMixerPanel natif via api.audio.setMixerPanel : mêmes props {isOpen, onClose},
// même ancrage à droite — le raccourci clavier et le bouton tool_mixer existants ouvrent donc
// directement CETTE version quand le bundle est chargé.
export const makeMixerPanel = (_api: any) => function SwMixerPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [volumes, setVolumes] = useState<Volumes>(loadVolumes);
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;
  const draggingRef = useRef(false);

  // Sync entrant (autre instance du mixeur, natif ou SW) — ignoré pendant un drag local pour ne
  // pas se battre avec la poignée en mouvement (notre propre dispatch nous revient aussi).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Volumes | undefined;
      if (detail && !draggingRef.current) setVolumes(detail);
    };
    window.addEventListener(VOLUME_EVENT, handler);
    return () => window.removeEventListener(VOLUME_EVENT, handler);
  }, []);

  // AUCUN effet de bord dans l'updater de setState : React exécute l'updater pendant sa phase de
  // rendu, et un dispatchEvent synchrone y déclencherait le setVolumes du hook natif (useAudioMixer)
  // dans un AUTRE composant → « Cannot update a component while rendering a different component ».
  // La valeur suivante est calculée depuis une ref (fiable même en rafale pendant un drag), et le
  // dispatch est différé en macrotâche, hors de tout cycle de rendu en cours.
  const updateVolume = useCallback((key: keyof Volumes, value: number) => {
    const next = { ...volumesRef.current, [key]: value };
    volumesRef.current = next;
    setVolumes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setTimeout(() => window.dispatchEvent(new CustomEvent(VOLUME_EVENT, { detail: next })), 0);
  }, []);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', right: 8, top: 64, zIndex: 50,
      fontFamily: 'monospace', userSelect: 'none', padding: 16,
      background: 'rgba(10,10,12,0.95)', border: '1px solid rgba(255,232,31,0.25)',
      borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.2em', color: '#ffe81f', textTransform: 'uppercase', fontWeight: 700 }}>
          Mixeur audio
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 18 }}>
        {CHANNELS.map(({ id, label }) => (
          <FaderStrip
            key={id}
            label={label}
            value={volumes[id]}
            onChange={(v) => updateVolume(id, v)}
            onDragState={(d) => { draggingRef.current = d; }}
          />
        ))}
      </div>

      <button
        onClick={() => CHANNELS.forEach(({ id }) => updateVolume(id, 1))}
        style={{
          marginTop: 14, width: '100%', padding: '6px 0', borderRadius: 6, cursor: 'pointer',
          border: '1px solid rgba(255,232,31,0.3)', background: 'transparent', color: '#ffe81f',
          fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
        }}
      >
        Réinitialiser
      </button>
    </div>
  );
};

/** Une bande verticale : LED meter à gauche + piste de fader à droite, poignée à inertie (lerp
 *  rAF façon spring), readout % en bas. `value` contrôlé (0..1), onChange émis en continu pendant
 *  le drag. */
function FaderStrip({ label, value, onChange, onDragState }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onDragState: (dragging: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Cible (px depuis le haut de la piste) vs. position lissée affichée.
  const targetYRef = useRef((1 - value) * MAX_Y);
  const smoothYRef = useRef((1 - value) * MAX_Y);
  const [smoothY, setSmoothY] = useState((1 - value) * MAX_Y);
  const draggingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Valeur externe (autre mixeur, reset) → recale la cible, seulement hors drag local.
  useEffect(() => {
    if (!draggingRef.current) targetYRef.current = (1 - value) * MAX_Y;
  }, [value]);

  // Boucle de lissage : lerp exponentiel vers la cible ; pendant le drag, chaque frame propage la
  // valeur correspondante (volume live pendant le mouvement, comme un vrai fader).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = targetYRef.current;
      const s = smoothYRef.current;
      const n = s + (t - s) * 0.25;
      if (Math.abs(n - s) > 0.05) {
        smoothYRef.current = n;
        setSmoothY(n);
        if (draggingRef.current) {
          onChangeRef.current(Math.min(1, Math.max(0, 1 - n / MAX_Y)));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const yFromPointer = (clientY: number): number => {
    const el = trackRef.current;
    if (!el) return targetYRef.current;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top - HANDLE_HEIGHT / 2;
    if (y < 0) y = 0;
    if (y > MAX_Y) y = MAX_Y;
    return y;
  };

  const startDrag = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setIsDragging(true);
    onDragState(true);
    targetYRef.current = yFromPointer(e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: PointerEvent) => { targetYRef.current = yFromPointer(e.clientY); };
    const up = () => {
      draggingRef.current = false;
      setIsDragging(false);
      onDragState(false);
      // Commit final : la cible exacte (pas la position lissée encore en retard).
      onChangeRef.current(Math.min(1, Math.max(0, 1 - targetYRef.current / MAX_Y)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const pct = Math.round(Math.min(100, Math.max(0, (1 - smoothY / MAX_Y) * 100)));
  // Glow d'intensité gris → orange → rouge chaud, fidèle à l'iso-fader d'origine.
  const glowColor = pct >= 90 ? '#ff2200' : pct > 0 ? '#f97316' : '#404040';
  const glowOpacity = 0.1 + (pct / 100) * 0.7;

  const ticks = Array.from({ length: TOTAL_TICKS + 1 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{label}</span>

      <div style={{ display: 'flex', gap: 8 }}>
        {/* LED METER */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: FADER_HEIGHT, padding: '2px 0' }}>
          {ticks.map((_, i) => {
            const threshold = ((TOTAL_TICKS - i) / TOTAL_TICKS) * 100;
            const lit = pct >= threshold;
            const color = pct >= 90 && threshold >= 90 ? '#ef4444' : '#f97316';
            return (
              <div key={i} style={{
                width: 16, height: 4, borderRadius: 1,
                background: color,
                opacity: lit ? 1 : 0.1,
                boxShadow: lit ? '0 0 5px rgba(249,115,22,0.5)' : 'none',
              }} />
            );
          })}
        </div>

        {/* FADER TRACK */}
        <div
          ref={trackRef}
          onPointerDown={startDrag}
          style={{
            position: 'relative', width: 34, height: FADER_HEIGHT, borderRadius: 17,
            background: '#0a0a0a', border: '1px solid #262626',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,1)',
            cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none',
          }}
        >
          {/* Ligne centrale */}
          <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, background: '#262626', transform: 'translateX(-50%)' }} />

          {/* Poignée */}
          <div style={{
            position: 'absolute', left: 2, width: 28, height: HANDLE_HEIGHT, borderRadius: 5,
            top: smoothY, background: '#262626', borderTop: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 2,
          }}>
            {/* Stries de grip */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: 0.3 }}>
              <div style={{ width: 16, height: 2, background: '#000' }} />
              <div style={{ width: 16, height: 2, background: '#000' }} />
              <div style={{ width: 16, height: 2, background: '#000' }} />
            </div>
            {/* Témoin lumineux */}
            <div style={{
              position: 'absolute', left: 4, right: 4, top: '50%', height: 2, transform: 'translateY(-50%)',
              background: glowColor, opacity: glowOpacity,
              boxShadow: pct > 0 ? `0 0 10px ${glowColor}` : 'none',
            }} />
          </div>
        </div>
      </div>

      {/* Readout digital */}
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: pct === 0 ? '#525252' : '#f97316' }}>
        {pct.toString().padStart(3, '0')}%
      </span>

      {/* Mute */}
      <button
        onClick={() => onChange(value > 0 ? 0 : 1)}
        title={value === 0 ? 'Réactiver' : 'Couper'}
        style={{
          width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0,
          border: `1px solid ${value === 0 ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)'}`,
          background: value === 0 ? 'rgba(239,68,68,0.25)' : 'transparent',
        }}
      >
        <span style={{ display: 'block', width: 6, height: 6, margin: 'auto', borderRadius: '50%', background: value === 0 ? '#ef4444' : 'rgba(255,255,255,0.35)' }} />
      </button>
    </div>
  );
}
