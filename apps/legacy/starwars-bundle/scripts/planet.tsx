// Onglet "Planètes" — catalogue des lieux du système (api.locations, kind:'location', ex les 31
// mondes SWTOR seedés dans table.json). Chaque fiche affiche son image existante avec une bascule
// vers un globe 3D tournant à géographie procédurale (ctx.ui.RotatingEarth — d3-geo/d3-contour/
// simplex-noise réels, fournis par l'app car les scripts du bundle n'ont accès qu'à
// react/lucide-react, cf README) ; les mondes sans image affichent le globe directement.
import React, { useEffect, useState } from 'react';

const ACCENT = '#ffe81f'; // jaune Star Wars (accent du thème)

interface LocationDoc {
  id: string;
  name: string;
  description?: string;
  image?: string;
  values?: Record<string, string>;
}

/** Corps de fiche planète : image si dispo (bascule vers le globe), sinon globe direct. */
const makePlanetBody = (RotatingEarth: any) => function PlanetBody({ loc }: { loc: LocationDoc }) {
  const [showGlobe, setShowGlobe] = useState(!loc.image);
  const values = loc.values ?? {};
  const fields: Array<[string, string]> = [
    ['Système stellaire', values.systeme],
    ['Climat', values.climat],
    ['Population', values.population],
    ['Faction dominante', values.faction],
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', width: '100%', minHeight: 260, background: '#05070a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {showGlobe || !loc.image ? (
          <RotatingEarth seed={loc.name} width={320} height={260} />
        ) : (
          <img src={loc.image} alt="" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain' }} />
        )}
        {loc.image && (
          <button
            onClick={() => setShowGlobe((v: boolean) => !v)}
            style={{
              position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)',
              fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            {showGlobe ? "Voir l'image" : 'Voir le globe'}
          </button>
        )}
      </div>

      {loc.description && (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
          {loc.description}
        </p>
      )}

      {fields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 8px', background: 'var(--bg-darker)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 2 }}>
                {label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Fabrique le composant d'onglet — api/ui capturés en closure (le rail ne passe aucune prop).
 *  showHeader=false quand le panneau est monté à l'intérieur du Codex (sous-nav qui fait déjà
 *  office de titre) — utilisé seul (ancien onglet sidebar), le header reste affiché par défaut. */
export const makePlanetsPanel = (api: any, ui: any, showHeader = true) => {
  const PlanetBody = makePlanetBody(ui.RotatingEarth);

  return function PlanetsPanel() {
    const [locations, setLocations] = useState<LocationDoc[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    useEffect(() => api.locations.subscribe(setLocations), []);

    const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        {showHeader && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontFamily: 'var(--font-title)' }}>Planètes</h2>
          </div>
        )}

        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.7 }}>
              Aucune planète référencée pour l'instant.
            </p>
          )}
          {sorted.map((loc) => {
            const open = expandedId === loc.id;
            return (
              <div key={loc.id} style={{ borderRadius: 10, border: `1px solid ${open ? ACCENT : 'var(--border-color)'}`, background: open ? 'var(--bg-dark)' : 'transparent' }}>
                <button
                  onClick={() => setExpandedId(open ? null : loc.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: loc.image ? '#000' : 'var(--bg-darker)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: loc.image ? 'none' : `1px solid ${ACCENT}55` }}>
                    {loc.image
                      ? <img src={loc.image} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: 16 }}>🪐</span>}
                  </div>
                  <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={{ padding: '4px 10px 12px' }}>
                    <PlanetBody loc={loc} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
};
