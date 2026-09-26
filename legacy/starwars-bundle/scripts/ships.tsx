// Panneau sidebar "Vaisseaux" — accès rapide en jeu (comme le radar), pour TOUS.
// Fiche = layout simple en deux colonnes : IMAGE 50 % à gauche (entière, jamais recadrée),
// toutes les STATS en grille à droite + bouton MJ. Joueurs : lecture seule ; le MJ donne/retire
// un vaisseau ici, et édite les stats dans son panneau natif d'entités de groupe.
import React, { useEffect, useState } from 'react';

export interface ShipDoc {
  id: string;
  label?: string;
  image?: string;
  acquis?: boolean;
  values?: Record<string, number | string>;
}

export const num = (v: unknown): number => (typeof v === 'number' && !isNaN(v) ? v : 0);

const StatTile = ({ label, value }: { label: string; value: string | number }) => (
  <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 4px', textAlign: 'center', background: 'var(--bg-darker)', minWidth: 0 }}>
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </div>
    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{String(value)}</div>
  </div>
);

/** Toutes les stats en grille (3 colonnes) : Sil/Vit/Man/Déf/Bl + Coque/Tension (+ Prix). */
export const StatGrid = ({ values, showPrice }: { values: Record<string, number | string>; showPrice?: boolean }) => {
  const man = num(values.maniabilite);
  const tiles: Array<[string, string | number]> = [
    ['Silhouette', values.silhouette ?? 0],
    ['Vitesse', values.vitesse ?? 0],
    ['Maniab.', man > 0 ? `+${man}` : man],
    ['Défense', values.defense ?? '0/0'],
    ['Blindage', values.blindage ?? 0],
    ['Coque', num(values.coqueMax)],
    ['Tension', num(values.tensionMax)],
  ];
  if (showPrice && num(values.prix) > 0) tiles.push(['Prix (cr)', num(values.prix).toLocaleString('fr-FR')]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {tiles.map(([label, value]) => <StatTile key={label} label={label} value={value} />)}
    </div>
  );
};

const Jauge = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color }}>{value}<span style={{ opacity: 0.5, fontSize: 10 }}> / {max}</span></span>
    </div>
    <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-darker)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`, background: color, transition: 'width 0.3s' }} />
    </div>
  </div>
);

/** Corps de fiche : image 50 % à gauche (entière), stats en grille à droite. */
const ShipBody = ({ ship, isMJ, onToggle }: { ship: ShipDoc; isMJ: boolean; onToggle: () => void }) => {
  const v = ship.values ?? {};
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {/* Image — 50 % */}
      <div style={{ flex: '1 1 240px', minWidth: 200, alignSelf: 'stretch', background: '#000', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, overflow: 'hidden' }}>
        {ship.image
          ? <img src={ship.image} alt="" style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
          : <span style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.5 }}>Pas d'image</span>}
      </div>
      {/* Stats — 50 % */}
      <div style={{ flex: '1 1 240px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ship.acquis && (
          <>
            <Jauge label="Coque" value={num(v.coque)} max={num(v.coqueMax)} color="#4ade80" />
            <Jauge label="Tension" value={num(v.tension)} max={num(v.tensionMax)} color="#facc15" />
          </>
        )}
        <StatGrid values={v} showPrice={!ship.acquis} />
        {isMJ && (
          <button
            onClick={onToggle}
            style={{
              marginTop: 'auto', alignSelf: 'flex-end', fontSize: 12, fontWeight: 700, padding: '7px 14px',
              borderRadius: 8, cursor: 'pointer',
              border: ship.acquis ? '1px solid var(--border-color)' : 'none',
              background: ship.acquis ? 'transparent' : 'var(--accent-brown)',
              color: ship.acquis ? 'var(--text-secondary)' : '#0a0a0b',
            }}
          >
            {ship.acquis ? 'Retirer du groupe' : 'Donner au groupe'}
          </button>
        )}
      </div>
    </div>
  );
};

/** Fabrique le composant d'onglet — api capturé en closure.
 *  showHeader=false quand le panneau est monté à l'intérieur du Codex (sous-nav qui fait déjà
 *  office de titre) — utilisé seul (ancien onglet sidebar), le header reste affiché par défaut. */
export const makeShipsPanel = (api: any, showHeader = true) => function ShipsPanel() {
  const [ships, setShips] = useState<ShipDoc[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => api.groupEntities.subscribe(setShips), []);

  const { isMJ } = api.getGameState();
  const fleet = ships.filter((s) => s.acquis);
  const catalog = ships.filter((s) => !s.acquis && (s.label ?? '') !== '');
  const setAcquis = (id: string, acquis: boolean) => api.groupEntities.update(id, { acquis });

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      {showHeader && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontFamily: 'var(--font-title)' }}>Vaisseaux</h2>
        </div>
      )}

      {/* ── Flotte du groupe ── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-brown)' }}>
          Flotte du groupe
        </span>
        {fleet.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.7 }}>
            Aucun vaisseau acquis{isMJ ? ' — donnez-en un depuis le catalogue.' : '.'}
          </p>
        )}
        {fleet.map((s) => (
          <div key={s.id} style={{ borderRadius: 12, border: '1px solid var(--accent-brown)', background: 'var(--bg-dark)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-title)' }}>{s.label || '(sans nom)'}</span>
            <ShipBody ship={s} isMJ={isMJ} onToggle={() => setAcquis(s.id, false)} />
          </div>
        ))}
      </div>

      {/* ── Catalogue ── */}
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Catalogue
        </span>
        {catalog.map((s) => {
          const open = expandedId === s.id;
          return (
            <div key={s.id} style={{ borderRadius: 10, border: `1px solid ${open ? 'var(--accent-brown)' : 'var(--border-color)'}`, background: open ? 'var(--bg-dark)' : 'transparent' }}>
              <button
                onClick={() => setExpandedId(open ? null : s.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 48, height: 36, borderRadius: 6, background: s.image ? '#000' : 'var(--bg-darker)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {s.image && <img src={s.image} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                </div>
                <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                {num(s.values?.prix) > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--accent-brown)', fontFamily: 'monospace', fontWeight: 700, flexShrink: 0 }}>{num(s.values?.prix).toLocaleString('fr-FR')} cr</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div style={{ padding: '4px 10px 10px' }}>
                  <ShipBody ship={s} isMJ={isMJ} onToggle={() => setAcquis(s.id, true)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
