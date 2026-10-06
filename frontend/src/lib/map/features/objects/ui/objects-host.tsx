'use client';

/**
 * Présence du module « objets » à la table (surcouche sans emplacement, `registerOverlay`) :
 *
 * - joueur : la fenêtre de fouille (« Fouiller » est l'action principale de la barre de la
 *   sélection, `components/map/selection-bar.tsx`) ; la fiche du personnage qui a pris un objet
 *   est relue ;
 * - MJ : un toast quand un joueur fouille (`map_object.searched`) ou prend quelque chose
 *   (`map_object.looted`).
 */
import { useQueryClient } from '@tanstack/react-query';
import type { MapObjectLootedPayload, MapObjectSearchedPayload } from '@vtt/contracts';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { quantityLabel } from '../engine/contents';
import { searchControllerOf, type SearchController } from '../engine/search';
import { clesPersonnages } from '@/lib/personnages';
import { useCampaignEvents } from '@/lib/realtime';
import { SearchDialog } from './search-dialog';

export function ObjectsHost({ engine }: Readonly<{ engine: MapEngine }>) {
  const controller = searchControllerOf(engine);
  const role = engine.viewer.role;
  return (
    <>
      {role === 'gm' && <GmNotices engine={engine} />}
      {role === 'player' && controller && (
        <>
          <SearchDialog engine={engine} controller={controller} />
          <RefreshTaken controller={controller} />
        </>
      )}
    </>
  );
}

/** Toasts du MJ : un joueur fouille, un joueur prend. */
function GmNotices({ engine }: { engine: MapEngine }) {
  const campaignId = engine.store.getState().campaignId;
  const nameOf = (characterId: string) =>
    engine.directory.characters().find((c) => c.id === characterId)?.name ?? 'Un personnage';
  useCampaignEvents(campaignId, ['map_object.searched', 'map_object.looted'], (e) => {
    if (e.redacted) return;
    const type = e.event.type;
    const p = e.event.payload as unknown as MapObjectSearchedPayload | MapObjectLootedPayload;
    if (p.userId === engine.viewer.userId) return;
    const object = p.name ? `« ${p.name} »` : 'un objet';
    if (type === 'map_object.searched') toast(`${nameOf(p.characterId)} fouille ${object}.`);
    else if ('item' in p)
      toast(`${nameOf(p.characterId)} a pris ${quantityLabel(p.item.name, p.item.quantity)}.`, {
        description:
          p.remaining > 0
            ? `Dans ${object} : il en reste ${p.remaining}.`
            : `Dans ${object} : il n’en reste plus.`,
      });
  });
  return null;
}

/** Fiche du personnage relue après une prise (son inventaire a changé). */
function RefreshTaken({ controller }: { controller: SearchController }) {
  const client = useQueryClient();
  useEffect(
    () =>
      controller.onTaken((characterId) => {
        void client.invalidateQueries({ queryKey: clesPersonnages.un(characterId) });
      }),
    [controller, client],
  );
  return null;
}
