// Onglet "Vaisseaux" du drawer Recherche unifiée de la carte — MJ uniquement : glisser un vaisseau
// (flotte ou catalogue) sur la carte comme token, exactement comme un objet (juste l'image + le
// nom ici). Les VRAIES stats n'apparaissent qu'UNE FOIS le vaisseau posé sur la carte : le menu
// contextuel natif de l'app (ObjectContextMenu, onglet Stats) les résout déjà en direct depuis
// Salle/{roomId}/groupEntities au clic sur le token — rien à dupliquer ici. Le drop lui-même
// (création du token référençant l'entité) est géré nativement par l'app via le format dataTransfer
// 'application/json' { type: 'group_entity_template', entityId, ... }.
import React, { useEffect, useState } from 'react';

interface ShipDoc {
  id: string;
  label?: string;
  image?: string;
  acquis?: boolean;
}

/** Fabrique le composant d'onglet — api capturé en closure. */
export const makeDeployShipsPanel = (api: any) => function DeployShipsPanel() {
  const [ships, setShips] = useState<ShipDoc[]>([]);
  useEffect(() => api.groupEntities.subscribe(setShips), []);

  const fleet = ships.filter((s) => s.acquis);
  const catalog = ships.filter((s) => !s.acquis && (s.label ?? '') !== '');

  const handleDragStart = (e: React.DragEvent, ship: ShipDoc) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'group_entity_template',
      entityId: ship.id,
      label: ship.label,
      image: ship.image,
    }));
  };

  const ShipCard = ({ ship }: { ship: ShipDoc }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, ship)}
      className="group relative bg-[#1e1e1e] border border-[#333] rounded-xl p-3 cursor-move hover:border-[#80c0a0] hover:shadow-xl hover:shadow-[#80c0a0]/10 transition-all duration-200 flex flex-col items-center gap-2.5"
    >
      <div className="w-full aspect-square flex items-center justify-center p-2.5 bg-[#141414] rounded-lg overflow-hidden border border-[#2a2a2a] group-hover:border-[#333] transition-colors">
        {ship.image ? (
          <img
            src={ship.image}
            alt={ship.label || ''}
            className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-200"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] text-gray-600">Pas d'image</span>
        )}
      </div>
      <div className="w-full text-center">
        <span className="text-[10px] text-gray-400 font-medium truncate block group-hover:text-[#80c0a0] transition-colors uppercase tracking-wider">
          {ship.label || '(sans nom)'}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontFamily: 'var(--font-title)' }}>Vaisseaux</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>
          Glisser sur la carte — les stats apparaissent une fois posé
        </p>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-brown)' }}>
          Flotte du groupe
        </span>
        {fleet.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.7 }}>Aucun vaisseau acquis.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {fleet.map((s) => <ShipCard key={s.id} ship={s} />)}
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Catalogue
        </span>
        {catalog.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.7 }}>Catalogue vide.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {catalog.map((s) => <ShipCard key={s.id} ship={s} />)}
          </div>
        )}
      </div>
    </div>
  );
};
