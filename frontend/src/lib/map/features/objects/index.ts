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
 * - Fouille des joueurs : fenêtre du contenu, « Prendre » ; le MJ est prévenu. Un objet à
 *   fouiller sélectionné montre sa zone de portée.
 */
import { Box } from 'lucide-react';
import { ObjectInspector } from './ui/object-inspector';
import { ObjectLibraryPanel } from './ui/object-library';
import { ObjectsHost } from './ui/objects-host';
import { PlayerSearchSection } from './ui/player-search-section';
import { SearchInspector } from './ui/search-inspector';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapModule } from '@/lib/map/engine/map-engine';
import type { Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { createSearchApi } from './engine/api';
import { createObjectKinds } from './engine/object-kind';
import { ObjectPlaceTool } from './engine/place-tool';
import { isObjectEntity } from './engine/placement';
import { mountReachRing } from './engine/reach-ring';
import { attachSearchController, SearchController } from './engine/search';
import { OBJECTS_COLLECTION, OBJECTS_TOOL_ID, type ObjectData } from './engine/types';

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
      mountReachRing(engine),
      engine.registerTool({
        id: OBJECTS_TOOL_ID,
        label: 'Objets',
        icon: Box,
        shortcut: { code: 'KeyI', label: 'I' },
        order: 40,
        available: isGm,
        create: () => new ObjectPlaceTool(),
      }),
      // Bibliothèque : panneau déplaçable à gauche, tant que l'outil est actif
      engine.registerOverlay({
        id: 'object-library',
        slot: 'left',
        order: 15,
        available: isGm,
        component: ObjectLibraryPanel,
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
      // Fouille des joueurs (« Fouiller », fenêtre) et avis du MJ : surcouche sans emplacement
      engine.registerOverlay({
        id: 'objects-host',
        slot: 'none',
        available: (viewer) => viewer.role !== 'spectator',
        component: ObjectsHost,
      }),
    ];
    return () => {
      for (const c of cleanups.toReversed()) c();
    };
  },
};
