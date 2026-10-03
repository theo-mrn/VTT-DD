'use client';

/**
 * La carte à la table : choisit la scène à afficher (`useTableMap`) et la monte dans la scène
 * centrale (`MapStage`). Le moteur et PixiJS ne sont chargés que côté client, dans leur propre
 * morceau de code. Sans scène, la toile d'attente de la table.
 */
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { AttackMenuHost } from '@/components/combat/attack/attack-menu-host';
import { useTable } from '@/components/table/contexte';
import { MapStage } from '@/components/table/map-stage';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { useTableMap } from './use-table-map';

const MapCanvas = dynamic(() => import('./map-canvas'), { ssr: false });

export function TableMap() {
  const { campagne, moi, gm, herosId } = useTable();
  const personnages = usePersonnagesCampagne(campagne.id);

  // Mes personnages (possédés ou incarnés), celui que j'incarne d'abord
  const characterIds = useMemo(() => {
    const mine = campagne.characters
      .filter((c) => c.ownerId === moi.userId || c.playedBy === moi.userId)
      .map((c) => c.characterId);
    return [...new Set([...(herosId ? [herosId] : []), ...mine])];
  }, [campagne.characters, moi.userId, herosId]);

  const target = useTableMap({ campaignId: campagne.id, gm, characterIds });

  const viewer = useMemo<MapViewer>(
    () => ({ userId: moi.userId, role: gm ? 'gm' : moi.role, characterIds }),
    [moi.userId, moi.role, gm, characterIds],
  );

  // Personnages des joueurs (« Visible pour… ») et noms des membres (curseurs)
  const characters = useMemo(() => {
    const names = new Map((personnages.data ?? []).map((p) => [p.id, p.name]));
    return campagne.characters
      .filter((c) => c.side === 'players')
      .map((c) => ({ id: c.characterId, name: names.get(c.characterId) ?? 'Personnage' }));
  }, [campagne.characters, personnages.data]);
  const members = useMemo(
    () => campagne.members.map((m) => ({ userId: m.userId, name: m.name })),
    [campagne.members],
  );
  // Joueurs et spectateurs, avec les personnages qu'ils possèdent ou incarnent (vision)
  const players = useMemo(
    () =>
      campagne.members
        .filter((m) => m.role !== 'gm')
        .map((m) => ({
          userId: m.userId,
          name: m.name,
          characterIds: campagne.characters
            .filter((c) => c.ownerId === m.userId || c.playedBy === m.userId)
            .map((c) => c.characterId),
        })),
    [campagne.members, campagne.characters],
  );

  let empty = 'Le MJ n’a pas encore ouvert de scène.';
  if (target.loading) empty = 'Ouverture de la scène…';
  else if (gm && target.maps.length)
    empty = 'Aucune scène ouverte : choisissez-en une dans Scènes (E).';
  else if (gm) empty = 'Aucune scène : créez la première dans Scènes (E).';

  return (
    <>
      <MapStage backdropUrl={campagne.coverUrl} seed={campagne.name} emptyMessage={empty}>
        {target.mapId ? (
          <MapCanvas
            key={target.mapId}
            campaignId={campagne.id}
            mapId={target.mapId}
            viewer={viewer}
            characters={characters}
            members={members}
            players={players}
          />
        ) : null}
      </MapStage>
      {/* Menu d'attaque (plein écran), avec ou sans scène ouverte */}
      <AttackMenuHost campaignId={campagne.id} />
    </>
  );
}
