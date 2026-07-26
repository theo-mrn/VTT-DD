"use client"

// Mixeur audio — reskin D&D du AudioMixerPanel natif : mêmes curseurs horizontaux que le panneau
// natif (pas de knob rotatif, pas d'effet de lueur), habillés en parchemin/cuir.
//
// Données : EXACTEMENT le même canal que le hook natif useAudioMixer (AudioMixerPanel.tsx) — clé
// localStorage 'audioMixerVolumes' + CustomEvent 'audioMixerVolumeChange' — donc les volumes réglés
// ici s'appliquent réellement à tous les consommateurs audio de l'app, et restent synchronisés avec
// le panneau natif si jamais les deux sont ouverts en parallèle.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';

const STORAGE_KEY = 'audioMixerVolumes';
const VOLUME_EVENT = 'audioMixerVolumeChange';

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

// Remplace le AudioMixerPanel natif via setAudioMixerPanelOverride (posé par DndTheme.tsx tant que
// dnd-classic est le système actif) : mêmes props {isOpen, onClose}, même ancrage à droite — le
// raccourci clavier et le bouton tool_mixer existants ouvrent donc directement cette version.
export function DndMixerPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [volumes, setVolumes] = useState<Volumes>(loadVolumes);
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;
  const draggingRef = useRef(false);

  // Sync entrant (autre instance du mixeur, natif ou D&D) — ignoré pendant un drag local pour ne
  // pas se battre avec le curseur en mouvement (notre propre dispatch nous revient aussi).
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
  const updateVolume = useCallback((key: keyof Volumes, value: number) => {
    const next = { ...volumesRef.current, [key]: value };
    volumesRef.current = next;
    setVolumes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setTimeout(() => window.dispatchEvent(new CustomEvent(VOLUME_EVENT, { detail: next })), 0);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-2 top-16 z-50 w-72 rounded-xl border shadow-2xl overflow-hidden"
      style={{
        fontFamily: 'Cinzel, serif',
        background: '#241a11',
        borderColor: 'rgba(201,151,63,0.35)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ background: '#1c140d', borderColor: 'rgba(201,151,63,0.25)' }}
      >
        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#e0b563' }}>
          Pupitre sonore
        </span>
        <button
          onClick={onClose}
          className="text-lg leading-none px-1"
          style={{ color: 'rgba(224,181,99,0.5)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <div className="p-2 space-y-1">
        {CHANNELS.map(({ id, label }) => {
          const volume = volumes[id];
          const isMuted = volume === 0;
          return (
            <div key={id} className="rounded-md p-3" style={{ background: '#1c140d' }}>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: isMuted ? '#4a3520' : '#d9c9a8' }}
                >
                  {label}
                </span>
                <span className="text-[10px] font-mono w-8 text-right" style={{ color: '#8a6f47' }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Slider
                  value={[volume * 100]}
                  onValueChange={(values) => updateVolume(id, values[0] / 100)}
                  max={100}
                  step={1}
                  className={`flex-1 ${isMuted ? 'opacity-50' : 'opacity-100'} [&>.relative]:bg-[#3a2a18] [&>.relative>.absolute]:bg-[#c9973f]`}
                />
                <button
                  onClick={() => updateVolume(id, volume > 0 ? 0 : 1)}
                  title={isMuted ? 'Réactiver' : 'Couper'}
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isMuted ? 'rgba(239,68,68,0.15)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <span
                    className="block w-2 h-2 rounded-full"
                    style={{ background: isMuted ? '#ef4444' : 'rgba(224,181,99,0.4)' }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-2 border-t" style={{ borderColor: 'rgba(201,151,63,0.25)' }}>
        <button
          onClick={() => CHANNELS.forEach(({ id }) => updateVolume(id, 1))}
          className="w-full h-7 rounded-md text-[10px] font-bold uppercase tracking-widest"
          style={{
            color: '#e0b563', background: 'transparent',
            border: '1px solid rgba(201,151,63,0.3)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
