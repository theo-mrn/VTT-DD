'use client';

/**
 * Présence du module « objets » à la table (entrée de barre d'outils sans bouton) :
 *
 * - joueur : « Fouiller » flotte au-dessus d'un objet à fouiller qu'il a cliqué (grisé s'il est
 *   trop loin), et la fenêtre de fouille ; la fiche du personnage qui a pris un objet est relue ;
 * - MJ : un toast quand un joueur fouille (`map_object.searched`) ou prend quelque chose
 *   (`map_object.looted`).
 *
 * « Fouiller » suit l'objet sans re-rendre React : sa position est écrite dans le DOM à chaque
 * image rendue par la carte (`engine.onFrame`), seulement quand elle change.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { MapObjectLootedPayload, MapObjectSearchedPayload } from '@vtt/contracts';
import { PackageSearch } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { quantityLabel } from '@/lib/map/modules/objects/contents';
import { reachOf } from '@/lib/map/modules/objects/object-kind';
import { isObjectEntity } from '@/lib/map/modules/objects/placement';
import { searchControllerOf, type SearchController } from '@/lib/map/modules/objects/search';
import { OBJECTS_COLLECTION, type ObjectData } from '@/lib/map/modules/objects/types';
import { clesPersonnages } from '@/lib/personnages';
import { useCampaignEvents } from '@/lib/realtime';
import { useMapState, useSelectionIds } from '../engine-context';
import { SearchDialog } from './search-dialog';

export function ObjectsHost({ engine }: { engine: MapEngine }) {
  const controller = searchControllerOf(engine);
  const role = engine.viewer.role;
  return (
    <>
      {role === 'gm' && <GmNotices engine={engine} />}
      {role === 'player' && controller && (
        <>
          <SearchPill engine={engine} controller={controller} />
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

/** « Fouiller » au-dessus de l'objet à fouiller sélectionné par le joueur. */
function SearchPill({ engine, controller }: { engine: MapEngine; controller: SearchController }) {
  const ids = useSelectionIds();
  const id = ids.length === 1 ? ids[0]! : null;
  const object = useMapState((s) =>
    id ? (s.collections[OBJECTS_COLLECTION]?.get(id) as ObjectData | undefined) : undefined,
  );
  const tokens = useMapState((s) => s.collections.tokens);
  const searching = useStore(controller.state, (s) => s.objectId !== null);
  const entity = id ? engine.entity(id) : undefined;
  const shown = !!object && object.searchable === true && !!entity && isObjectEntity(entity);
  const inRange = useMemo(
    () => (object && shown ? reachOf(engine, object).some((r) => r.inRange) : false),
    // La portée suit les tokens
    [engine, object, shown, tokens],
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shown || searching || !id) return;
    let lastX = NaN;
    let lastY = NaN;
    let lastVisible: boolean | null = null;
    const place = () => {
      const el = ref.current;
      const e = engine.entity(id);
      if (!el) return;
      const visible = !!e?.display?.visible && !e.state.dragging;
      if (visible !== lastVisible) {
        lastVisible = visible;
        el.style.visibility = visible ? 'visible' : 'hidden';
      }
      if (!e || !visible) return;
      const b = e.bounds();
      const p = engine.camera.worldToScreen({ x: b.x + b.width / 2, y: b.y });
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x === lastX && y === lastY) return;
      lastX = x;
      lastY = y;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 10px))`;
    };
    place();
    const off = engine.onFrame(() => {
      place();
    });
    return off;
  }, [engine, id, shown, searching]);

  const host = engine.canvas?.parentElement?.parentElement;
  if (!shown || searching || !host || !id) return null;
  return createPortal(
    <div
      ref={ref}
      className="pointer-events-auto absolute left-0 top-0 z-10"
      style={{ visibility: 'hidden' }}
    >
      <Button
        size="sm"
        variant={inRange ? 'default' : 'secondary'}
        disabled={!inRange}
        title={inRange ? undefined : 'Trop loin : approchez un de vos personnages.'}
        onClick={() => controller.open(id)}
        className="shadow-elevated"
      >
        <PackageSearch />
        {inRange ? 'Fouiller' : 'Trop loin'}
      </Button>
    </div>,
    host,
  );
}
