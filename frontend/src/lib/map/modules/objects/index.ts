/**
 * Module « objets » de la carte (docs/carte.md § 10, Objets).
 *
 * - Sortes `object` et `decor` (couche `objects`, calque par défaut « Objets ») : image,
 *   gestes communs (glisser, poignées de rotation et de taille, verrou, masquage, « Visible
 *   pour… », dupliquer, ordre et calque), menu propre (taille, fouille, sorte).
 * - Outil « Objets » (I, MJ) : la bibliothèque (modèles d'objets de la campagne, image
 *   envoyée, zone à fouiller) au-dessus de la barre ; clic puis clic, ou glisser vers la carte.
 * - Inspecteur : propriétés de l'objet et fouille (portée, contenu du marché ou libre) pour le
 *   MJ ; « Fouiller » pour un joueur.
 * - Fouille des joueurs : fenêtre du contenu, « Prendre » ; le MJ est prévenu.
 */
import { Box } from 'lucide-react';
import { ObjectInspector } from '@/components/map/objects/object-inspector';
import { ObjectLibrary } from '@/components/map/objects/object-library';
import { ObjectsHost } from '@/components/map/objects/objects-host';
import { PlayerSearchSection } from '@/components/map/objects/player-search-section';
import { SearchInspector } from '@/components/map/objects/search-inspector';
import { isGm } from '../../engine/entities/entity-kind';
import type { MapModule } from '../../engine/map-engine';
import type { Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import { createSearchApi } from './api';
import { createObjectKinds } from './object-kind';
import { ObjectPlaceTool } from './place-tool';
import { isObjectEntity } from './placement';
import { attachSearchController, SearchController } from './search';
import { OBJECTS_COLLECTION, OBJECTS_TOOL_ID, type ObjectData } from './types';

/** Sans serveur (carte en lecture seule) : toute écriture est refusée. */
const readOnly: Persistence<MapDto> = {
  update: () => Promise.reject(new Error('Carte en lecture seule')),
};

export const objectsModule: MapModule = {
  id: 'objects',
  register(engine) {
    const { campaignId, mapId } = engine.store.getState();
    const search = new SearchController(engine, createSearchApi(campaignId, mapId), {
      notify: (message) => engine.notify(message),
    });
    const persistence = (engine.backend?.collection(OBJECTS_COLLECTION) ??
      readOnly) as Persistence<ObjectData>;
    const [objectKind, decorKind] = createObjectKinds(engine, {
      persistence,
      openSearch: (id) => search.open(id),
    });
    const single = (es: readonly { kind: { id: string } }[]) => es.length === 1;

    const cleanups = [
      attachSearchController(engine, search),
      engine.registerKind(objectKind),
      engine.registerKind(decorKind),
      engine.registerTool({
        id: OBJECTS_TOOL_ID,
        label: 'Objets',
        icon: Box,
        shortcut: { code: 'KeyI', label: 'I' },
        order: 40,
        available: isGm,
        create: () => new ObjectPlaceTool(),
        options: ObjectLibrary,
      }),
      engine.registerInspectorSection({
        id: 'object',
        title: 'Objet',
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every(isObjectEntity),
        component: ObjectInspector,
      }),
      engine.registerInspectorSection({
        id: 'object-search',
        title: 'Fouille',
        order: 20,
        appliesTo: (es, viewer) => isGm(viewer) && single(es) && es.every(isObjectEntity),
        component: SearchInspector,
      }),
      engine.registerInspectorSection({
        id: 'object-search-player',
        title: 'Fouille',
        order: 20,
        appliesTo: (es, viewer) =>
          viewer.role === 'player' &&
          single(es) &&
          es.every((e) => isObjectEntity(e) && (e.data as ObjectData).searchable === true),
        component: PlayerSearchSection,
      }),
      engine.registerToolbarItem({
        id: 'objects-host',
        slot: 'end',
        order: 100,
        available: (viewer) => viewer.role !== 'spectator',
        component: ObjectsHost,
      }),
    ];
    return () => {
      for (const c of cleanups.reverse()) c();
    };
  },
};
