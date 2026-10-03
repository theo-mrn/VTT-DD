// Onglet "Instruments" — fusion des anciens onglets sidebar flottants "Radar", "Scanner de
// fréquences" et "Moniteur d'activité" en un seul panneau flottant à sous-navigation (même principe
// que codex.tsx pour Vaisseaux/Planètes). Un seul instrument est monté à la fois : les deux autres
// arrêtent leur rAF/souscriptions tant qu'on ne les consulte pas, comme de vrais instruments qu'on
// bascule sur un même écran de bord.
import React, { useState } from 'react';
import { Radar as RadarIcon, RadioTower, Activity } from 'lucide-react';
import { makeRadarPanel } from './radar';
import { makeScannerPanel } from './scanner';
import { makeActivityMonitorPanel } from './activity-monitor';

type Instrument = 'radar' | 'scanner' | 'activity';

const ACCENT = '#ffe81f';

const TABS: Array<{ id: Instrument; label: string; icon: any }> = [
  { id: 'radar', label: 'Radar', icon: RadarIcon },
  { id: 'scanner', label: 'Scanner', icon: RadioTower },
  { id: 'activity', label: 'Activité', icon: Activity },
];

export const makeInstrumentsPanel = (api: any) => {
  const RadarPanel = makeRadarPanel(api);
  const ScannerPanel = makeScannerPanel(api);
  const ActivityMonitorPanel = makeActivityMonitorPanel(api);

  return function InstrumentsPanel() {
    const [tab, setTab] = useState<Instrument>('radar');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: 320, background: 'rgba(10,10,11,0.92)', borderRadius: 12, overflow: 'hidden', border: `1px solid ${ACCENT}33` }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${ACCENT}22` }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '9px 4px', background: active ? 'rgba(255,232,31,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                  borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'radar' && <RadarPanel />}
        {tab === 'scanner' && <ScannerPanel />}
        {tab === 'activity' && <ActivityMonitorPanel />}
      </div>
    );
  };
};
