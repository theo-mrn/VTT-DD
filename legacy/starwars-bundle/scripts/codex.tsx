// Onglet "Codex" — fusion des anciens onglets sidebar "Vaisseaux" et "Planètes" en un seul
// wiki galactique, avec sous-navigation interne (le rail sidebar n'a pas de notion de sous-onglets,
// cf SidebarTabContribution dans src/modules/types.ts — la bascule se fait donc ici, dans le panneau).
// Le contenu de chaque section reprend tel quel ships.tsx / planet.tsx (composants inchangés).
import React, { useState } from 'react';
import { Rocket, Globe2 } from 'lucide-react';
import { makeShipsPanel } from './ships';
import { makePlanetsPanel } from './planet';

type Section = 'ships' | 'planets';

const SECTIONS: Array<{ id: Section; label: string; icon: any }> = [
  { id: 'ships', label: 'Vaisseaux', icon: Rocket },
  { id: 'planets', label: 'Planètes', icon: Globe2 },
];

export const makeCodexPanel = (api: any, ui: any) => {
  const ShipsPanel = makeShipsPanel(api, false);
  const PlanetsPanel = makePlanetsPanel(api, ui, false);

  return function CodexPanel() {
    const [section, setSection] = useState<Section>('ships');

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                onClick={() => setSection(id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px 8px', background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-title)',
                  color: active ? 'var(--accent-brown)' : 'var(--text-secondary)',
                  borderBottom: `2px solid ${active ? 'var(--accent-brown)' : 'transparent'}`,
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {section === 'ships' ? <ShipsPanel /> : <PlanetsPanel />}
        </div>
      </div>
    );
  };
};
