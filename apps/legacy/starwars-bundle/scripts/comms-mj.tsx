// Contrôle des comlinks — overlay MJ en haut à droite de la carte (même emplacement que l'overlay
// de localisation des joueurs). Affiche une ligne par joueur : les MÊMES barres de signal que
// côté joueur, plus le nom. Un clic sur le panneau ouvre l'édition : trois boutons de niveau par
// joueur (override individuel) + une ligne "Tous" qui pose le niveau en lot (et efface les
// overrides individuels). L'état est partagé en temps réel (cf comms.tsx).
import React, { useEffect, useState } from 'react';
import { subscribeCommsMap, writeCommsMap, effectiveLevel, SignalBars, type CommsMap, type CommsLevel } from './comms';
import { sectorCode } from './location';

const ACCENT = '#ffe81f';

const LEVELS: Array<{ id: CommsLevel; label: string; color: string }> = [
  { id: 'connecte', label: 'OK', color: '#4ade80' },
  { id: 'faible', label: 'Interf.', color: '#f59e0b' },
  { id: 'brouille', label: 'Brouillé', color: '#ef4444' },
];

const LevelButtons = ({ current, onSet }: { current: CommsLevel; onSet: (lvl: CommsLevel) => void }) => (
  <span style={{ display: 'inline-flex', gap: 4 }}>
    {LEVELS.map(({ id, label, color }) => (
      <button
        key={id}
        onClick={(e) => { e.stopPropagation(); onSet(id); }}
        style={{
          fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
          border: `1px solid ${current === id ? color : 'rgba(255,255,255,0.15)'}`,
          background: current === id ? `${color}26` : 'transparent',
          color: current === id ? color : 'rgba(255,255,255,0.5)',
        }}
      >
        {label}
      </button>
    ))}
  </span>
);

/** Fabrique le composant d'overlay MJ — api capturé en closure. */
export const makeCommsControl = (api: any) => function CommsControl() {
  const [map, setMap] = useState<CommsMap>({});
  const [players, setPlayers] = useState<Array<{ id: string; name: string; sceneId: string | null }>>([]);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hiddenByPanel, setHiddenByPanel] = useState(false);
  const [sceneInfo, setSceneInfo] = useState<{ scenes: Array<{ id: string; name: string }>; globalSceneId: string | null }>({ scenes: [], globalSceneId: null });

  useEffect(() => subscribeCommsMap(api, setMap), []);
  // Listen to shared flag to allow external toggles (map/layout can close the comlink)
  useEffect(() => {
    const unsubscribe = api.sharedState.subscribe('sw-comms-visible', (v: unknown) => {
      if (v === undefined) return; // leave local state as-is when key absent
      try {
        setVisible(Boolean(v));
      } catch {
        // ignore
      }
    });
    return unsubscribe;
  }, [api.sharedState]);

  // Listen for panel open events from the host layout — fully hide comlink while a panel is open
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { open?: boolean } | undefined;
        setHiddenByPanel(Boolean(detail?.open));
      } catch {
        // ignore
      }
    };
    window.addEventListener('vtt-panel-open', handler as EventListener);
    return () => window.removeEventListener('vtt-panel-open', handler as EventListener);
  }, []);
  useEffect(() => api.scenes.subscribe(setSceneInfo), []);
  useEffect(() => api.roomCharacters.subscribe((docs: Array<Record<string, unknown>>) => {
    setPlayers(docs
      .filter((d) => d.type === 'joueurs')
      .map((d) => ({
        id: d.id as string,
        name: (d.Nomperso as string) || '(sans nom)',
        sceneId: (d.currentSceneId as string) || null,
      })));
  }), []);

  if (players.length === 0) return null;

  // If host requested a full hide (panel open), render nothing
  if (hiddenByPanel) return null;

  // If explicitly hidden by the MJ, render a compact toggle to re-open the panel
  if (!visible) {
    return (
      <div style={{ pointerEvents: 'auto' }}>
        <button
          onClick={() => setVisible(true)}
          title="Afficher le panneau COMLINK"
          style={{
            fontSize: 11, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(255,232,31,0.25)', background: 'rgba(3,3,4,0.7)', color: ACCENT
          }}
        >
          COMLINK
        </button>
      </div>
    );
  }

  // Secteur INDIVIDUEL : chaque joueur peut être sur une scène différente — code tiré du nom de SA
  // scène (currentSceneId, sinon la scène globale du groupe), mêmes 2 caractères que côté joueur.
  const sectorFor = (sceneId: string | null): string => {
    const effective = sceneId ?? sceneInfo.globalSceneId;
    const scene = sceneInfo.scenes.find((s) => s.id === effective);
    return sectorCode(scene?.name ?? '');
  };

  // Override individuel : on garde le reste de la carte tel quel.
  const setFor = (persoId: string, lvl: CommsLevel) => writeCommsMap(api, { ...map, [persoId]: lvl });
  // Lot : remplace TOUTE la carte — le niveau '*' s'applique à tous, les overrides sont effacés.
  const setAll = (lvl: CommsLevel) => writeCommsMap(api, { '*': lvl });

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      title={open ? undefined : 'Cliquer pour modifier les comlinks'}
      style={{
        pointerEvents: 'auto', cursor: 'pointer',
        fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em',
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '8px 12px', borderRadius: 8,
        border: `1px solid ${open ? ACCENT : 'rgba(255,232,31,0.25)'}`,
        background: 'rgba(3,3,4,0.85)', color: 'rgba(255,255,255,0.8)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, color: ACCENT, fontWeight: 700 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          RÉSEAU COMLINK
          <span style={{ fontSize: 8, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setVisible(false); }}
            title="Masquer"
            style={{ fontSize: 10, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.7)' }}
          >
            ✕
          </button>
        </div>
      </span>

      {/* propagate local hide to shared state so other clients know */}
      <EffectOnHide visible={visible} api={api} />

      {open && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontWeight: 700 }}>Tous</span>
          <LevelButtons current={effectiveLevel(map, null)} onSet={setAll} />
        </span>
      )}

      {players.map((p) => (
        <span key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <SignalBars level={effectiveLevel(map, p.id)} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{p.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ACCENT, flexShrink: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT, animation: 'sw-loc-pulse 2s ease-in-out infinite' }} />
              {sectorFor(p.sceneId)}
            </span>
          </span>
          {open && <LevelButtons current={effectiveLevel(map, p.id)} onSet={(lvl) => setFor(p.id, lvl)} />}
        </span>
      ))}
    </div>
  );
};

// Small internal component: keep shared state in sync when visible changes
function EffectOnHide({ visible, api }: { visible: boolean; api: any }) {
  useEffect(() => {
    try {
      api.sharedState.set('sw-comms-visible', visible);
    } catch (e) {
      // ignore
    }
  }, [visible, api.sharedState]);
  return null;
}
